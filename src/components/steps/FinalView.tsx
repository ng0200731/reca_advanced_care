"use client";

import { useRef } from "react";
import { useLayoutStore } from "@/store/layoutStore";
import type { ViewMode } from "@/lib/types";
import LabelCanvas from "../canvas/LabelCanvas";

export default function FinalView() {
  const data = useLayoutStore((s) => s.data);
  const previewPan = useLayoutStore((s) => s.previewPan);
  const previewZoom = useLayoutStore((s) => s.previewZoom);
  const setViewMode = useLayoutStore((s) => s.setViewMode);
  const setIsBackFlipped = useLayoutStore((s) => s.setIsBackFlipped);
  const setPreviewPan = useLayoutStore((s) => s.setPreviewPan);
  const setPreviewZoom = useLayoutStore((s) => s.setPreviewZoom);
  const setStep = useLayoutStore((s) => s.setStep);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; panX: number; panY: number } | null>(null);

  const isLoop = data.cuttingType === "loop";

  const viewModes: { value: ViewMode; label: string }[] = [
    { value: "side-by-side", label: "Side by Side" },
    { value: "top-bottom", label: "Top & Bottom" },
  ];

  const containerClass =
    data.viewMode === "side-by-side"
      ? "flex flex-col sm:flex-row gap-6 items-start justify-center"
      : "flex flex-col gap-6 items-center";

  const handleStageMouseDown = (e: React.MouseEvent) => {
    if (previewZoom <= 1) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: previewPan.x,
      panY: previewPan.y,
    };
  };

  const handleStageMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current?.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPreviewPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };

  const handleStageMouseUp = () => {
    if (dragRef.current) {
      dragRef.current.active = false;
    }
  };

  const handleStageWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    const nextZoom = Math.max(0.5, Math.min(4, previewZoom + delta));
    setPreviewZoom(nextZoom);
    if (nextZoom <= 1) {
      setPreviewPan({ x: 0, y: 0 });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">Final View</h2>
        <p className="text-sm text-[var(--foreground)]/50 mt-1">Review the complete label with dimensions</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 p-1 bg-[var(--muted)] rounded-lg">
          {viewModes.map((vm) => (
            <button
              key={vm.value}
              onClick={() => setViewMode(vm.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer ${
                data.viewMode === vm.value
                  ? "bg-white text-[var(--primary)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
              }`}
            >
              {vm.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative bg-white border border-[var(--border)] rounded-xl p-6 shadow-[var(--shadow-sm)]">
        <button
          onClick={() => setIsBackFlipped(!data.isBackFlipped)}
          className="absolute top-0 right-0 z-10 p-2 rounded-bl-lg border-b border-l border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]/70 hover:text-[var(--primary)] hover:border-[var(--primary)]/40 transition-all duration-200 cursor-pointer"
          aria-label="Flip back side"
          title="Flip back side"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <div
          className={`overflow-hidden min-h-[260px] ${previewZoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
          onWheel={handleStageWheel}
        >
          <div
            className={containerClass}
            style={{
              transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`,
              transformOrigin: "top left",
            }}
          >
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]/40 mb-2">Front</span>
              <LabelCanvas
                widthMm={data.widthMm}
                heightMm={data.heightMm}
                orientation={data.orientation}
                maxDisplayPx={isLoop ? 220 : 300}
                foldOrientation={data.loopFoldOrientation}
                foldDistanceMm={data.loopFoldDistanceMm}
                foldMidForm={data.loopMidForm}
                showFold={isLoop}
                padding={data.padding}
                paddingRegion2={data.paddingRegion2}
                showPadding
                showDimensions
                isFront
              />
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]/40 mb-2">Back</span>
              <LabelCanvas
                widthMm={data.widthMm}
                heightMm={data.heightMm}
                orientation={data.orientation}
                maxDisplayPx={isLoop ? 220 : 300}
                foldOrientation={data.loopFoldOrientation}
                foldDistanceMm={data.loopFoldDistanceMm}
                foldMidForm={data.loopMidForm}
                showFold={isLoop}
                padding={data.padding}
                paddingRegion2={data.paddingRegion2}
                showPadding
                showDimensions
                isFront={false}
                flipped={data.isBackFlipped}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[var(--border)] rounded-xl p-5 shadow-[var(--shadow-sm)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div className="flex justify-between sm:justify-start sm:gap-4">
            <span className="text-[var(--foreground)]/50">Material</span>
            <span className="text-[var(--foreground)] font-medium capitalize">{data.materialId || "-"}</span>
          </div>
          <div className="flex justify-between sm:justify-start sm:gap-4">
            <span className="text-[var(--foreground)]/50">Side</span>
            <span className="text-[var(--foreground)] font-medium capitalize">{data.sideType || "-"}</span>
          </div>
          <div className="flex justify-between sm:justify-start sm:gap-4">
            <span className="text-[var(--foreground)]/50">Edge</span>
            <span className="text-[var(--foreground)] font-medium capitalize">{data.edgeType || "-"}</span>
          </div>
          <div className="flex justify-between sm:justify-start sm:gap-4">
            <span className="text-[var(--foreground)]/50">Size</span>
            <span className="text-[var(--foreground)] font-medium">
              {data.widthMm > 0 && data.heightMm > 0
                ? `${data.widthMm} × ${data.heightMm} mm (${data.orientation})`
                : "-"}
            </span>
          </div>
          <div className="flex justify-between sm:justify-start sm:gap-4">
            <span className="text-[var(--foreground)]/50">Cutting</span>
            <span className="text-[var(--foreground)] font-medium capitalize">{data.cuttingType} form</span>
          </div>
          {isLoop && data.loopFoldOrientation && (
            <div className="flex justify-between sm:justify-start sm:gap-4">
              <span className="text-[var(--foreground)]/50">Fold</span>
              <span className="text-[var(--foreground)] font-medium">
                {data.loopFoldOrientation}, {data.loopMidForm ? "mid-form" : `${data.loopFoldDistanceMm}mm from edge`}
              </span>
            </div>
          )}
          <div className="flex justify-between sm:justify-start sm:gap-4 sm:col-span-2">
            <span className="text-[var(--foreground)]/50">Padding</span>
            <span className="text-[var(--foreground)] font-medium font-mono text-xs sm:text-sm">
              R1 T:{data.padding.top} R:{data.padding.right} B:{data.padding.bottom} L:{data.padding.left}
              {data.paddingRegion2 && (
                <> | R2 T:{data.paddingRegion2.top} R:{data.paddingRegion2.right} B:{data.paddingRegion2.bottom} L:{data.paddingRegion2.left}</>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={() => setStep("padding")} className="px-6 py-2.5 text-sm font-medium text-[var(--foreground)]/60 hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-all duration-200 cursor-pointer">
          Back
        </button>
      </div>
    </div>
  );
}
