"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { SplitConfiguration, SplitRegion, SplitContentSource } from "@/lib/types";
import { simulateOverflow, applyFixedContentOption } from "@/lib/splitSimulation";

type SavedLayout = {
  id: string;
  name: string;
  details: {
    widthMm: number;
    heightMm: number;
    orientation: string;
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
  file_path: string;
};

type TranslationTable = {
  id: number;
  table_name: string;
};

type DrawSnap = { x: number; y: number; kind: "corner" | "edge" | null };

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
    fontSizeMm: 3,
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
  const [viewLabelIndex, setViewLabelIndex] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const getPadding = (side: "front" | "back") => {
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
    if (!font?.file_path) return;
    const styleId = "split-workspace-font";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `@font-face { font-family: 'SplitFont'; src: url('${font.file_path}'); }`;
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

  const mmToPx = (mm: number) => mm * scale;
  const pxToMm = (px: number) => px / scale;

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

  const getPaddingRect = (side: "front" | "back") => {
    const p = getPadding(side);
    return {
      x: p.left,
      y: p.top,
      w: widthMm - p.left - p.right,
      h: heightMm - p.top - p.bottom,
    };
  };

  const getBezierConnectionPath = (sx: number, sy: number, tx: number, ty: number) => {
    const distance = Math.hypot(tx - sx, ty - sy);
    const offset = Math.max(20 / scale, distance * 0.35);
    return `M ${mmToPx(sx)} ${mmToPx(sy)} C ${mmToPx(sx)} ${mmToPx(sy + offset)}, ${mmToPx(tx)} ${mmToPx(ty - offset)}, ${mmToPx(tx)} ${mmToPx(ty)}`;
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
    const pr = getPaddingRect(side);
    const nx = Math.max(pr.x, Math.min(x, pr.x + pr.w));
    const ny = Math.max(pr.y, Math.min(y, pr.y + pr.h));
    let nw = Math.max(1, w);
    let nh = Math.max(1, h);
    if (nx + nw > pr.x + pr.w) nw = pr.x + pr.w - nx;
    if (ny + nh > pr.y + pr.h) nh = pr.y + pr.h - ny;
    return { x: nx, y: ny, w: nw, h: nh };
  };

  const isInsidePadding = (x: number, y: number, side: "front" | "back") => {
    const pr = getPaddingRect(side);
    return x >= pr.x && x <= pr.x + pr.w && y >= pr.y && y <= pr.y + pr.h;
  };

  const getNearestPaddingCorner = (x: number, y: number, side: "front" | "back"): { x: number; y: number } | null => {
    const thresholdMm = 5 / scale;
    const pr = getPaddingRect(side);
    const corners = [
      { x: pr.x, y: pr.y },
      { x: pr.x + pr.w, y: pr.y },
      { x: pr.x, y: pr.y + pr.h },
      { x: pr.x + pr.w, y: pr.y + pr.h },
    ];
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
    const pr = getPaddingRect(side);
    const candidates = [
      { x, y: pr.y },
      { x, y: pr.y + pr.h },
      { x: pr.x, y },
      { x: pr.x + pr.w, y },
    ];
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

  const snapToPadding = (x: number, y: number, side: "front" | "back"): DrawSnap => {
    const corner = getNearestPaddingCorner(x, y, side);
    if (corner) return { ...corner, kind: "corner" };
    const edge = getNearestPaddingEdge(x, y, side);
    if (edge) return { ...edge, kind: "edge" };
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
      const otherRects = config.regions.filter((r) => r.id !== region.id);
      for (const r of otherRects) {
        snapTargetsX.push(r.x, r.x + r.widthMm, r.x - region.widthMm, r.x + r.widthMm - region.widthMm);
        snapTargetsY.push(r.y, r.y + r.heightMm, r.y - region.heightMm, r.y + r.heightMm - region.heightMm);
      }
      nx = snapValue(nx, snapTargetsX);
      ny = snapValue(ny, snapTargetsY);
      // Keep the entire region inside the green dotted padding rectangle for this side
      const pr = getPaddingRect(region.side);
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
      for (const r of config.regions.filter((r) => r.id !== region.id)) {
        snapTargetsX.push(r.x, r.x + r.widthMm);
        snapTargetsY.push(r.y, r.y + r.heightMm);
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
    const newSource: SplitContentSource = {
      id: generateId(),
      type,
      label: type === "manual" ? "Manual text" : "Translation table",
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
      }));
      setActiveSide("front");
      setSimulation(null);
      setViewLabelIndex(0);
    } catch {
      setMessage("Failed to load layout");
    }
  };

  const handleRunSimulation = () => {
    if (!selectedLayout?.details) return;
    const result = simulateOverflow(config, widthMm, heightMm, padding);
    const fixedRegions = config.regions.filter((r) => r.type === "fixed");
    if (fixedRegions.length > 0 && result.labels.length > 0) {
      setShowFixedDialog(true);
      setSimulation(result);
    } else {
      setSimulation(result);
    }
  };

  const applyFixedOption = (option: "tail" | "new-label") => {
    if (!simulation) return;
    const fixedRegions = config.regions.filter((r) => r.type === "fixed");
    const final = applyFixedContentOption(simulation, fixedRegions, config.contentSources, option);
    setSimulation(final);
    setShowFixedDialog(false);
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
        fontSizeMm: data.fontSizeMm,
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
          translationId: s.translationId ? Number(s.translationId) : undefined,
          manualText: s.manualText ? String(s.manualText) : undefined,
        })),
      });
      setSimulation(null);
      setActiveSide("front");
      setActiveTab("editor");
    } catch {
      setMessage("Failed to load split configuration");
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
          fontSizeMm: 3,
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
      fontSizeMm: 3,
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
      return (
        <svg
          key={side}
          ref={side === "front" ? svgRef : undefined}
          width={mmToPx(widthMm)}
          height={mmToPx(heightMm)}
          className={`bg-white border shadow-[var(--shadow-sm)] cursor-crosshair transition-colors ${activeSide === side ? "border-[var(--primary)]" : "border-[var(--border)]"}`}
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

            {/* Padding outline */}
            <rect
              x={mmToPx(sidePadding.left)}
              y={mmToPx(sidePadding.top)}
              width={mmToPx(widthMm - sidePadding.left - sidePadding.right)}
              height={mmToPx(heightMm - sidePadding.top - sidePadding.bottom)}
              fill="none"
              stroke="#059669"
              strokeWidth={1}
              strokeDasharray="4,4"
            />

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
                  return (
                    <path
                      key={`conn-${r.id}-${target.id}`}
                      d={getBezierConnectionPath(sx, sy, tx, ty)}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      opacity={0.8}
                      pointerEvents="none"
                    />
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
      const isTopBottom = viewMode === "top-bottom";
      const overlayW = isTopBottom ? svgW : 2 * svgW + gap;
      const overlayH = isTopBottom ? 2 * svgH + gap : svgH;

      const sideOrigin = (side: "front" | "back") => {
        if (side === "front") return { x: 0, y: 0 };
        return isTopBottom ? { x: 0, y: svgH + gap } : { x: svgW + gap, y: 0 };
      };

      const getOverlayBezierPath = (sx: number, sy: number, tx: number, ty: number) => {
        const distance = Math.hypot(tx - sx, ty - sy);
        const offset = Math.max(20, distance * 0.35);
        return `M ${sx} ${sy} C ${sx} ${sy + offset}, ${tx} ${ty - offset}, ${tx} ${ty}`;
      };

      return (
        <svg className="absolute top-0 left-0 pointer-events-none" width={overlayW} height={overlayH}>
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
              return (
                <path
                  key={`overlay-conn-${r.id}-${target.id}`}
                  d={getOverlayBezierPath(sx, sy, tx, ty)}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  opacity={0.8}
                />
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
                <div className="space-y-2">
                  <div className={`flex ${viewMode === "side-by-side" ? "flex-row" : "flex-col"} gap-4 px-2`}>
                    {(["front", "back"] as const).map((side) => {
                      const sideImage = parseSideImage(config.imageData, side);
                      return (
                        <div
                          key={side}
                          className={`flex-1 flex items-center justify-between ${activeSide === side ? "text-[var(--primary)]" : "text-[var(--foreground)]/80"}`}
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
                  <div className={`relative flex ${viewMode === "side-by-side" ? "flex-row" : "flex-col"} gap-4`}>
                    {renderSvg("front")}
                    {renderSvg("back")}
                    {renderConnectionOverlay()}
                  </div>
                </div>
              ) : (
                renderCanvasCard("front")
              )}

              <div className="text-xs text-[var(--foreground)]/50">
                Click a label to activate it (highlighted border). Paste/upload an image onto the active label. Drag inside the green dotted region to draw regions on the active side. Click a region to select it and show resize handles; drag a selected region to pan it. Max {MAX_REGIONS} regions (R1-R10).
              </div>
            </>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {selectedRegion && (
            <div className="bg-white border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{selectedRegion.regionId} Settings</h3>
                <button
                  onClick={() => deleteRegion(selectedRegion.id)}
                  className="text-[var(--destructive)] text-xs cursor-pointer"
                >
                  Delete
                </button>
              </div>
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
              <div>
                <label className="text-xs text-[var(--foreground)]/60">Content source for {selectedRegion.regionId}</label>
                <p className="text-xs text-[var(--foreground)]/40 mb-1">Pick one shared source for this region.</p>
                <select
                  value={selectedRegion.contentSourceId || ""}
                  onChange={(e) => updateRegion(selectedRegion.id, { contentSourceId: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm"
                >
                  <option value="">None</option>
                  {config.contentSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>X: {selectedRegion.x.toFixed(1)}mm</div>
                <div>Y: {selectedRegion.y.toFixed(1)}mm</div>
                <div>W: {selectedRegion.widthMm.toFixed(1)}mm</div>
                <div>H: {selectedRegion.heightMm.toFixed(1)}mm</div>
              </div>
            </div>
          )}

          <div className="bg-white border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-sm">Shared Content Sources</h3>
              <p className="text-xs text-[var(--foreground)]/50 mt-0.5">
                Create reusable text blocks here. Each region can be assigned one source.
              </p>
            </div>
            {config.contentSources.map((s) => (
              <div key={s.id} className="border border-[var(--border)] rounded-lg p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={s.label}
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
                    rows={2}
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
            {!selectedRegionId && config.contentSources.length === 0 && (
              <p className="text-xs text-[var(--foreground)]/40">Select a region first to auto-assign a new source to it.</p>
            )}
          </div>

          <div className="bg-white border border-[var(--border)] rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Overflow Options</h3>
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
              <label className="text-xs text-[var(--foreground)]/60">Font size (mm)</label>
              <input
                type="number"
                min={1}
                max={20}
                step={0.5}
                value={config.fontSizeMm}
                onChange={(e) => setConfig((c) => ({ ...c, fontSizeMm: Number(e.target.value) }))}
                className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleRunSimulation}
            disabled={config.regions.length === 0}
            className="w-full px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-semibold disabled:opacity-40 cursor-pointer"
          >
            Run Simulation
          </button>
        </div>
      </div>

      {simulation && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Simulation Result</h3>
            <select
              value={viewLabelIndex}
              onChange={(e) => setViewLabelIndex(Number(e.target.value))}
              className="px-2 py-1 border border-[var(--border)] rounded-lg text-sm"
            >
              {simulation.labels.map((_, idx) => (
                <option key={idx} value={idx}>
                  Label {idx + 1}
                </option>
              ))}
            </select>
          </div>

          <div className={`flex ${selectedLayout?.details?.viewMode === "top-bottom" ? "flex-col" : "flex-row"} gap-4`}>
            {(["front", "back"] as const).map((side) => {
              const sidePadding = getPadding(side);
              return (
                <div key={side} className="space-y-1">
                  <div className="text-xs font-medium text-[var(--foreground)]/70 capitalize">{side}</div>
                  <svg width={mmToPx(widthMm)} height={mmToPx(heightMm)} className="bg-white border border-[var(--border)]">
                    {simulation.labels[viewLabelIndex]?.[side].map((r) => (
                      <g key={r.regionId}>
                        <rect
                          x={mmToPx(r.x)}
                          y={mmToPx(r.y)}
                          width={mmToPx(r.widthMm)}
                          height={mmToPx(r.heightMm)}
                          fill={r.type === "fixed" ? "rgba(37,99,235,0.08)" : "rgba(5,150,105,0.08)"}
                          stroke={r.type === "fixed" ? "#2563EB" : "#059669"}
                        />
                        <foreignObject x={mmToPx(r.x + sidePadding.left)} y={mmToPx(r.y + sidePadding.top)} width={mmToPx(r.widthMm - sidePadding.left - sidePadding.right)} height={mmToPx(r.heightMm - sidePadding.top - sidePadding.bottom)}>
                          <div
                            className="leading-tight overflow-hidden"
                            style={{
                              fontFamily: config.fontId ? "SplitFont, sans-serif" : "sans-serif",
                              fontSize: Math.max(8, mmToPx(config.fontSizeMm) * 0.8),
                            }}
                          >
                            {r.text.split("\n").map((line, i) => (
                              <div key={i}>{line}</div>
                            ))}
                          </div>
                        </foreignObject>
                        <text x={mmToPx(r.x + r.widthMm - 2)} y={mmToPx(r.y + 8)} textAnchor="end" fontSize={10} fill={r.type === "fixed" ? "#2563EB" : "#059669"}>
                          {r.regionId}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              );
            })}
          </div>

          {simulation.unplacedText && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-[var(--destructive)]">
              Unplaced text: {simulation.unplacedText}
            </div>
          )}
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
};

  const renderConfigs = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Saved Split Configurations</h2>
        <button
          onClick={handleNewConfig}
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
          {savedSplits.map((s) => (
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
                  className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs cursor-pointer"
                >
                  Open
                </button>
                <button
                  onClick={() => handleDeleteSplit(s.id)}
                  className="px-3 py-1.5 border border-red-200 text-[var(--destructive)] rounded-lg text-xs cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
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

      <div className="flex border-b border-[var(--border)]">
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

      {activeTab === "editor" ? renderEditor() : renderConfigs()}
    </div>
  );
}
