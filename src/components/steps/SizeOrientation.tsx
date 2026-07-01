"use client";

import { useLayoutStore } from "@/store/layoutStore";
import type { Orientation } from "@/lib/types";
import LabelCanvas from "../canvas/LabelCanvas";

export default function SizeOrientation() {
  const data = useLayoutStore((s) => s.data);
  const setSize = useLayoutStore((s) => s.setSize);
  const setOrientation = useLayoutStore((s) => s.setOrientation);
  const setStep = useLayoutStore((s) => s.setStep);

  const hasValidSize = data.widthMm > 0 && data.heightMm > 0;

  const handleWidthChange = (value: string) => {
    const parsed = value === "" ? 0 : Math.max(0, Number(value));
    setSize(parsed, data.heightMm);
  };

  const handleHeightChange = (value: string) => {
    const parsed = value === "" ? 0 : Math.max(0, Number(value));
    setSize(data.widthMm, parsed);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">Size &amp; Orientation</h2>
        <p className="text-sm text-[var(--foreground)]/50 mt-1">Set label dimensions in millimeters</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-[var(--foreground)]/80 mb-3">Orientation</label>
        <div className="grid grid-cols-2 gap-4">
          {(["portrait", "landscape"] as Orientation[]).map((o) => (
            <button
              key={o}
              onClick={() => setOrientation(o)}
              className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                data.orientation === o
                  ? "border-[var(--primary)] bg-[var(--primary)]/5"
                  : "border-[var(--border)] bg-white hover:border-[var(--primary)]/30"
              }`}
            >
              <svg
                className={`${o === "portrait" ? "rotate-0" : "rotate-90"} w-6 h-6 text-[var(--foreground)]/60`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <rect x="4" y="2" width="16" height="20" rx="2" />
              </svg>
              <span className="text-sm font-semibold capitalize text-[var(--foreground)]">{o}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-[var(--foreground)]/80 mb-2">Width (mm)</label>
          <input
            type="number"
            min={0}
            max={500}
            value={data.widthMm || ""}
            onChange={(e) => handleWidthChange(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition-all duration-200"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-[var(--foreground)]/80 mb-2">Height (mm)</label>
          <input
            type="number"
            min={0}
            max={500}
            value={data.heightMm || ""}
            onChange={(e) => handleHeightChange(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition-all duration-200"
          />
        </div>
      </div>

      <div className="bg-white border border-[var(--border)] rounded-xl p-5 shadow-[var(--shadow-sm)]">
        <p className="text-sm font-semibold text-[var(--foreground)]/80 mb-3">Preview</p>
        <div className="bg-[var(--muted)] rounded-xl p-6 flex items-center justify-center min-h-[220px]">
          {hasValidSize ? (
            <LabelCanvas
              widthMm={data.widthMm}
              heightMm={data.heightMm}
              orientation={data.orientation}
              maxDisplayPx={300}
              showDimensions
            />
          ) : (
            <div className="text-center text-sm text-[var(--foreground)]/50">
              Enter width and height to preview the label
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={() => setStep("material")} className="px-6 py-2.5 text-sm font-medium text-[var(--foreground)]/60 hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-all duration-200 cursor-pointer">
          Back
        </button>
        <button
          onClick={() => setStep("cutting")}
          disabled={!hasValidSize}
          className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
