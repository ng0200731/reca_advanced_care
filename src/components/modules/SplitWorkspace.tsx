"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { SplitConfiguration, SplitRegion, SplitContentSource } from "@/lib/types";
import { simulateOverflow, applyFixedContentOption } from "@/lib/splitSimulation";
import { getPreviewCanvasFontPt } from "@/lib/splitTextSizing";
import type { SimulatedRegion } from "@/lib/splitSimulation";
import { getTextLineHeight, getTextLines } from "@/lib/textLayout";
import { jsPDF } from "jspdf";

type SavedLayout = {
  id: string;
  name: string;
  details: {
    widthMm: number;
    heightMm: number;
    orientation: string;
    cuttingType?: string;
    loopFoldOrientation?: "vertical" | "horizontal";
    loopMidForm?: boolean;
    loopFoldDistanceMm?: number;
    paddingTop: number;
    paddingRight: number;
    paddingBottom: number;
    paddingLeft: number;
    sideType?: string;
    paddingR2Top?: number;
    paddingR2Right?: number;
    paddingR2Bottom?: number;
    paddingR2Left?: number;
    viewMode?: string;
    isBackFlipped?: boolean;
  } | null;
};

type SavedSplit = {
  id: string;
  name: string;
  layoutId: string;
  layout: { name: string };
  updatedAt: string;
};

type SavedFont = {
  id: number;
  font_name: string;
  filename?: string;
  file_path: string;
};

type TranslationTable = {
  id: number;
  table_name: string;
};

type DrawSnap = { x: number; y: number; kind: "corner" | "edge" | null };
type PaddingBox = { top: number; right: number; bottom: number; left: number };
type PaddingGuideRect = { x: number; y: number; w: number; h: number };

type DragState =
  | { type: "draw"; side: "front" | "back"; startX: number; startY: number; currentX: number; currentY: number; startSnap: DrawSnap; endSnap: DrawSnap }
  | { type: "move"; regionId: string; offsetX: number; offsetY: number }
  | { type: "resize"; regionId: string; handle: string; startX: number; startY: number }
  | null;

const MAX_REGIONS = 10;
const SNAP_THRESHOLD_PX = 8;

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getLayoutSize(layout: SavedLayout | null): { widthMm: number; heightMm: number } {
  if (!layout?.details) return { widthMm: 0, heightMm: 0 };
  const d = layout.details;
  const isLandscape = d.orientation === "landscape";
  return {
    widthMm: isLandscape ? d.heightMm : d.widthMm,
    heightMm: isLandscape ? d.widthMm : d.heightMm,
  };
}

export default function SplitWorkspace() {
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [savedSplits, setSavedSplits] = useState<SavedSplit[]>([]);
  const [fonts, setFonts] = useState<SavedFont[]>([]);
  const [translations, setTranslations] = useState<TranslationTable[]>([]);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"editor" | "configs">("editor");

  const [config, setConfig] = useState<SplitConfiguration>({
    name: "",
    layoutId: "",
    fontSizePt: 8,
    allowSplitText: true,
    connectionText: "-",
    imageOpacity: 0.3,
    regions: [],
    contentSources: [],
  });

  const [selectedLayout, setSelectedLayout] = useState<SavedLayout | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const [activeSide, setActiveSide] = useState<"front" | "back">("front");
  const [drag, setDrag] = useState<DragState>(null);
  const [scale, setScale] = useState(4);
  const [showImage, setShowImage] = useState(true);
  const [simulation, setSimulation] = useState<ReturnType<typeof simulateOverflow> | null>(null);
  const [showFixedDialog, setShowFixedDialog] = useState(false);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadingSplitId, setLoadingSplitId] = useState<string | null>(null);
  const [showContextPopup, setShowContextPopup] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [simViewMode, setSimViewMode] = useState<"side-by-side" | "top-bottom">("side-by-side");
  const [viewLabelIndex, setViewLabelIndex] = useState(0);
  const [simScale, setSimScale] = useState(1);
  const [simPan, setSimPan] = useState({ x: 0, y: 0 });
  const simDragRef = useRef<{ active: boolean; startX: number; startY: number; panX: number; panY: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // React attaches wheel listeners as passive, so e.preventDefault() in a JSX
  // onWheel is ignored and the page scrolls while zooming. Attach a native
  // non-passive listener via a callback ref so preventDefault() actually works
  // and the canvas zooms without moving the surrounding scroll container.
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const canvasWheelRef = useCallback((el: HTMLDivElement | null) => {
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current();
      wheelCleanupRef.current = null;
    }
    if (el) {
      const handler = (e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.5 : 0.5;
        setScale((s) => Math.max(2, Math.min(10, s + delta)));
      };
      el.addEventListener("wheel", handler, { passive: false });
      wheelCleanupRef.current = () => el.removeEventListener("wheel", handler);
    }
  }, []);

  const { widthMm, heightMm } = useMemo(() => getLayoutSize(selectedLayout), [selectedLayout]);

  const padding = useMemo(() => {
    if (!selectedLayout?.details) return { top: 0, right: 0, bottom: 0, left: 0 };
    const d = selectedLayout.details;
    return {
      top: d.paddingTop,
      right: d.paddingRight,
      bottom: d.paddingBottom,
      left: d.paddingLeft,
    };
  }, [selectedLayout]);

  const getPadding = (side: "front" | "back"): PaddingBox => {
    if (!selectedLayout?.details) return padding;
    const d = selectedLayout.details;
    if (side === "back" && d.paddingR2Top !== undefined) {
      return {
        top: d.paddingR2Top,
        right: d.paddingR2Right ?? 0,
        bottom: d.paddingR2Bottom ?? 0,
        left: d.paddingR2Left ?? 0,
      };
    }
    return padding;
  };

  const getFoldRegion2Padding = (): PaddingBox => {
    const d = selectedLayout?.details;
    return {
      top: d?.paddingR2Top ?? 0,
      right: d?.paddingR2Right ?? 0,
      bottom: d?.paddingR2Bottom ?? 0,
      left: d?.paddingR2Left ?? 0,
    };
  };

  const getFoldBasePosition = () => {
    const details = selectedLayout?.details;
    if (!details || details.cuttingType !== "loop" || !details.loopFoldOrientation) {
      return null;
    }

    const isVertical = details.loopFoldOrientation === "vertical";
    const distanceMm = details.loopMidForm
      ? (isVertical ? widthMm : heightMm) / 2
      : details.loopFoldDistanceMm ?? (isVertical ? widthMm : heightMm) / 2;

    return {
      orientation: details.loopFoldOrientation,
      distanceMm,
    } as const;
  };

  const getFoldGuidePosition = (side: "front" | "back") => {
    const details = selectedLayout?.details;
    const fold = getFoldBasePosition();
    if (!details || !fold) {
      return null;
    }

    const isBackFlipped = side === "back" && !!details.isBackFlipped;
    const isVertical = fold.orientation === "vertical";
    const distance = isBackFlipped
      ? (isVertical ? widthMm : heightMm) - fold.distanceMm
      : fold.distanceMm;

    return {
      orientation: fold.orientation,
      distanceMm: distance,
    } as const;
  };

  const getFoldGuide = (side: "front" | "back") => {
    const fold = getFoldGuidePosition(side);
    if (!fold) {
      return null;
    }

    if (fold.orientation === "vertical") {
      const foldX = mmToPx(fold.distanceMm);
      return {
        x1: foldX,
        y1: 0,
        x2: foldX,
        y2: mmToPx(heightMm),
      };
    }

    const foldY = mmToPx(fold.distanceMm);
    return {
      x1: 0,
      y1: foldY,
      x2: mmToPx(widthMm),
      y2: foldY,
    };
  };

  const getFoldSnapTargets = (side: "front" | "back") => {
    const fold = getFoldGuidePosition(side);
    if (!fold) {
      return null;
    }

    if (fold.orientation === "vertical") {
      return {
        x: fold.distanceMm,
        y: null,
      };
    }

    return {
      x: null,
      y: fold.distanceMm,
    };
  };

  const fetchData = useCallback(async () => {
    try {
      const [layoutsRes, splitsRes, fontsRes, transRes] = await Promise.all([
        fetch("/api/layouts"),
        fetch("/api/splits"),
        fetch("/api/fonts"),
        fetch("/api/translations"),
      ]);
      const layouts = await layoutsRes.json();
      const splits = await splitsRes.json();
      const fontsData = await fontsRes.json();
      const transData = await transRes.json();
      setSavedLayouts(layouts);
      setSavedSplits(splits);
      setFonts(fontsData.success && Array.isArray(fontsData.fonts) ? fontsData.fonts : []);
      setTranslations(transData.success ? transData.translations : []);
    } catch {
      setMessage("Failed to load workspace data");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!config.fontId || fonts.length === 0) return;
    const font = fonts.find((f) => String(f.id) === config.fontId);
    if (!font) return;
    // Load via the FontFace API using the font's ACTUAL NAME (font.font_name),
    // not a generic alias. The old "SplitFont" alias breaks symbol fonts because
    // the browser can't map the alias to the real font family inside the TTF.
    let cancelled = false;
    const face = new FontFace(font.font_name, `url(/api/fonts/file/${font.id})`);
    face
      .load()
      .then((loaded) => {
        if (!cancelled) document.fonts.add(loaded);
      })
      .catch((err) => console.warn("Split font load failed:", err));
    return () => {
      cancelled = true;
      try {
        document.fonts.delete(face);
      } catch {
        /* face may not have been added */
      }
    };
  }, [config.fontId, fonts]);

  const parseSideImage = (imageData: string | undefined, side: "front" | "back"): string | undefined => {
    if (!imageData) return undefined;
    try {
      const parsed = JSON.parse(imageData);
      if (typeof parsed === "object" && parsed !== null) {
        return side === "front" ? parsed.front : parsed.back;
      }
    } catch {
      // legacy: treat the whole value as the front image
    }
    return side === "front" ? imageData : undefined;
  };

  const setSideImage = (side: "front" | "back", data: string | undefined) => {
    setConfig((c) => {
      const front = side === "front" ? data : parseSideImage(c.imageData, "front");
      const back = side === "back" ? data : parseSideImage(c.imageData, "back");
      if (!front && !back) return { ...c, imageData: undefined };
      return { ...c, imageData: JSON.stringify({ front, back }) };
    });
  };

  const loadImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setSideImage(activeSide, reader.result as string);
      setMessage(`Image pasted on ${activeSide}`);
    };
    reader.readAsDataURL(file);
  }, [activeSide]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) loadImageFile(file);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [loadImageFile]);

  useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = () => setShowExportMenu(false);
    const id = setTimeout(() => {
      window.addEventListener("click", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("click", handleClickOutside);
    };
  }, [showExportMenu]);

  const mmToPx = (mm: number) => mm * scale;
  const pxToMm = (px: number) => px / scale;
  const ptToMm = (pt: number) => (pt * 25.4) / 72;
  const getPreviewFontPt = (fontSizePt: number) => getPreviewCanvasFontPt(fontSizePt, scale);

  const getMouseMm = (e: React.MouseEvent | MouseEvent): { x: number; y: number } => {
    const target = (e as React.MouseEvent).currentTarget;
    const svg = target instanceof SVGSVGElement ? target : svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const pxX = (e as MouseEvent).clientX - rect.left;
    const pxY = (e as MouseEvent).clientY - rect.top;
    return { x: pxToMm(pxX), y: pxToMm(pxY) };
  };

  const snapValue = (value: number, targets: number[]): number => {
    for (const t of targets) {
      if (Math.abs(value - t) * scale < SNAP_THRESHOLD_PX) return t;
    }
    return value;
  };

  const clampMm = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

  const getInsetPaddingRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    pad: PaddingBox
  ): PaddingGuideRect | null => {
    if (w <= 0 || h <= 0 || pad.left + pad.right >= w || pad.top + pad.bottom >= h) {
      return null;
    }

    return {
      x: x + pad.left,
      y: y + pad.top,
      w: w - pad.left - pad.right,
      h: h - pad.top - pad.bottom,
    };
  };

  const mirrorFoldPaddingRect = (
    rect: PaddingGuideRect,
    side: "front" | "back",
    orientation: "vertical" | "horizontal"
  ): PaddingGuideRect => {
    const shouldMirror = side === "back" && !!selectedLayout?.details?.isBackFlipped;
    if (!shouldMirror) {
      return rect;
    }

    if (orientation === "vertical") {
      return { ...rect, x: widthMm - rect.x - rect.w };
    }

    return {
      ...rect,
      x: widthMm - rect.x - rect.w,
      y: heightMm - rect.y - rect.h,
    };
  };

  const getPaddingGuideRects = (side: "front" | "back"): PaddingGuideRect[] => {
    const fold = getFoldBasePosition();
    if (!fold) {
      const fullRect = getInsetPaddingRect(0, 0, widthMm, heightMm, getPadding(side));
      return fullRect ? [fullRect] : [];
    }

    const r1Pad = padding;
    const r2Pad = getFoldRegion2Padding();
    const guides: PaddingGuideRect[] = [];

    const pushGuide = (x: number, y: number, w: number, h: number, pad: PaddingBox) => {
      const rect = getInsetPaddingRect(x, y, w, h, pad);
      if (rect) {
        guides.push(mirrorFoldPaddingRect(rect, side, fold.orientation));
      }
    };

    if (fold.orientation === "vertical") {
      const foldX = clampMm(fold.distanceMm, 0, widthMm);
      pushGuide(0, 0, foldX, heightMm, r1Pad);
      pushGuide(foldX, 0, widthMm - foldX, heightMm, r2Pad);
    } else {
      const foldY = clampMm(fold.distanceMm, 0, heightMm);
      pushGuide(0, 0, widthMm, foldY, r1Pad);
      pushGuide(0, foldY, widthMm, heightMm - foldY, r2Pad);
    }

    return guides;
  };

  const getBestPaddingGuideRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    side: "front" | "back"
  ): PaddingGuideRect => {
    const rects = getPaddingGuideRects(side);
    if (rects.length === 0) {
      return { x: 0, y: 0, w: widthMm, h: heightMm };
    }

    const cx = x + Math.max(1, w) / 2;
    const cy = y + Math.max(1, h) / 2;
    const containing = rects.find((pr) => cx >= pr.x && cx <= pr.x + pr.w && cy >= pr.y && cy <= pr.y + pr.h);
    if (containing) {
      return containing;
    }

    return rects.reduce((best, pr) => {
      const bestX = clampMm(cx, best.x, best.x + best.w);
      const bestY = clampMm(cy, best.y, best.y + best.h);
      const currentX = clampMm(cx, pr.x, pr.x + pr.w);
      const currentY = clampMm(cy, pr.y, pr.y + pr.h);
      const bestDist = Math.hypot(cx - bestX, cy - bestY);
      const currentDist = Math.hypot(cx - currentX, cy - currentY);
      return currentDist < bestDist ? pr : best;
    });
  };

  const getBezierConnectionPath = (sx: number, sy: number, tx: number, ty: number) => {
    const distance = Math.hypot(tx - sx, ty - sy);
    const offset = Math.max(20 / scale, distance * 0.35);
    return `M ${mmToPx(sx)} ${mmToPx(sy)} C ${mmToPx(sx)} ${mmToPx(sy + offset)}, ${mmToPx(tx)} ${mmToPx(ty - offset)}, ${mmToPx(tx)} ${mmToPx(ty)}`;
  };

  const getPathTotalLength = (sx: number, sy: number, tx: number, ty: number) => {
    // Approximate bezier length
    const p0 = { x: mmToPx(sx), y: mmToPx(sy) };
    const p1 = { x: mmToPx(sx), y: mmToPx(sy + Math.max(20 / scale, Math.hypot(tx - sx, ty - sy) * 0.35)) };
    const p2 = { x: mmToPx(tx), y: mmToPx(ty - Math.max(20 / scale, Math.hypot(tx - sx, ty - sy) * 0.35)) };
    const p3 = { x: mmToPx(tx), y: mmToPx(ty) };
    // Simple chord length approximation
    return Math.hypot(p3.x - p0.x, p3.y - p0.y) * 1.2;
  };

  const wouldCreateOverflowCycle = (sourceId: string, targetRegionId: string) => {
    const visited = new Set<string>();
    let current = targetRegionId;
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      const nextRegion = config.regions.find((r) => r.regionId === current);
      if (!nextRegion) break;
      if (nextRegion.id === sourceId) return true;
      current = nextRegion.overflowTargetId || "";
    }
    return false;
  };

  const isValidOverflowTarget = (source: SplitRegion, target: SplitRegion) => {
    if (source.id === target.id) return false;
    const usedByAnother = config.regions.some(
      (r) => r.id !== source.id && r.overflowTargetId === target.regionId
    );
    if (usedByAnother) return false;
    if (wouldCreateOverflowCycle(source.id, target.regionId)) return false;
    return true;
  };

  const constrainRect = (x: number, y: number, w: number, h: number, side: "front" | "back") => {
    const pr = getBestPaddingGuideRect(x, y, w, h, side);
    const nx = Math.max(pr.x, Math.min(x, pr.x + pr.w));
    const ny = Math.max(pr.y, Math.min(y, pr.y + pr.h));
    let nw = Math.max(1, w);
    let nh = Math.max(1, h);
    if (nx + nw > pr.x + pr.w) nw = pr.x + pr.w - nx;
    if (ny + nh > pr.y + pr.h) nh = pr.y + pr.h - ny;
    return { x: nx, y: ny, w: nw, h: nh };
  };

  const isInsidePadding = (x: number, y: number, side: "front" | "back") => {
    return getPaddingGuideRects(side).some((pr) => x >= pr.x && x <= pr.x + pr.w && y >= pr.y && y <= pr.y + pr.h);
  };

  const getNearestPaddingCorner = (x: number, y: number, side: "front" | "back"): { x: number; y: number } | null => {
    const thresholdMm = 5 / scale;
    const corners = getPaddingGuideRects(side).flatMap((pr) => [
      { x: pr.x, y: pr.y },
      { x: pr.x + pr.w, y: pr.y },
      { x: pr.x, y: pr.y + pr.h },
      { x: pr.x + pr.w, y: pr.y + pr.h },
    ]);
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const c of corners) {
      const dist = Math.hypot(x - c.x, y - c.y);
      if (dist <= thresholdMm && dist < bestDist) {
        best = c;
        bestDist = dist;
      }
    }
    return best;
  };

  const getNearestPaddingEdge = (x: number, y: number, side: "front" | "back"): { x: number; y: number } | null => {
    const thresholdMm = 5 / scale;
    const candidates = getPaddingGuideRects(side).flatMap((pr) => [
      { x: clampMm(x, pr.x, pr.x + pr.w), y: pr.y },
      { x: clampMm(x, pr.x, pr.x + pr.w), y: pr.y + pr.h },
      { x: pr.x, y: clampMm(y, pr.y, pr.y + pr.h) },
      { x: pr.x + pr.w, y: clampMm(y, pr.y, pr.y + pr.h) },
    ]);
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const p of candidates) {
      const dist = Math.hypot(x - p.x, y - p.y);
      if (dist <= thresholdMm && dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    return best;
  };

  const getNearestFoldGuide = (x: number, y: number, side: "front" | "back"): { x: number; y: number } | null => {
    const thresholdMm = 5 / scale;
    const foldGuide = getFoldGuide(side);

    if (!foldGuide) {
      return null;
    }

    const isVertical = Math.abs(foldGuide.x1 - foldGuide.x2) < 0.001;
    if (isVertical) {
      const foldX = pxToMm(foldGuide.x1);
      const clampedY = clampMm(y, 0, heightMm);
      const dist = Math.abs(x - foldX);
      return dist <= thresholdMm ? { x: foldX, y: clampedY } : null;
    }

    const foldY = pxToMm(foldGuide.y1);
    const clampedX = clampMm(x, 0, widthMm);
    const dist = Math.abs(y - foldY);
    return dist <= thresholdMm ? { x: clampedX, y: foldY } : null;
  };

  const snapToPadding = (x: number, y: number, side: "front" | "back"): DrawSnap => {
    const corner = getNearestPaddingCorner(x, y, side);
    if (corner) return { ...corner, kind: "corner" };
    const edge = getNearestPaddingEdge(x, y, side);
    if (edge) return { ...edge, kind: "edge" };
    const foldGuide = getNearestFoldGuide(x, y, side);
    if (foldGuide) return { ...foldGuide, kind: "edge" };
    return { x, y, kind: null };
  };

  const handleSvgMouseDown = (e: React.MouseEvent, side: "front" | "back") => {
    if (widthMm === 0) return;
    setActiveSide(side);
    const { x, y } = getMouseMm(e);

    // Check resize handles (4 corners + 4 edges) for the current side
    if (selectedRegionId) {
      const region = config.regions.find((r) => r.id === selectedRegionId && r.side === side);
      if (region) {
        const handles = [
          { name: "nw", x: region.x, y: region.y },
          { name: "n", x: region.x + region.widthMm / 2, y: region.y },
          { name: "ne", x: region.x + region.widthMm, y: region.y },
          { name: "w", x: region.x, y: region.y + region.heightMm / 2 },
          { name: "e", x: region.x + region.widthMm, y: region.y + region.heightMm / 2 },
          { name: "sw", x: region.x, y: region.y + region.heightMm },
          { name: "s", x: region.x + region.widthMm / 2, y: region.y + region.heightMm },
          { name: "se", x: region.x + region.widthMm, y: region.y + region.heightMm },
        ];
        for (const h of handles) {
          const dx = x - h.x;
          const dy = y - h.y;
          if (Math.sqrt(dx * dx + dy * dy) * scale < 8) {
            setDrag({ type: "resize", regionId: region.id, handle: h.name, startX: x, startY: y });
            return;
          }
        }
      }
    }

    // Check existing regions on this side
    const clickedRegion = [...config.regions]
      .reverse()
      .filter((r) => r.side === side)
      .find((r) => x >= r.x && x <= r.x + r.widthMm && y >= r.y && y <= r.y + regionHeightMm(r));
    if (clickedRegion) {
      if (selectedRegionId === clickedRegion.id) {
        // Already selected: start panning/moving
        setDrag({ type: "move", regionId: clickedRegion.id, offsetX: x - clickedRegion.x, offsetY: y - clickedRegion.y });
      } else {
        // First click selects and shows handles; drag again to move
        setSelectedRegionId(clickedRegion.id);
      }
      return;
    }

    // Start drawing — must begin inside the green dotted padding region
    const startSnap = snapToPadding(x, y, side);
    if (!isInsidePadding(startSnap.x, startSnap.y, side)) return;
    setSelectedRegionId(null);
    setDrag({
      type: "draw",
      side,
      startX: startSnap.x,
      startY: startSnap.y,
      currentX: startSnap.x,
      currentY: startSnap.y,
      startSnap,
      endSnap: startSnap,
    });
  };

  const regionHeightMm = (r: SplitRegion) => r.heightMm;

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const { x, y } = getMouseMm(e);

    if (drag.type === "draw") {
      const endSnap = snapToPadding(x, y, drag.side);
      setDrag({ ...drag, currentX: endSnap.x, currentY: endSnap.y, endSnap });
    } else if (drag.type === "move") {
      const region = config.regions.find((r) => r.id === drag.regionId);
      if (!region) return;
      let nx = x - drag.offsetX;
      let ny = y - drag.offsetY;
      const snapTargetsX = [0, widthMm - region.widthMm, widthMm];
      const snapTargetsY = [0, heightMm - region.heightMm, heightMm];
      const foldTargets = getFoldSnapTargets(region.side);
      if (foldTargets?.x !== null && foldTargets?.x !== undefined) {
        snapTargetsX.push(foldTargets.x, foldTargets.x - region.widthMm);
      }
      if (foldTargets?.y !== null && foldTargets?.y !== undefined) {
        snapTargetsY.push(foldTargets.y, foldTargets.y - region.heightMm);
      }
      const otherRects = config.regions.filter((r) => r.id !== region.id);
      for (const r of otherRects) {
        snapTargetsX.push(r.x, r.x + r.widthMm, r.x - region.widthMm, r.x + r.widthMm - region.widthMm);
        snapTargetsY.push(r.y, r.y + r.heightMm, r.y - region.heightMm, r.y + r.heightMm - region.heightMm);
      }
      for (const pr of getPaddingGuideRects(region.side)) {
        snapTargetsX.push(pr.x, pr.x + pr.w, pr.x - region.widthMm, pr.x + pr.w - region.widthMm);
        snapTargetsY.push(pr.y, pr.y + pr.h, pr.y - region.heightMm, pr.y + pr.h - region.heightMm);
      }
      nx = snapValue(nx, snapTargetsX);
      ny = snapValue(ny, snapTargetsY);
      // Keep the region inside the specific green dotted fold-panel box it is closest to.
      const pr = getBestPaddingGuideRect(nx, ny, region.widthMm, region.heightMm, region.side);
      const maxMoveX = pr.x + pr.w - region.widthMm;
      const maxMoveY = pr.y + pr.h - region.heightMm;
      const cx = maxMoveX >= pr.x ? Math.max(pr.x, Math.min(nx, maxMoveX)) : pr.x;
      const cy = maxMoveY >= pr.y ? Math.max(pr.y, Math.min(ny, maxMoveY)) : pr.y;
      updateRegion(drag.regionId, { x: cx, y: cy });
    } else if (drag.type === "resize") {
      const region = config.regions.find((r) => r.id === drag.regionId);
      if (!region) return;
      let nx = region.x;
      let ny = region.y;
      let nw = region.widthMm;
      let nh = region.heightMm;

      if (drag.handle.includes("w")) {
        nw = region.x + region.widthMm - x;
        nx = x;
      }
      if (drag.handle.includes("e")) {
        nw = x - region.x;
      }
      if (drag.handle.includes("n")) {
        nh = region.y + region.heightMm - y;
        ny = y;
      }
      if (drag.handle.includes("s")) {
        nh = y - region.y;
      }

      const snapTargetsX = [0, widthMm];
      const snapTargetsY = [0, heightMm];
      const foldTargets = getFoldSnapTargets(region.side);
      if (foldTargets?.x !== null && foldTargets?.x !== undefined) {
        snapTargetsX.push(foldTargets.x);
      }
      if (foldTargets?.y !== null && foldTargets?.y !== undefined) {
        snapTargetsY.push(foldTargets.y);
      }
      for (const r of config.regions.filter((r) => r.id !== region.id)) {
        snapTargetsX.push(r.x, r.x + r.widthMm);
        snapTargetsY.push(r.y, r.y + r.heightMm);
      }
      for (const pr of getPaddingGuideRects(region.side)) {
        snapTargetsX.push(pr.x, pr.x + pr.w);
        snapTargetsY.push(pr.y, pr.y + pr.h);
      }

      if (drag.handle.includes("w") || drag.handle.includes("e")) {
        const edgeX = drag.handle.includes("w") ? nx : nx + nw;
        const snapped = snapValue(edgeX, snapTargetsX);
        if (snapped !== edgeX) {
          if (drag.handle.includes("w")) {
            nw += nx - snapped;
            nx = snapped;
          } else {
            nw = snapped - nx;
          }
        }
      }
      if (drag.handle.includes("n") || drag.handle.includes("s")) {
        const edgeY = drag.handle.includes("n") ? ny : ny + nh;
        const snapped = snapValue(edgeY, snapTargetsY);
        if (snapped !== edgeY) {
          if (drag.handle.includes("n")) {
            nh += ny - snapped;
            ny = snapped;
          } else {
            nh = snapped - ny;
          }
        }
      }

      const constrained = constrainRect(nx, ny, nw, nh, region.side);
      updateRegion(drag.regionId, { x: constrained.x, y: constrained.y, widthMm: constrained.w, heightMm: constrained.h });
    }
  };

  const handleSvgMouseUp = () => {
    if (drag?.type === "draw") {
      const d = drag;
      const x = Math.min(d.startX, d.currentX);
      const y = Math.min(d.startY, d.currentY);
      const w = Math.abs(d.currentX - d.startX);
      const h = Math.abs(d.currentY - d.startY);

      if (w > 3 && h > 3 && config.regions.length < MAX_REGIONS) {
        const constrained = constrainRect(x, y, w, h, d.side);
        addRegion(constrained.x, constrained.y, constrained.w, constrained.h, d.side);
      }
    }
    setDrag(null);
  };

  const addRegion = (x: number, y: number, w: number, h: number, side: "front" | "back") => {
    const newRegion: SplitRegion = {
      id: generateId(),
      regionId: `R${config.regions.length + 1}`,
      side,
      x,
      y,
      widthMm: w,
      heightMm: h,
      type: "overflow",
    };
    const next = [...config.regions, newRegion];
    renumberRegions(next);
    setConfig((c) => ({ ...c, regions: next }));
    // New region is shown but not auto-selected; user must click it to resize/edit.
  };

  const renumberRegions = (regions: SplitRegion[]) => {
    const sorted = [...regions].sort((a, b) => {
      if (a.side !== b.side) return a.side === "front" ? -1 : 1;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
    sorted.forEach((r, idx) => {
      r.regionId = `R${idx + 1}`;
    });
  };

  const updateRegion = (id: string, patch: Partial<SplitRegion>) => {
    setConfig((c) => {
      const next = c.regions.map((r) => (r.id === id ? { ...r, ...patch } : r));
      if (patch.x !== undefined || patch.y !== undefined || patch.side !== undefined) {
        renumberRegions(next);
      }
      return { ...c, regions: next };
    });
  };

  const deleteRegion = (id: string) => {
    setConfig((c) => {
      const next = c.regions.filter((r) => r.id !== id);
      renumberRegions(next);
      return { ...c, regions: next };
    });
    if (selectedRegionId === id) setSelectedRegionId(null);
  };

  const addContentSource = (type: SplitContentSource["type"], regionId?: string) => {
    const defaultLabel = type === "manual" ? "Manual text" : "Translation table";
    const customLabel = prompt(`Enter a name for this ${type === "manual" ? "manual text" : "translation"}:`, defaultLabel);
    if (!customLabel) return; // User cancelled
    const newSource: SplitContentSource = {
      id: generateId(),
      type,
      label: customLabel.trim() || defaultLabel,
      manualText: type === "manual" ? "" : undefined,
    };
    setConfig((c) => {
      const next = { ...c, contentSources: [...c.contentSources, newSource] };
      if (regionId) {
        next.regions = c.regions.map((r) => (r.id === regionId ? { ...r, contentSourceId: newSource.id } : r));
      }
      return next;
    });
    if (regionId) setSelectedRegionId(regionId);
  };

  const updateContentSource = (id: string, patch: Partial<SplitContentSource>) => {
    setConfig((c) => ({
      ...c,
      contentSources: c.contentSources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const deleteContentSource = (id: string) => {
    setConfig((c) => ({
      ...c,
      contentSources: c.contentSources.filter((s) => s.id !== id),
      regions: c.regions.map((r) => (r.contentSourceId === id ? { ...r, contentSourceId: undefined } : r)),
    }));
  };

  const handleLayoutSelect = async (layoutId: string) => {
    try {
      const res = await fetch(`/api/layouts/${layoutId}`);
      if (!res.ok) throw new Error("Failed to load layout");
      const layout = await res.json();
      setSelectedLayout(layout);
      setConfig((c) => ({
        ...c,
        layoutId,
        name: `${layout.name} Split`,
        regions: [],
        contentSources: [],
        imageData: undefined,
        // Preserve font selection
      }));
      setActiveSide("front");
      setSimulation(null);
      setViewLabelIndex(0);
    } catch {
      setMessage("Failed to load layout");
    }
  };

  const handleRunSimulation = async () => {
    if (!selectedLayout?.details) return;
    const selectedFont = fonts.find((f) => String(f.id) === config.fontId);
    const fontName = selectedFont?.font_name || "sans-serif";
    if (typeof document !== "undefined" && "fonts" in document) {
      try {
        await document.fonts.load(`${config.fontSizePt}pt "${fontName}"`, "Lorem ipsum");
        await document.fonts.ready;
      } catch {
        // Continue with fallback metrics if the requested font cannot be preloaded.
      }
    }
    const result = simulateOverflow(
      config,
      widthMm,
      heightMm,
      {
        front: getPadding("front"),
        back: getPadding("back"),
      },
      fontName,
      scale
    );
    const fixedRegions = config.regions.filter((r) => r.type === "fixed");
    if (fixedRegions.length > 0 && result.labels.length > 0) {
      setShowFixedDialog(true);
      setSimulation(result);
    } else {
      setSimulation(result);
      setShowSimulationModal(true);
    }
  };

  const applyFixedOption = (option: "tail" | "new-label") => {
    if (!simulation) return;
    const fixedRegions = config.regions.filter((r) => r.type === "fixed");
    const final = applyFixedContentOption(simulation, fixedRegions, config.contentSources, option);
    setSimulation(final);
    setShowFixedDialog(false);
    setShowSimulationModal(true);
  };

  const handleSimMouseDown = (e: React.MouseEvent) => {
    simDragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: simPan.x,
      panY: simPan.y,
    };
  };

  const handleSimMouseMove = (e: React.MouseEvent) => {
    if (!simDragRef.current?.active) return;
    const dx = e.clientX - simDragRef.current.startX;
    const dy = e.clientY - simDragRef.current.startY;
    setSimPan({ x: simDragRef.current.panX + dx, y: simDragRef.current.panY + dy });
  };

  const handleSimMouseUp = () => {
    if (simDragRef.current) simDragRef.current.active = false;
  };

  const handleSimWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setSimScale((s) => Math.max(0.25, Math.min(3, s + delta)));
  };

  const resetSimView = () => {
    setSimScale(1);
    setSimPan({ x: 0, y: 0 });
  };

  const getSimulationFontName = () =>
    fonts.find((f) => String(f.id) === config.fontId)?.font_name || "sans-serif";

  const getConnectionTextFill = (line: string) =>
    config.connectionText && line.includes(config.connectionText) ? "#059669" : "#333333";

  const wrapTextForIllustrator = (text: string, fontSizePt: number) => {
    return {
      lines: getTextLines(text),
      lineHeightPt: getTextLineHeight(fontSizePt),
      overflow: false,
    };
  };

  const getRegionContentBox = (
    region: SimulatedRegion,
    sidePadding: { top: number; right: number; bottom: number; left: number },
    unitsPerMm: number
  ) => {
    const contentXmm = Math.max(region.x, sidePadding.left);
    const contentYmm = Math.max(region.y, sidePadding.top);
    const contentRightMm = Math.min(region.x + region.widthMm, widthMm - sidePadding.right);
    const contentBottomMm = Math.min(region.y + region.heightMm, heightMm - sidePadding.bottom);

    return {
      x: contentXmm * unitsPerMm,
      y: contentYmm * unitsPerMm,
      width: Math.max(0, (contentRightMm - contentXmm) * unitsPerMm),
      height: Math.max(0, (contentBottomMm - contentYmm) * unitsPerMm),
    };
  };

  const getRegionTextLayout = (
    region: SimulatedRegion,
    sidePadding: { top: number; right: number; bottom: number; left: number },
    unitsPerMm: number,
    fontSizeUnits: number
  ) => {
    const contentBox = getRegionContentBox(region, sidePadding, unitsPerMm);
    const textX = contentBox.x;
    const textY = contentBox.y;
    const contentWidth = contentBox.width;
    const contentHeight = contentBox.height;
    const lineHeight = getTextLineHeight(fontSizeUnits);
    const lines = getTextLines(region.text);
    const overflowFontSizeUnits = ptToMm(8) * unitsPerMm;
    const hasClippedContent = contentWidth <= 0 || contentHeight <= 0;

    return {
      fontSizeUnits,
      lineHeight,
      textX,
      textY,
      clipX: contentBox.x,
      clipY: contentBox.y,
      clipWidth: contentBox.width,
      clipHeight: contentBox.height,
      visibleLines: lines,
      showOverflow: hasClippedContent ? lines.length > 0 : region.overflowed,
      overflowFontSizeUnits,
      overflowX: Math.max(textX, contentBox.x + contentBox.width - 3),
      overflowY: Math.max(textY + overflowFontSizeUnits, contentBox.y + contentBox.height - 3),
    };
  };

  const exportToSVG = (): string => {
    if (!simulation || !selectedLayout?.details) return "";
    const isSideBySide = simViewMode === "side-by-side";
    const sideGap = 24;
    const labelGap = 40;
    const headerHeight = 25;
    const labelInnerWidth = mmToPx(widthMm) * 2 + sideGap;
    const labelInnerHeight = mmToPx(heightMm);
    const fontName = getSimulationFontName();
    const bodyFontSizePx = Math.max(8, mmToPx(ptToMm(Math.max(4, config.fontSizePt))));
    const previewBodyFontSizePt = getPreviewFontPt(Math.max(4, config.fontSizePt));

    // Always render front and back horizontally within each label, regardless of
    // overall layout mode (side-by-side or top-bottom).
    const svgWidth = isSideBySide
      ? simulation.labels.length * (labelInnerWidth) + (simulation.labels.length - 1) * labelGap
      : labelInnerWidth;
    const svgHeight = isSideBySide
      ? headerHeight + labelInnerHeight
      : simulation.labels.length * (headerHeight + labelInnerHeight) + (simulation.labels.length - 1) * labelGap;

    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`;
    svgContent += `<defs><style>
      text { font-family: "${escapeXml(fontName)}", Arial, sans-serif; }
      .region-rect { stroke-width: 1; }
      .region-text { font-size: 10px; }
    </style></defs>`;
    svgContent += `<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white"/>`;

    simulation.labels.forEach((label, idx) => {
      const labelWidth = labelInnerWidth;
      const labelHeight = labelInnerHeight;
      const labelX = isSideBySide ? idx * (labelWidth + labelGap) : 0;
      const labelY = isSideBySide ? 0 : idx * ((headerHeight + labelHeight) + labelGap);

      // Label header
      svgContent += `<text x="${labelX + 5}" y="${labelY + 15}" font-size="14" font-weight="bold" fill="#1E3A5F">Label ${idx + 1}</text>`;

      const sideY = labelY + headerHeight;

      (["front", "back"] as const).forEach((side, sideIdx) => {
        const sideX = labelX + (sideIdx === 0 ? 0 : mmToPx(widthMm) + sideGap);
        const sidePadding = getPadding(side);

        // Side label
        svgContent += `<text x="${sideX + 5}" y="${labelY + headerHeight - 5}" font-size="11" fill="#666">${side}</text>`;

        // Side background
        svgContent += `<rect x="${sideX}" y="${sideY}" width="${mmToPx(widthMm)}" height="${mmToPx(heightMm)}" fill="white" stroke="#e5e7eb"/>`;

        // Regions
        label[side].forEach((r) => {
          const regionColor = r.type === "fixed" ? "rgba(37,99,235,0.08)" : "rgba(5,150,98,0.08)";
          const strokeColor = r.type === "fixed" ? "#2563EB" : "#059669";
          svgContent += `<rect x="${sideX + mmToPx(r.x)}" y="${sideY + mmToPx(r.y)}" width="${mmToPx(r.widthMm)}" height="${mmToPx(r.heightMm)}" fill="${regionColor}" stroke="${strokeColor}" class="region-rect"/>`;
          svgContent += `<text x="${sideX + mmToPx(r.x + r.widthMm - 2)}" y="${sideY + mmToPx(r.y + 8)}" text-anchor="end" fill="${strokeColor}" class="region-text">${r.regionId}</text>`;

          // Text content — reuse the EXACT lines the simulation already wrapped
          // (same as the web preview). We never re-wrap here, so the SVG line
          // breaks match the on-screen result 1:1.
          if (r.text) {
            const layout = getRegionTextLayout(r, sidePadding, scale, bodyFontSizePx);
            svgContent += `<foreignObject x="${sideX + layout.clipX}" y="${sideY + layout.clipY}" width="${layout.clipWidth}" height="${layout.clipHeight}">`;
            svgContent += `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${layout.clipWidth}px;height:${layout.clipHeight}px;overflow:hidden;white-space:pre-wrap;overflow-wrap:${config.allowSplitText ? "anywhere" : "normal"};word-break:${config.allowSplitText ? "break-word" : "normal"};font-family:${escapeXml(fontName)}, Arial, sans-serif;font-size:${previewBodyFontSizePt}pt;line-height:${1.25 * 1.02};color:#333333;">${escapeXml(r.text)}</div>`;
            svgContent += `</foreignObject>`;
            if (layout.showOverflow && layout.clipWidth > 0 && layout.clipHeight > 0) {
              svgContent += `<text x="${sideX + layout.overflowX}" y="${sideY + layout.overflowY}" text-anchor="end" font-size="${layout.overflowFontSizeUnits}" fill="#EF4444">+</text>`;
            }
          }
        });
      });
    });

    svgContent += `</svg>`;
    return svgContent;
  };

  const escapeXml = (s: string): string => {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderSectionHeader = (key: string, title: string, action?: React.ReactNode) => {
    const isOpen = !!expandedSections[key];
    return (
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => toggleSection(key)}
          className="flex-1 flex items-center justify-between text-left cursor-pointer"
        >
          <h3 className="font-semibold text-sm">{title}</h3>
          <svg
            className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {action}
      </div>
    );
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const svgContent = exportToSVG();
      if (!svgContent) {
        setMessage("No simulation data to export");
        return;
      }

      const isSideBySide = simViewMode === "side-by-side";
      const sideGapMm = 6;
      const labelGapMm = 10;
      const marginMm = 6;

      const labelCount = simulation!.labels.length;
      const pageWmm = isSideBySide
        ? labelCount * (widthMm * 2 + sideGapMm) + (labelCount - 1) * labelGapMm + marginMm * 2
        : widthMm + marginMm * 2;
      const pageHmm = isSideBySide
        ? heightMm + marginMm * 2
        : labelCount * (heightMm * 2 + sideGapMm) + (labelCount - 1) * labelGapMm + marginMm * 2;

      const doc = new jsPDF({
        orientation: pageWmm > pageHmm ? "landscape" : "portrait",
        unit: "mm",
        format: [pageWmm, pageHmm],
      });

      const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = url;
        });

        const canvas = document.createElement("canvas");
        const dpi = 300;
        const scale = dpi / 25.4;
        canvas.width = Math.max(1, Math.round(pageWmm * scale));
        canvas.height = Math.max(1, Math.round(pageHmm * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to create canvas context");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngDataUrl = canvas.toDataURL("image/png");

        doc.addImage(pngDataUrl, "PNG", 0, 0, pageWmm, pageHmm);
        const pdfBlob = doc.output("blob");
        downloadBlob(pdfBlob, `${config.name || "simulation"}.pdf`);
        setMessage("PDF exported successfully");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      setMessage("Failed to export PDF");
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  // Builds an Illustrator-ready SVG string with editable <text> elements using
  // the selected font's real name at the size shown in the simulation view.
  // Coordinates are in points (viewBox unit = 1pt) while the root width/height
  // are in mm, so the artboard opens at exact physical dimensions.
  const buildIllustratorSvg = (): { svg: string; widthMm: number; heightMm: number } => {
    if (!simulation) return { svg: "", widthMm: 0, heightMm: 0 };

    const fontName = getSimulationFontName();
    const isSideBySide = simViewMode === "side-by-side";
    const sideGapMm = 6;
    const labelGapMm = 10;
    const marginMm = 6;
    const headerHeightMm = 8;
    const labelCount = simulation.labels.length;

    const labelInnerWidthMm = widthMm * 2 + sideGapMm;
    const labelInnerHeightMm = heightMm + headerHeightMm;

    const svgWidthMm = isSideBySide
      ? labelCount * labelInnerWidthMm + (labelCount - 1) * labelGapMm + marginMm * 2
      : labelInnerWidthMm + marginMm * 2;
    const svgHeightMm = isSideBySide
      ? labelInnerHeightMm + marginMm * 2
      : labelCount * labelInnerHeightMm + (labelCount - 1) * labelGapMm + marginMm * 2;

    const pxPerMm = 72 / 25.4;
    const svgWidth = svgWidthMm * pxPerMm;
    const svgHeight = svgHeightMm * pxPerMm;

    const escapeXml = (str: string): string => str
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

    const fontFamilyAttr = escapeXml(fontName);
    const bodyFontSizePt = Math.max(4, config.fontSizePt);

    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidthMm}mm" height="${svgHeightMm}mm" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <title>${escapeXml(config.name || "Simulation")}</title>
  <rect width="${svgWidth}" height="${svgHeight}" fill="#FFFFFF"/>
`;

    simulation.labels.forEach((label, idx) => {
      const labelX = isSideBySide
        ? (marginMm + idx * (labelInnerWidthMm + labelGapMm)) * pxPerMm
        : marginMm * pxPerMm;
      const labelY = isSideBySide
        ? marginMm * pxPerMm
        : (marginMm + idx * (labelInnerHeightMm + labelGapMm)) * pxPerMm;

      // Label header
      const headerText = `Label ${idx + 1}`;
      svgContent += `  <text x="${labelX + 5 * pxPerMm}" y="${labelY + 15}" font-family="${fontFamilyAttr}" font-size="14" font-weight="bold" fill="#1E3A5F">${escapeXml(headerText)}</text>\n`;

      const sideY = labelY + headerHeightMm * pxPerMm;

      (["front", "back"] as const).forEach((side, sideIdx) => {
        const sideX = labelX + (sideIdx === 0 ? 0 : widthMm * pxPerMm + sideGapMm * pxPerMm);
        const sidePadding = getPadding(side);

        // Side label
        svgContent += `  <text x="${sideX + 5 * pxPerMm}" y="${labelY + headerHeightMm * pxPerMm - 5}" font-family="${fontFamilyAttr}" font-size="11" fill="#666666">${escapeXml(side)}</text>\n`;

        // Background
        svgContent += `  <rect x="${sideX}" y="${sideY}" width="${widthMm * pxPerMm}" height="${heightMm * pxPerMm}" fill="none" stroke="#E5E7EB" stroke-width="1"/>\n`;

        label[side].forEach((r) => {
          const fillColor = r.type === "fixed" ? "rgba(37,99,235,0.08)" : "rgba(5,150,98,0.08)";
          const strokeColor = r.type === "fixed" ? "#2563EB" : "#059669";
          const rx = sideX + r.x * pxPerMm;
          const ry = sideY + r.y * pxPerMm;
          const rw = r.widthMm * pxPerMm;
          const rh = r.heightMm * pxPerMm;

          svgContent += `  <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1"/>\n`;

          // Region ID
          svgContent += `  <text x="${rx + rw - 5}" y="${ry + 12}" text-anchor="end" font-family="${fontFamilyAttr}" font-size="10" fill="${strokeColor}">${escapeXml(r.regionId)}</text>\n`;

          // Text content — reuse the EXACT lines the simulation already wrapped
          // (same as the web preview). No re-wrapping, so line breaks match 1:1.
          if (r.text) {
            const contentBox = getRegionContentBox(r, sidePadding, pxPerMm);
            const textX = sideX + contentBox.x;
            const textY = sideY + contentBox.y;
            const wrapped = wrapTextForIllustrator(r.text, bodyFontSizePt);

            wrapped.lines.forEach((line, lineIdx) => {
              const fill = getConnectionTextFill(line);
              const lineY =
                textY + (lineIdx + 1) * wrapped.lineHeightPt - bodyFontSizePt * 0.2;
              svgContent += `  <text x="${textX}" y="${lineY}" font-family="${fontFamilyAttr}" font-size="${bodyFontSizePt}" fill="${fill}">${escapeXml(line)}</text>\n`;
            });

            if (wrapped.overflow || r.overflowed) {
              svgContent += `  <text x="${rx + rw - 3}" y="${ry + rh - 3}" text-anchor="end" font-family="${fontFamilyAttr}" font-size="8" fill="#EF4444">+</text>\n`;
            }
          }
        });
      });
    });

    svgContent += `</svg>`;
    return { svg: svgContent, widthMm: svgWidthMm, heightMm: svgHeightMm };
  };

  const handleExportAI = async () => {
    setExporting(true);
    try {
      if (!simulation) {
        setMessage("No simulation data to export");
        return;
      }
      const { svg } = buildIllustratorSvg();
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      downloadBlob(blob, `${config.name || "simulation"}.svg`);
      setMessage("Editable SVG exported for Illustrator");
    } catch (err) {
      console.error(err);
      setMessage("Export failed: " + (err as Error).message);
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  const handleExportAIFile = async () => {
    setExporting(true);
    try {
      if (!simulation) {
        setMessage("No simulation data to export");
        return;
      }

      // Modern Illustrator opens PDF-backed .ai files. Build vector PDF text,
      // not a raster screenshot, so the text remains editable in Illustrator.
      const pxPerMm = 72 / 25.4;
      const isSideBySide = simViewMode === "side-by-side";
      const sideGapMm = 6;
      const labelGapMm = 10;
      const marginMm = 6;
      const headerHeightMm = 8;
      const labelCount = simulation.labels.length;

      const labelInnerWidthMm = widthMm * 2 + sideGapMm;
      const labelInnerHeightMm = heightMm + headerHeightMm;

      const svgWidthMm = isSideBySide
        ? labelCount * labelInnerWidthMm + (labelCount - 1) * labelGapMm + marginMm * 2
        : labelInnerWidthMm + marginMm * 2;
      const svgHeightMm = isSideBySide
        ? labelInnerHeightMm + marginMm * 2
        : labelCount * labelInnerHeightMm + (labelCount - 1) * labelGapMm + marginMm * 2;

      const pageW = svgWidthMm * pxPerMm; // in pt
      const pageH = svgHeightMm * pxPerMm;

      const doc = new jsPDF({
        orientation: pageW > pageH ? "landscape" : "portrait",
        unit: "pt",
        format: [pageW, pageH],
      });
      const aiTextFitMarginPt = 0.75;

      // Embed the selected font so Illustrator uses the same font as preview.
      let bodyFontName = "helvetica";
      type EmbedState = { status: "no-font" } | { status: "embedded"; fontName: string } | { status: "embed-failed"; fontName: string; error: string };
      let embedState: EmbedState = { status: "no-font" };

      const selectedFont = fonts.find((f) => String(f.id) === config.fontId);
      if (selectedFont?.id) {
        try {
          const fontRes = await fetch(`/api/fonts/file/${selectedFont.id}`);
          if (!fontRes.ok) {
            throw new Error(`HTTP ${fontRes.status}`);
          }
          const buf = await fontRes.arrayBuffer();
          const bytes = new Uint8Array(buf);

          // Safe chunked base64 conversion for large font files.
          const chunkSize = 0x2000; // 8KB chunks to stay well under stack limits
          const chunks: string[] = [];
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, bytes.length);
            let chunkStr = "";
            for (let j = i; j < end; j++) {
              chunkStr += String.fromCharCode(bytes[j]);
            }
            chunks.push(chunkStr);
          }
          const binary = chunks.join("");
          const base64 = btoa(binary);

          const ext = selectedFont.filename?.split(".").pop()?.toLowerCase() === "otf" ? "otf" : "ttf";
          const vfsName = `SplitFont.${ext}`;
          const embeddedFontName = selectedFont.font_name || "SplitFont";
          doc.addFileToVFS(vfsName, base64);
          doc.addFont(vfsName, embeddedFontName, "normal");
          bodyFontName = embeddedFontName;
          embedState = { status: "embedded", fontName: selectedFont.font_name };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          embedState = { status: "embed-failed", fontName: selectedFont.font_name, error: errMsg };
          console.warn(`Font embed failed for ${selectedFont.font_name}, using Helvetica:`, err);
        }
      }

      const drawText = (
        text: string,
        x: number,
        y: number,
        sizePt: number,
        rgb: [number, number, number],
        align: "left" | "right" = "left",
        maxWidthPt?: number
      ) => {
        doc.setFont(bodyFontName, "normal");
        doc.setFontSize(sizePt);
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);

        const textOptions: {
          align: "left" | "right";
          baseline: "alphabetic";
          horizontalScale?: number;
        } = { align, baseline: "alphabetic" };

        if (maxWidthPt !== undefined && maxWidthPt > 0 && text.length > 0) {
          const safeMaxWidthPt = Math.max(0.1, maxWidthPt - aiTextFitMarginPt);
          const textWidthPt = doc.getTextWidth(text);
          if (textWidthPt > safeMaxWidthPt) {
            textOptions.horizontalScale = Math.max(0.01, safeMaxWidthPt / textWidthPt);
          }
        }

        doc.text(text, x, y, textOptions);
      };

      // White artboard background.
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, "F");

      const bodyFontSizePt = Math.max(4, config.fontSizePt);

      simulation.labels.forEach((label, idx) => {
        const labelX = isSideBySide
          ? (marginMm + idx * (labelInnerWidthMm + labelGapMm)) * pxPerMm
          : marginMm * pxPerMm;
        const labelY = isSideBySide
          ? marginMm * pxPerMm
          : (marginMm + idx * (labelInnerHeightMm + labelGapMm)) * pxPerMm;

        drawText(`Label ${idx + 1}`, labelX + 5 * pxPerMm, labelY + 15, 14, [30, 58, 95]);

        const sideY = labelY + headerHeightMm * pxPerMm;

        (["front", "back"] as const).forEach((side, sideIdx) => {
          const sideX = labelX + (sideIdx === 0 ? 0 : widthMm * pxPerMm + sideGapMm * pxPerMm);
          const sidePadding = getPadding(side);

          drawText(side, sideX + 5 * pxPerMm, labelY + headerHeightMm * pxPerMm - 5, 11, [102, 102, 102]);

          // Side background outline
          doc.setDrawColor(229, 231, 235);
          doc.setLineWidth(1);
          doc.rect(sideX, sideY, widthMm * pxPerMm, heightMm * pxPerMm, "S");

          label[side].forEach((r) => {
            // Solid light equivalents of the on-screen rgba(...,0.08) fills.
            const fill: [number, number, number] = r.type === "fixed" ? [238, 243, 253] : [235, 247, 242];
            const stroke: [number, number, number] = r.type === "fixed" ? [37, 99, 235] : [5, 150, 98];
            const rx = sideX + r.x * pxPerMm;
            const ry = sideY + r.y * pxPerMm;
            const rw = r.widthMm * pxPerMm;
            const rh = r.heightMm * pxPerMm;

            doc.setFillColor(fill[0], fill[1], fill[2]);
            doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
            doc.setLineWidth(1);
            doc.rect(rx, ry, rw, rh, "FD");

            drawText(r.regionId, rx + rw - 5, ry + 12, 10, stroke, "right");

            if (r.text) {
              const contentBox = getRegionContentBox(r, sidePadding, pxPerMm);
              const textX = sideX + contentBox.x;
              const textY = sideY + contentBox.y;
              const wrapped = wrapTextForIllustrator(r.text, bodyFontSizePt);

              wrapped.lines.forEach((line, lineIdx) => {
                const fill: [number, number, number] =
                  getConnectionTextFill(line) === "#059669" ? [5, 150, 98] : [51, 51, 51];
                const lineY =
                  textY + (lineIdx + 1) * wrapped.lineHeightPt - bodyFontSizePt * 0.2;
                drawText(line, textX, lineY, bodyFontSizePt, fill, "left", contentBox.width);
              });

              if (wrapped.overflow || r.overflowed) {
                drawText(
                  "+",
                  rx + rw - 3,
                  ry + rh - 3,
                  8,
                  [239, 68, 68],
                  "right"
                );
              }
            }
          });
        });
      });

      const pdfBlob = doc.output("blob");
      downloadBlob(pdfBlob, `${config.name || "simulation"}.ai`);

      // Report the actual embed outcome to the user
      if (embedState.status === "embedded") {
        setMessage(`Illustrator file (.ai) exported with embedded font (${embedState.fontName})`);
      } else if (embedState.status === "embed-failed") {
        setMessage(`Illustrator file (.ai) exported, but embedding ${embedState.fontName} failed (${embedState.error}); using Helvetica`);
      } else {
        setMessage("Illustrator file (.ai) exported (no font selected; using Helvetica)");
      }
    } catch (err) {
      console.error(err);
      setMessage("Export failed: " + (err as Error).message);
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  const handleSave = async () => {
    if (!config.layoutId) {
      setMessage("Please select a layout first");
      return;
    }
    if (!config.name.trim()) {
      setMessage("Please enter a split configuration name");
      return;
    }
    try {
      const payload = {
        ...config,
        // Persist the point value to the legacy `fontSizeMm` DB column.
        fontSizeMm: config.fontSizePt,
        regions: config.regions.map((r) => ({
          ...r,
          overflowTargetId: r.overflowTargetId || undefined,
          contentSourceId: r.contentSourceId || undefined,
        })),
      };
      const url = config.id ? `/api/splits/${config.id}` : "/api/splits";
      const method = config.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save");
      const saved = await res.json();
      setConfig((c) => ({ ...c, id: saved.id }));
      setMessage("Saved successfully");
      fetchData();
    } catch {
      setMessage("Failed to save split configuration");
    }
  };

  const handleLoadSplit = async (id: string) => {
    if (loadingSplitId) return;
    setLoadingSplitId(id);
    try {
      const res = await fetch(`/api/splits/${id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const layoutRes = await fetch(`/api/layouts/${data.layoutId}`);
      const layout = await layoutRes.json();
      setSelectedLayout(layout);
      setConfig({
        id: data.id,
        name: data.name,
        layoutId: data.layoutId,
        fontId: data.fontId ?? undefined,
        // Legacy DB column `fontSizeMm` now stores the point value.
        fontSizePt: data.fontSizeMm,
        allowSplitText: data.allowSplitText,
        connectionText: data.connectionText ?? undefined,
        imageData: data.imageData ?? undefined,
        imageOpacity: data.imageOpacity,
        regions: data.regions.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          regionId: String(r.regionId),
          side: String(r.side) as "front" | "back",
          x: Number(r.x),
          y: Number(r.y),
          widthMm: Number(r.widthMm),
          heightMm: Number(r.heightMm),
          type: String(r.type) as SplitRegion["type"],
          overflowTargetId: r.overflowTargetId ? String(r.overflowTargetId) : undefined,
          contentSourceId: r.contentSourceId ? String(r.contentSourceId) : undefined,
        })),
        contentSources: data.contentSources.map((s: Record<string, unknown>) => ({
          id: String(s.id),
          type: String(s.sourceType) as SplitContentSource["type"],
          label: String(s.label),
          translationId:
            s.translationId !== undefined && s.translationId !== null
              ? Number(s.translationId)
              : undefined,
          manualText:
            s.manualText !== undefined && s.manualText !== null
              ? String(s.manualText)
              : undefined,
        })),
      });
      setSimulation(null);
      setActiveSide("front");
      setActiveTab("editor");
    } catch {
      setMessage("Failed to load split configuration");
    } finally {
      setLoadingSplitId(null);
    }
  };

  const handleDeleteSplit = async (id: string) => {
    if (!confirm("Delete this split configuration?")) return;
    try {
      await fetch(`/api/splits/${id}`, { method: "DELETE" });
      setSavedSplits((prev) => prev.filter((s) => s.id !== id));
      if (config.id === id) {
        setConfig({
          name: "",
          layoutId: "",
          fontSizePt: 8,
          allowSplitText: true,
          connectionText: "-",
          imageOpacity: 0.3,
          regions: [],
          contentSources: [],
        });
        setSelectedLayout(null);
        setActiveSide("front");
      }
    } catch {
      setMessage("Failed to delete");
    }
  };

  const handleNewConfig = () => {
    setConfig({
      name: "",
      layoutId: "",
      fontSizePt: 8,
      allowSplitText: true,
      connectionText: "-",
      imageOpacity: 0.3,
      regions: [],
      contentSources: [],
    });
    setSelectedLayout(null);
    setSelectedRegionId(null);
    setActiveSide("front");
    setSimulation(null);
    setActiveTab("editor");
  };

  const selectedRegion = config.regions.find((r) => r.id === selectedRegionId);

  const renderEditor = () => {
    const isDoubleSided = selectedLayout?.details?.sideType === "double";
    const viewMode = selectedLayout?.details?.viewMode ?? "side-by-side";

    const renderSvg = (side: "front" | "back", showLines = false) => {
      const sidePadding = getPadding(side);
      const sideImage = parseSideImage(config.imageData, side);
      const foldGuide = getFoldGuide(side);
      const paddingGuideRects = getPaddingGuideRects(side);
      return (
        <svg
          key={side}
          ref={side === "front" ? svgRef : undefined}
          width={mmToPx(widthMm)}
          height={mmToPx(heightMm)}
          className={`bg-white border shadow-[var(--shadow-sm)] cursor-crosshair transition-colors ${activeSide === side ? "border-[var(--primary)]" : "border-[var(--border)]"}`}
          style={{ overflow: "visible" }}
          onMouseDown={(e) => handleSvgMouseDown(e, side)}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
        >
            {sideImage && showImage && (
              <image
                href={sideImage}
                x={0}
                y={0}
                width={mmToPx(widthMm)}
                height={mmToPx(heightMm)}
                opacity={config.imageOpacity}
                preserveAspectRatio="none"
              />
            )}

            {/* Padding outlines. Fold layouts show one guide per fold panel. */}
            {paddingGuideRects.map((pr, idx) => (
              <rect
                key={`padding-${side}-${idx}`}
                x={mmToPx(pr.x)}
                y={mmToPx(pr.y)}
                width={Math.max(0, mmToPx(pr.w))}
                height={Math.max(0, mmToPx(pr.h))}
                fill="none"
                stroke="#059669"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            ))}

            {/* Overflow connection lines */}
            {showLines &&
              config.regions
                .filter((r) => r.side === side && r.overflowTargetId)
                .map((r) => {
                  const target = config.regions.find((t) => t.regionId === r.overflowTargetId && t.side === side);
                  if (!target) return null;
                  const sx = r.x + r.widthMm / 2;
                  const sy = r.y + r.heightMm;
                  const tx = target.x + target.widthMm / 2;
                  const ty = target.y;
                  const pathD = getBezierConnectionPath(sx, sy, tx, ty);
                  const pathLength = getPathTotalLength(sx, sy, tx, ty);
                  // When a region is selected, only show the OUTGOING connection from
                  // that selected region (r.id === selectedRegionId). Hide all other
                  // connections so the next-flow path stays focused.
                  const hasSelection = !!selectedRegionId;
                  const isOutgoingFromSelected = r.id === selectedRegionId;
                  const lineStroke = isOutgoingFromSelected ? "#F59E0B" : "#6366f1";
                  const lineOpacity = hasSelection
                    ? isOutgoingFromSelected
                      ? 1
                      : 0.15
                    : 0.85;
                  const lineWidth = isOutgoingFromSelected ? 3 : 2;
                  const circleFill = isOutgoingFromSelected ? "#F59E0B" : "#6366f1";
                  const circleOpacity = hasSelection
                    ? isOutgoingFromSelected
                      ? 1
                      : 0.15
                    : 0.85;
                  const circleRadius = isOutgoingFromSelected ? 6 : 4;
                  return (
                    <g key={`conn-${r.id}-${target.id}`}>
                      {/* Animated dotted line with motion from initiator to target */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={lineStroke}
                        strokeWidth={lineWidth}
                        strokeDasharray="4,4"
                        opacity={lineOpacity}
                        pointerEvents="none"
                        style={{
                          animation: `dashFlow 1s linear infinite`,
                        }}
                      />
                      {/* Arrow marker at target */}
                      <circle
                        cx={mmToPx(tx)}
                        cy={mmToPx(ty)}
                        r={circleRadius}
                        fill={circleFill}
                        opacity={circleOpacity}
                      />
                      {/* Invisible wider hit area for hover */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={10}
                        pointerEvents="stroke"
                      />
                    </g>
                  );
                })}

            {/* Regions */}
            {config.regions
              .filter((r) => r.side === side)
              .map((r) => (
                <g key={r.id}>
                  <rect
                    x={mmToPx(r.x)}
                    y={mmToPx(r.y)}
                    width={mmToPx(r.widthMm)}
                    height={mmToPx(r.heightMm)}
                    fill={selectedRegionId === r.id ? "rgba(30,58,95,0.1)" : r.type === "fixed" ? "rgba(37,99,235,0.08)" : "rgba(5,150,105,0.08)"}
                    stroke={selectedRegionId === r.id ? "#1E3A5F" : r.type === "fixed" ? "#2563EB" : "#059669"}
                    strokeWidth={selectedRegionId === r.id ? 2 : 1}
                  />
                  <text
                    x={mmToPx(r.x + r.widthMm / 2)}
                    y={mmToPx(r.y + r.heightMm / 2)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(10, mmToPx(Math.min(r.widthMm, r.heightMm) * 0.15))}
                    fill={r.type === "fixed" ? "#2563EB" : "#059669"}
                  >
                    {r.regionId}
                  </text>
                  {selectedRegionId === r.id && (
                    <>
                      {[
                        { name: "nw", x: r.x, y: r.y },
                        { name: "n", x: r.x + r.widthMm / 2, y: r.y },
                        { name: "ne", x: r.x + r.widthMm, y: r.y },
                        { name: "w", x: r.x, y: r.y + r.heightMm / 2 },
                        { name: "e", x: r.x + r.widthMm, y: r.y + r.heightMm / 2 },
                        { name: "sw", x: r.x, y: r.y + r.heightMm },
                        { name: "s", x: r.x + r.widthMm / 2, y: r.y + r.heightMm },
                        { name: "se", x: r.x + r.widthMm, y: r.y + r.heightMm },
                      ].map((h) => {
                        const isHovered = hoveredHandle === h.name;
                        return (
                          <g key={h.name}>
                            <rect
                              x={mmToPx(h.x) - 8}
                              y={mmToPx(h.y) - 8}
                              width={16}
                              height={16}
                              fill="transparent"
                              onMouseEnter={() => setHoveredHandle(h.name)}
                              onMouseLeave={() => setHoveredHandle(null)}
                              style={{ cursor: "pointer" }}
                            />
                            <rect
                              x={mmToPx(h.x) - 4}
                              y={mmToPx(h.y) - 4}
                              width={8}
                              height={8}
                              fill={isHovered ? "#3B82F6" : "#1E3A5F"}
                              pointerEvents="none"
                            />
                          </g>
                        );
                      })}
                    </>
                  )}
                </g>
              ))}

            {foldGuide && (
              <line
                x1={foldGuide.x1}
                y1={foldGuide.y1}
                x2={foldGuide.x2}
                y2={foldGuide.y2}
                stroke="#DC2626"
                strokeWidth={1.5}
                strokeDasharray="4,4"
                pointerEvents="none"
              />
            )}

            {/* Drawing preview */}
            {drag?.type === "draw" && drag.side === side && (
              <>
                <rect
                  x={mmToPx(Math.min(drag.startX, drag.currentX))}
                  y={mmToPx(Math.min(drag.startY, drag.currentY))}
                  width={mmToPx(Math.abs(drag.currentX - drag.startX))}
                  height={mmToPx(Math.abs(drag.currentY - drag.startY))}
                  fill="rgba(30,58,95,0.1)"
                  stroke="#1E3A5F"
                  strokeDasharray="4,4"
                />
                {drag.startSnap.kind === "corner" && (
                  <circle cx={mmToPx(drag.startSnap.x)} cy={mmToPx(drag.startSnap.y)} r={5} fill="#FACC15" stroke="#B45309" strokeWidth={1} />
                )}
                {drag.endSnap.kind && (
                  <circle
                    cx={mmToPx(drag.endSnap.x)}
                    cy={mmToPx(drag.endSnap.y)}
                    r={5}
                    fill={drag.endSnap.kind === "corner" ? "#FACC15" : "#EF4444"}
                    stroke={drag.endSnap.kind === "corner" ? "#B45309" : "#991B1B"}
                    strokeWidth={1}
                  />
                )}
              </>
            )}
          </svg>
      );
    };

    const renderCanvasCard = (side: "front" | "back") => {
      const sideImage = parseSideImage(config.imageData, side);
      return (
        <div
          key={side}
          ref={canvasWheelRef}
          className={`space-y-2 p-2 rounded-lg border-2 transition-colors ${activeSide === side ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-transparent hover:border-[var(--border)]"}`}
          onClick={() => setActiveSide(side)}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--foreground)]/80 capitalize">{side} Label</span>
            {sideImage && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSideImage(side, undefined);
                }}
                className="text-xs text-[var(--destructive)] cursor-pointer"
              >
                Remove image
              </button>
            )}
          </div>
          {renderSvg(side, true)}
        </div>
      );
    };

    const renderConnectionOverlay = () => {
      const svgW = mmToPx(widthMm);
      const svgH = mmToPx(heightMm);
      const gap = 16;
      const overflowBottom = 28;
      const overflowTop = 8;
      const isTopBottom = viewMode === "top-bottom";
      const overlayW = isTopBottom ? svgW : 2 * svgW + gap;
      const overlayH = (isTopBottom ? 2 * svgH + gap : svgH) + overflowTop + overflowBottom;

      const sideOrigin = (side: "front" | "back") => {
        if (side === "front") return { x: 0, y: overflowTop };
        return isTopBottom
          ? { x: 0, y: overflowTop + svgH + gap }
          : { x: svgW + gap, y: overflowTop };
      };

      const getOverlayBezierPath = (sx: number, sy: number, tx: number, ty: number) => {
        const distance = Math.hypot(tx - sx, ty - sy);
        const offset = Math.max(20, distance * 0.35);
        return `M ${sx} ${sy} C ${sx} ${sy + offset}, ${tx} ${ty - offset}, ${tx} ${ty}`;
      };

      return (
        <svg
          className="absolute top-0 left-0 pointer-events-none overflow-visible"
          width={overlayW}
          height={overlayH}
        >
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" opacity="0.8" />
            </marker>
          </defs>
          {config.regions
            .filter((r) => r.overflowTargetId)
            .map((r) => {
              const target = config.regions.find((t) => t.regionId === r.overflowTargetId);
              if (!target) return null;
              const sOrigin = sideOrigin(r.side);
              const tOrigin = sideOrigin(target.side);
              const sx = sOrigin.x + mmToPx(r.x + r.widthMm / 2);
              const sy = sOrigin.y + mmToPx(r.y + r.heightMm);
              const tx = tOrigin.x + mmToPx(target.x + target.widthMm / 2);
              const ty = tOrigin.y + mmToPx(target.y);
              const hasSelection = !!selectedRegionId;
              const isOutgoingFromSelected = r.id === selectedRegionId;
              const lineStroke = isOutgoingFromSelected ? "#F59E0B" : "#6366f1";
              const lineOpacity = hasSelection
                ? isOutgoingFromSelected
                  ? 1
                  : 0.15
                : 0.85;
              const lineWidth = isOutgoingFromSelected ? 3 : 2;
              const circleFill = isOutgoingFromSelected ? "#F59E0B" : "#6366f1";
              const circleOpacity = hasSelection
                ? isOutgoingFromSelected
                  ? 1
                  : 0.15
                : 0.85;
              const circleRadius = isOutgoingFromSelected ? 6 : 4;
              return (
                <g key={`overlay-conn-${r.id}-${target.id}`}>
                  <path
                    d={getOverlayBezierPath(sx, sy, tx, ty)}
                    fill="none"
                    stroke={lineStroke}
                    strokeWidth={lineWidth}
                    strokeDasharray="4,4"
                    opacity={lineOpacity}
                    style={{
                      animation: `dashFlow 1s linear infinite`,
                    }}
                  />
                  <circle
                    cx={tx}
                    cy={ty}
                    r={circleRadius}
                    fill={circleFill}
                    opacity={circleOpacity}
                  />
                </g>
              );
            })}
        </svg>
      );
    };

    return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={config.layoutId}
              onChange={(e) => handleLayoutSelect(e.target.value)}
              className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white"
            >
              <option value="">Select saved layout...</option>
              {savedLayouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
              placeholder="Split config name"
              className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm"
            />
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              Save
            </button>
          </div>

          {selectedLayout && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-[var(--foreground)]/60">
                  {widthMm} × {heightMm} mm
                </span>
                <label className="flex items-center gap-2">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min={2}
                    max={10}
                    step={0.5}
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                  />
                </label>
                {config.imageData && (
                  <>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={showImage}
                        onChange={(e) => setShowImage(e.target.checked)}
                      />
                      Show image
                    </label>
                    <label className="flex items-center gap-2">
                      <span>Opacity</span>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={config.imageOpacity}
                        onChange={(e) => setConfig((c) => ({ ...c, imageOpacity: Number(e.target.value) }))}
                      />
                    </label>
                  </>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs cursor-pointer"
                >
                  Upload image to {activeSide}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && loadImageFile(e.target.files[0])}
                />
              </div>

              {isDoubleSided ? (
                <div className="space-y-2 overflow-x-auto overflow-y-visible pb-10">
                  <div className={`flex ${viewMode === "side-by-side" ? "flex-row w-max" : "flex-col"} gap-4 px-2`}>
                    {(["front", "back"] as const).map((side) => {
                      const sideImage = parseSideImage(config.imageData, side);
                      return (
                        <div
                          key={side}
                          style={{ width: mmToPx(widthMm) }}
                          className={`flex items-center justify-between ${activeSide === side ? "text-[var(--primary)]" : "text-[var(--foreground)]/80"}`}
                        >
                          <span className="text-sm font-medium capitalize">{side} Label</span>
                          {sideImage && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSideImage(side, undefined);
                              }}
                              className="text-xs text-[var(--destructive)] cursor-pointer"
                            >
                              Remove image
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    ref={canvasWheelRef}
                    className={`relative flex ${viewMode === "side-by-side" ? "flex-row w-max" : "flex-col"} gap-4 pb-8`}
                  >
                    {renderSvg("front")}
                    {renderSvg("back")}
                    {renderConnectionOverlay()}
                  </div>
                </div>
              ) : (
                renderCanvasCard("front")
              )}
            </>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {/* Overflow Options - Moved to top */}
          <div className="bg-white border border-[var(--border)] rounded-xl p-4 space-y-3">
            {renderSectionHeader("overflow-options", "Overflow Options")}
            {expandedSections["overflow-options"] && (
              <>
                <div>
                  <label className="text-xs text-[var(--foreground)]/60">Font</label>
                  <select
                    value={config.fontId || ""}
                    onChange={(e) => setConfig((c) => ({ ...c, fontId: e.target.value || undefined }))}
                    className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm"
                  >
                    <option value="">Default</option>
                    {fonts.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.font_name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.allowSplitText}
                    onChange={(e) => setConfig((c) => ({ ...c, allowSplitText: e.target.checked }))}
                  />
                  Allow split text
                </label>
                <div>
                  <label className="text-xs text-[var(--foreground)]/60">Connection text</label>
                  <input
                    type="text"
                    value={config.connectionText || ""}
                    onChange={(e) => setConfig((c) => ({ ...c, connectionText: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--foreground)]/60">Font size (pt)</label>
                  <input
                    type="number"
                    min={4}
                    max={72}
                    step={0.5}
                    value={config.fontSizePt}
                    onChange={(e) => setConfig((c) => ({ ...c, fontSizePt: Number(e.target.value) }))}
                    className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm"
                  />
                </div>
              </>
            )}
          </div>

          {selectedRegion && (
            <div className="bg-white border border-[var(--border)] rounded-xl p-4 space-y-3">
              {renderSectionHeader(
                `region-settings-${selectedRegion.id}`,
                `${selectedRegion.regionId} Settings`,
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRegion(selectedRegion.id);
                  }}
                  className="text-[var(--destructive)] text-xs cursor-pointer"
                >
                  Delete
                </button>
              )}
              {expandedSections[`region-settings-${selectedRegion.id}`] && (
                <>
                  <div>
                    <label className="text-xs text-[var(--foreground)]/60">Side</label>
                    <select
                      value={selectedRegion.side}
                      onChange={(e) => updateRegion(selectedRegion.id, { side: e.target.value as "front" | "back" })}
                      className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm"
                    >
                      <option value="front">Front</option>
                      <option value="back">Back</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--foreground)]/60">Type</label>
                    <select
                      value={selectedRegion.type}
                      onChange={(e) => updateRegion(selectedRegion.id, { type: e.target.value as SplitRegion["type"] })}
                      className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm"
                    >
                      <option value="overflow">Overflow</option>
                      <option value="fixed">Fixed</option>
                    </select>
                  </div>
                  {selectedRegion.type === "overflow" && (
                    <div>
                      <label className="text-xs text-[var(--foreground)]/60">Overflow target</label>
                      <select
                        value={selectedRegion.overflowTargetId || ""}
                        onChange={(e) => updateRegion(selectedRegion.id, { overflowTargetId: e.target.value || undefined })}
                        className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm"
                      >
                        <option value="">None (create new label)</option>
                        {config.regions
                          .filter((r) => r.id !== selectedRegion.id && (isValidOverflowTarget(selectedRegion, r) || r.regionId === selectedRegion.overflowTargetId))
                          .map((r) => (
                            <option key={r.id} value={r.regionId}>
                              {r.regionId} ({r.side})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  {(() => {
                    const selectedSource = config.contentSources.find((s) => s.id === selectedRegion.contentSourceId);
                    const contextPreview = !selectedSource
                      ? null
                      : selectedSource.type === "manual"
                        ? (selectedSource.manualText || "(empty)")
                        : (() => {
                            const t = translations.find((tt) => tt.id === selectedSource.translationId);
                            return t?.table_name ? `Translation: ${t.table_name}` : selectedSource.label;
                          })();
                    return (
                      <div
                        className="relative"
                        onMouseEnter={() => contextPreview !== null && setShowContextPopup(true)}
                      >
                        <div className="flex items-center gap-1">
                          <label className="text-xs text-[var(--foreground)]/60">Content source for {selectedRegion.regionId}</label>
                          {contextPreview !== null && (
                            <span
                              className="w-4 h-4 flex items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--foreground)]/60"
                              aria-hidden="true"
                            >
                              i
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--foreground)]/40 mb-1">Pick one shared source for this region.</p>
                        <select
                          value={selectedRegion.contentSourceId || ""}
                          onChange={(e) => {
                            setShowContextPopup(false);
                            updateRegion(selectedRegion.id, { contentSourceId: e.target.value || undefined });
                          }}
                          className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm"
                        >
                          <option value="">None</option>
                          {config.contentSources.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        {contextPreview !== null && showContextPopup && (
                          <div className="absolute left-0 top-full mt-1 z-20 w-full bg-white border border-[var(--border)] rounded-lg shadow-[var(--shadow-lg)] p-2 text-xs text-[var(--foreground)]">
                            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-1">
                              <span className="font-semibold truncate">
                                {selectedSource?.label || "Content preview"}
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowContextPopup(false)}
                                className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[var(--foreground)]/60 hover:bg-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                                aria-label="Close content preview"
                              >
                                x
                              </button>
                            </div>
                            <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words select-text cursor-text">
                              {contextPreview}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>X: {selectedRegion.x.toFixed(1)}mm</div>
                    <div>Y: {selectedRegion.y.toFixed(1)}mm</div>
                    <div>W: {selectedRegion.widthMm.toFixed(1)}mm</div>
                    <div>H: {selectedRegion.heightMm.toFixed(1)}mm</div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="bg-white border border-[var(--border)] rounded-xl p-4 space-y-3">
            {renderSectionHeader(
              "shared-content-sources",
              "Shared Content Sources"
            )}
            {expandedSections["shared-content-sources"] && (
              <>
                <p className="text-xs text-[var(--foreground)]/50">
                  Create reusable text blocks here. Each region can be assigned one source.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => addContentSource("manual", selectedRegionId ?? undefined)}
                    className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs cursor-pointer"
                  >
                    + Manual text{selectedRegionId && " for selected region"}
                  </button>
                  <button
                    onClick={() => addContentSource("translation", selectedRegionId ?? undefined)}
                    className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs cursor-pointer"
                  >
                    + Translation{selectedRegionId && " for selected region"}
                  </button>
                </div>
                {config.contentSources.map((s) => (
                  <div key={s.id} className="border border-[var(--border)] rounded-lg p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={s.label}
                        title={s.type === "manual" ? s.manualText : s.label}
                        onChange={(e) => updateContentSource(s.id, { label: e.target.value })}
                        className="text-sm font-medium border-none p-0 focus:ring-0"
                      />
                      <button onClick={() => deleteContentSource(s.id)} className="text-[var(--destructive)] text-xs cursor-pointer">
                        Remove
                      </button>
                    </div>
                    {s.type === "manual" ? (
                      <textarea
                        value={s.manualText || ""}
                        onChange={(e) => updateContentSource(s.id, { manualText: e.target.value })}
                        rows={10}
                        className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-xs"
                      />
                    ) : (
                      <select
                        value={s.translationId || ""}
                        onChange={(e) => updateContentSource(s.id, { translationId: Number(e.target.value) })}
                        className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-xs"
                      >
                        <option value="">Select translation table</option>
                        {translations.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.table_name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
                {!selectedRegionId && config.contentSources.length === 0 && (
                  <p className="text-xs text-[var(--foreground)]/40">Select a region first to auto-assign a new source to it.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Simulation Result Modal */}
      {showSimulationModal && simulation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-[var(--shadow-xl)] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Simulation Result</h3>
                <div className="flex items-center gap-2 bg-[var(--muted)] rounded-lg p-1">
                  <button
                    onClick={() => setSimViewMode("side-by-side")}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      simViewMode === "side-by-side"
                        ? "bg-white text-[var(--primary)] shadow-sm"
                        : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
                    }`}
                  >
                    Side by Side
                  </button>
                  <button
                    onClick={() => setSimViewMode("top-bottom")}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      simViewMode === "top-bottom"
                        ? "bg-white text-[var(--primary)] shadow-sm"
                        : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
                    }`}
                  >
                    Top & Bottom
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSimScale((s) => Math.max(0.25, s - 0.25))}
                  className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs hover:bg-[var(--muted)] cursor-pointer"
                >
                  −
                </button>
                <span className="text-xs w-14 text-center font-medium">{Math.round(simScale * 100)}%</span>
                <button
                  onClick={() => setSimScale((s) => Math.min(3, s + 0.25))}
                  className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs hover:bg-[var(--muted)] cursor-pointer"
                >
                  +
                </button>
                <button
                  onClick={() => { setSimScale(1); setSimPan({ x: 0, y: 0 }); }}
                  className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs hover:bg-[var(--muted)] cursor-pointer"
                >
                  Reset
                </button>
                <button
                  onClick={() => setShowSimulationModal(false)}
                  className="ml-2 px-3 py-1.5 text-[var(--foreground)]/60 hover:text-[var(--destructive)] rounded-lg cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body - Simulation Canvas */}
            <div className="flex-1 overflow-auto p-6 bg-[var(--background)]">
              <div
                className="relative overflow-hidden border border-[var(--border)] rounded-xl bg-white cursor-grab active:cursor-grabbing min-h-[400px]"
                onMouseDown={handleSimMouseDown}
                onMouseMove={handleSimMouseMove}
                onMouseUp={handleSimMouseUp}
                onMouseLeave={handleSimMouseUp}
                onWheel={handleSimWheel}
              >
                <div
                  className="absolute top-0 left-0 p-8"
                  style={{
                    transform: `translate(${simPan.x}px, ${simPan.y}px) scale(${simScale})`,
                    transformOrigin: "top left",
                  }}
                >
                  {simulation.labels.map((label, idx) => {
                    // Always render front and back horizontally within each label,
                    // regardless of overall layout mode (side-by-side or top-bottom).
                    const isSideBySide = simViewMode === "side-by-side";
                    const labelGap = 40;
                    const sideGap = 24;
                    const innerLabelWidth = mmToPx(widthMm) * 2 + sideGap;
                    const innerLabelHeight = mmToPx(heightMm);
                    const labelWidth = innerLabelWidth;
                    const labelHeight = innerLabelHeight;
                    const top = isSideBySide ? 0 : idx * (labelHeight + labelGap);
                    const left = isSideBySide ? idx * (labelWidth + labelGap) : 0;

                    return (
                      <div
                        key={idx}
                        className="absolute"
                        style={{ top, left, width: labelWidth, height: labelHeight }}
                      >
                        <div className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs">
                            {idx + 1}
                          </span>
                          Label {idx + 1}
                        </div>
                        <div className="flex flex-row gap-4">
                          {(["front", "back"] as const).map((side) => {
                            const sidePadding = getPadding(side);
                            const paddingGuideRects = getPaddingGuideRects(side);
                            const displayLabel = `label ${idx + 1} ${side}`;
                            return (
                              <div key={side} className="space-y-1">
                                <div className="text-xs font-medium text-[var(--foreground)]/60 capitalize flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${side === "front" ? "bg-[var(--accent)]" : "bg-[var(--secondary)]"}`} />
                                  {displayLabel}
                                </div>
                                <svg width={mmToPx(widthMm)} height={mmToPx(heightMm)} className="bg-white border border-[var(--border)] shadow-sm">
                                  {(() => {
                                    const foldGuide = getFoldGuide(side);
                                    if (!foldGuide) return null;
                                    return (
                                      <line
                                        x1={foldGuide.x1}
                                        y1={foldGuide.y1}
                                        x2={foldGuide.x2}
                                        y2={foldGuide.y2}
                                        stroke="#DC2626"
                                        strokeWidth={1.5}
                                        strokeDasharray="4,4"
                                        pointerEvents="none"
                                      />
                                    );
                                  })()}
                                  {paddingGuideRects.map((pr, guideIdx) => (
                                    <rect
                                      key={`sim-padding-${side}-${guideIdx}`}
                                      x={mmToPx(pr.x)}
                                      y={mmToPx(pr.y)}
                                      width={Math.max(0, mmToPx(pr.w))}
                                      height={Math.max(0, mmToPx(pr.h))}
                                      fill="none"
                                      stroke="#059669"
                                      strokeWidth={1}
                                      strokeDasharray="4,4"
                                    />
                                  ))}
                                  {label[side].map((r) => (
                                    <g key={r.regionId}>
                                      <rect
                                        x={mmToPx(r.x)}
                                        y={mmToPx(r.y)}
                                        width={mmToPx(r.widthMm)}
                                        height={mmToPx(r.heightMm)}
                                        fill={r.type === "fixed" ? "rgba(37,99,235,0.08)" : "rgba(5,150,98,0.08)"}
                                        stroke={r.type === "fixed" ? "#2563EB" : "#059669"}
                                      />
                                      {(() => {
                                        const layout = getRegionTextLayout(
                                          r,
                                          sidePadding,
                                          scale,
                                          Math.max(8, mmToPx(ptToMm(Math.max(4, config.fontSizePt))))
                                        );
                                        const fontFamily = getSimulationFontName();
                                        const fontSizePt = Math.max(4, config.fontSizePt);
                                        const previewFontSizePt = getPreviewFontPt(fontSizePt);
                                        const lineHeight = 1.25 * 1.02;

                                        return (
                                          <>
                                            <foreignObject
                                              x={layout.clipX}
                                              y={layout.clipY}
                                              width={layout.clipWidth}
                                              height={layout.clipHeight}
                                            >
                                              <div
                                                style={{
                                                  width: `${layout.clipWidth}px`,
                                                  height: `${layout.clipHeight}px`,
                                                  overflow: "hidden",
                                                  whiteSpace: "pre-wrap",
                                                  overflowWrap: config.allowSplitText ? "anywhere" : "normal",
                                                  wordBreak: config.allowSplitText ? "break-word" : "normal",
                                                  fontFamily,
                                                  fontSize: `${previewFontSizePt}pt`,
                                                  lineHeight: String(lineHeight),
                                                  color: "#333333",
                                                }}
                                              >
                                                {r.text}
                                              </div>
                                            </foreignObject>
                                            {config.connectionText &&
                                              r.text.includes(config.connectionText) && (
                                                <text
                                                  x={layout.textX}
                                                  y={layout.textY + layout.fontSizeUnits}
                                                  fontFamily={fontFamily}
                                                  fontSize={layout.fontSizeUnits}
                                                  fill="#059669"
                                                  opacity={0}
                                                >
                                                  {config.connectionText}
                                                </text>
                                              )}
                                            {layout.showOverflow &&
                                              layout.clipWidth > 0 &&
                                              layout.clipHeight > 0 && (
                                                <text
                                                  x={layout.overflowX}
                                                  y={layout.overflowY}
                                                  textAnchor="end"
                                                  fontFamily={fontFamily}
                                                  fontSize={layout.overflowFontSizeUnits}
                                                  fill="#EF4444"
                                                >
                                                  +
                                                </text>
                                              )}
                                          </>
                                        );
                                      })()}
                                      <text
                                        x={mmToPx(r.x + r.widthMm - 2)}
                                        y={mmToPx(r.y + 8)}
                                        textAnchor="end"
                                        fontSize={10}
                                        fill={r.type === "fixed" ? "#2563EB" : "#059669"}
                                      >
                                        {r.regionId}
                                      </text>
                                    </g>
                                  ))}
                                </svg>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {simulation.unplacedText && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-[var(--destructive)] flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Unplaced text: {simulation.unplacedText}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] bg-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-sm text-[var(--foreground)]/60">
                  {simulation.labels.length} label{simulation.labels.length > 1 ? "s" : ""} generated
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={exporting}
                    className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs hover:bg-[var(--muted)] cursor-pointer flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showExportMenu && (
                    <div className="absolute bottom-full left-0 mb-1 bg-white border border-[var(--border)] rounded-lg shadow-[var(--shadow-lg)] py-1 min-w-[140px] z-10">
                      <button
                        onClick={handleExportAI}
                        disabled={exporting}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--muted)] cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        SVG for Illustrator
                      </button>
                      <button
                        onClick={handleExportAIFile}
                        disabled={exporting}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--muted)] cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Illustrator (.ai)
                      </button>
                      <button
                        onClick={handleExportPDF}
                        disabled={exporting}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--muted)] cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        PDF (.pdf)
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowSimulationModal(false)}
                className="px-5 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showFixedDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-[var(--shadow-xl)] w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold">Add fixed content?</h3>
            <p className="text-sm text-[var(--foreground)]/60">
              Fixed regions were detected. After the first label flow, where should the fixed content go?
            </p>
            <div className="space-y-2">
              <button
                onClick={() => applyFixedOption("tail")}
                className="w-full p-3 border border-[var(--border)] rounded-lg text-left hover:bg-[var(--muted)] cursor-pointer"
              >
                <div className="font-medium text-sm">Add at overflow text tail</div>
                <div className="text-xs text-[var(--foreground)]/50">Append fixed text to the last back region</div>
              </button>
              <button
                onClick={() => applyFixedOption("new-label")}
                className="w-full p-3 border border-[var(--border)] rounded-lg text-left hover:bg-[var(--muted)] cursor-pointer"
              >
                <div className="font-medium text-sm">Create new label</div>
                <div className="text-xs text-[var(--foreground)]/50">Add one more front+back label for fixed content</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  }

  const renderConfigs = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Saved Split Configurations</h2>
        <button
          onClick={handleNewConfig}
          disabled={!!loadingSplitId}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          New
        </button>
      </div>
      {savedSplits.length === 0 ? (
        <div className="text-center py-12 bg-white border border-[var(--border)] rounded-xl text-[var(--foreground)]/50">
          No split configurations yet
        </div>
      ) : (
        <div className="space-y-3">
          {savedSplits.map((s) => {
            const isOpening = loadingSplitId === s.id;

            return (
              <div key={s.id} className="flex items-center justify-between p-4 bg-white border border-[var(--border)] rounded-xl">
                <div>
                  <div className="font-medium text-sm">{s.name}</div>
                  <div className="text-xs text-[var(--foreground)]/50">
                    Layout: {s.layout.name}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleLoadSplit(s.id)}
                    disabled={!!loadingSplitId}
                    className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isOpening ? "Loading..." : "Open"}
                  </button>
                  <button
                    onClick={() => handleDeleteSplit(s.id)}
                    disabled={!!loadingSplitId}
                    className="px-3 py-1.5 border border-red-200 text-[var(--destructive)] rounded-lg text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 space-y-6">
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes("success") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-[var(--destructive)] border border-red-200"}`}>
          {message}
        </div>
      )}

      {loadingSplitId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-xl bg-white px-6 py-4 text-sm font-semibold text-[var(--foreground)] shadow-[var(--shadow-xl)]">
            Loading...
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-[var(--border)]">
        <div className="flex">
          <button
            onClick={() => setActiveTab("editor")}
            className={`px-4 py-2 text-sm font-medium cursor-pointer ${activeTab === "editor" ? "border-b-2 border-[var(--primary)] text-[var(--primary)]" : "text-[var(--foreground)]/60"}`}
          >
            Editor
          </button>
          <button
            onClick={() => setActiveTab("configs")}
            className={`px-4 py-2 text-sm font-medium cursor-pointer ${activeTab === "configs" ? "border-b-2 border-[var(--primary)] text-[var(--primary)]" : "text-[var(--foreground)]/60"}`}
          >
            Saved Configs
          </button>
        </div>
        <div className="flex items-center gap-2 pr-2">
          <button
            onClick={handleSave}
            disabled={config.regions.length === 0}
            className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs cursor-pointer"
          >
            Save Configs
          </button>
          <button
            onClick={handleRunSimulation}
            disabled={config.regions.length === 0}
            className="px-4 py-1.5 bg-[var(--accent)] text-white rounded-lg text-xs font-semibold disabled:opacity-40 cursor-pointer"
          >
            Run Simulation
          </button>
        </div>
      </div>

      {activeTab === "editor" ? renderEditor() : renderConfigs()}
    </div>
  );
}
