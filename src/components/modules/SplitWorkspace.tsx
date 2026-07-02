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
  | { type: "draw"; startX: number; startY: number; currentX: number; currentY: number; startSnap: DrawSnap; endSnap: DrawSnap }
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
  const [drag, setDrag] = useState<DragState>(null);
  const [scale, setScale] = useState(4);
  const [showImage, setShowImage] = useState(true);
  const [simulation, setSimulation] = useState<ReturnType<typeof simulateOverflow> | null>(null);
  const [showFixedDialog, setShowFixedDialog] = useState(false);
  const [viewLabelIndex, setViewLabelIndex] = useState(0);
  const [viewSide, setViewSide] = useState<"front" | "back">("front");

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

  const loadImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setConfig((c) => ({ ...c, imageData: reader.result as string }));
      setMessage("Image pasted");
    };
    reader.readAsDataURL(file);
  }, []);

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
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
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

  const constrainRect = (x: number, y: number, w: number, h: number) => {
    const minX = paddingRect.x;
    const minY = paddingRect.y;
    const maxX = paddingRect.x + paddingRect.w;
    const maxY = paddingRect.y + paddingRect.h;
    const nx = Math.max(minX, Math.min(x, maxX));
    const ny = Math.max(minY, Math.min(y, maxY));
    let nw = Math.max(1, w);
    let nh = Math.max(1, h);
    if (nx + nw > maxX) nw = maxX - nx;
    if (ny + nh > maxY) nh = maxY - ny;
    return { x: nx, y: ny, w: nw, h: nh };
  };

  const paddingRect = useMemo(
    () => ({
      x: padding.left,
      y: padding.top,
      w: widthMm - padding.left - padding.right,
      h: heightMm - padding.top - padding.bottom,
    }),
    [padding.left, padding.top, padding.right, padding.bottom, widthMm, heightMm]
  );

  const isInsidePadding = (x: number, y: number) =>
    x >= paddingRect.x && x <= paddingRect.x + paddingRect.w && y >= paddingRect.y && y <= paddingRect.y + paddingRect.h;

  const getNearestPaddingCorner = (x: number, y: number): { x: number; y: number } | null => {
    const thresholdMm = 5 / scale;
    const corners = [
      { x: paddingRect.x, y: paddingRect.y },
      { x: paddingRect.x + paddingRect.w, y: paddingRect.y },
      { x: paddingRect.x, y: paddingRect.y + paddingRect.h },
      { x: paddingRect.x + paddingRect.w, y: paddingRect.y + paddingRect.h },
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

  const getNearestPaddingEdge = (x: number, y: number): { x: number; y: number } | null => {
    const thresholdMm = 5 / scale;
    const candidates = [
      { x, y: paddingRect.y },
      { x, y: paddingRect.y + paddingRect.h },
      { x: paddingRect.x, y },
      { x: paddingRect.x + paddingRect.w, y },
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

  const snapToPadding = (x: number, y: number): DrawSnap => {
    const corner = getNearestPaddingCorner(x, y);
    if (corner) return { ...corner, kind: "corner" };
    const edge = getNearestPaddingEdge(x, y);
    if (edge) return { ...edge, kind: "edge" };
    return { x, y, kind: null };
  };

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (!svgRef.current || widthMm === 0) return;
    const { x, y } = getMouseMm(e);

    // Check resize handles (4 corners + 4 edges)
    if (selectedRegionId) {
      const region = config.regions.find((r) => r.id === selectedRegionId);
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

    // Check existing regions
    const clickedRegion = [...config.regions]
      .reverse()
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
    const startSnap = snapToPadding(x, y);
    if (!isInsidePadding(startSnap.x, startSnap.y)) return;
    setSelectedRegionId(null);
    setDrag({
      type: "draw",
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
      const endSnap = snapToPadding(x, y);
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
      // Keep the entire region inside the green dotted padding rectangle
      const maxMoveX = paddingRect.x + paddingRect.w - region.widthMm;
      const maxMoveY = paddingRect.y + paddingRect.h - region.heightMm;
      const cx = maxMoveX >= paddingRect.x ? Math.max(paddingRect.x, Math.min(nx, maxMoveX)) : paddingRect.x;
      const cy = maxMoveY >= paddingRect.y ? Math.max(paddingRect.y, Math.min(ny, maxMoveY)) : paddingRect.y;
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

      const constrained = constrainRect(nx, ny, nw, nh);
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
        const constrained = constrainRect(x, y, w, h);
        addRegion(constrained.x, constrained.y, constrained.w, constrained.h);
      }
    }
    setDrag(null);
  };

  const addRegion = (x: number, y: number, w: number, h: number) => {
    const newRegion: SplitRegion = {
      id: generateId(),
      regionId: `R${config.regions.length + 1}`,
      side: "front",
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

  const addContentSource = (type: SplitContentSource["type"]) => {
    const newSource: SplitContentSource = {
      id: generateId(),
      type,
      label: type === "manual" ? "Manual text" : "Translation table",
      manualText: type === "manual" ? "" : undefined,
    };
    setConfig((c) => ({ ...c, contentSources: [...c.contentSources, newSource] }));
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
    setSimulation(null);
    setActiveTab("editor");
  };

  const selectedRegion = config.regions.find((r) => r.id === selectedRegionId);

  const renderEditor = () => (
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
                  Upload image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && loadImageFile(e.target.files[0])}
                />
              </div>

              <svg
                ref={svgRef}
                width={mmToPx(widthMm)}
                height={mmToPx(heightMm)}
                className="bg-white border border-[var(--border)] shadow-[var(--shadow-sm)] cursor-crosshair"
                onMouseDown={handleSvgMouseDown}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={handleSvgMouseUp}
                onMouseLeave={handleSvgMouseUp}
              >
                {config.imageData && showImage && (
                  <image
                    href={config.imageData}
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
                  x={mmToPx(padding.left)}
                  y={mmToPx(padding.top)}
                  width={mmToPx(widthMm - padding.left - padding.right)}
                  height={mmToPx(heightMm - padding.top - padding.bottom)}
                  fill="none"
                  stroke="#059669"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />

                {/* Regions */}
                {config.regions.map((r) => (
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
                      {r.regionId} ({r.side})
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
                              {/* Larger invisible hit area for easier hover/click */}
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
                              {/* Visible handle */}
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
                {drag?.type === "draw" && (
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
                    {/* Start dot: yellow when snapped to a corner */}
                    {drag.startSnap.kind === "corner" && (
                      <circle cx={mmToPx(drag.startSnap.x)} cy={mmToPx(drag.startSnap.y)} r={5} fill="#FACC15" stroke="#B45309" strokeWidth={1} />
                    )}
                    {/* End dot: red on edge, yellow on corner */}
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

              <div className="text-xs text-[var(--foreground)]/50">
                Drag inside the green dotted region to draw regions. Click a region to select it and show resize handles; drag a selected region to pan it (kept inside the green dotted region). Max {MAX_REGIONS} regions (R1-R10).
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
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
                      .filter((r) => r.id !== selectedRegion.id)
                      .map((r) => (
                        <option key={r.id} value={r.regionId}>
                          {r.regionId} ({r.side})
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-[var(--foreground)]/60">Content source</label>
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
            <h3 className="font-semibold text-sm">Content Sources</h3>
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
                onClick={() => addContentSource("manual")}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs cursor-pointer"
              >
                + Manual text
              </button>
              <button
                onClick={() => addContentSource("translation")}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs cursor-pointer"
              >
                + Translation
              </button>
            </div>
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
            <div className="flex items-center gap-3">
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
              <div className="flex border border-[var(--border)] rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewSide("front")}
                  className={`px-3 py-1 text-xs cursor-pointer ${viewSide === "front" ? "bg-[var(--primary)] text-white" : ""}`}
                >
                  Front
                </button>
                <button
                  onClick={() => setViewSide("back")}
                  className={`px-3 py-1 text-xs cursor-pointer ${viewSide === "back" ? "bg-[var(--primary)] text-white" : ""}`}
                >
                  Back
                </button>
              </div>
            </div>
          </div>

          <svg width={mmToPx(widthMm)} height={mmToPx(heightMm)} className="bg-white border border-[var(--border)]">
            {simulation.labels[viewLabelIndex]?.[viewSide].map((r) => (
              <g key={r.regionId}>
                <rect
                  x={mmToPx(r.x)}
                  y={mmToPx(r.y)}
                  width={mmToPx(r.widthMm)}
                  height={mmToPx(r.heightMm)}
                  fill={r.type === "fixed" ? "rgba(37,99,235,0.08)" : "rgba(5,150,105,0.08)"}
                  stroke={r.type === "fixed" ? "#2563EB" : "#059669"}
                />
                <foreignObject x={mmToPx(r.x + padding.left)} y={mmToPx(r.y + padding.top)} width={mmToPx(r.widthMm - padding.left - padding.right)} height={mmToPx(r.heightMm - padding.top - padding.bottom)}>
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
