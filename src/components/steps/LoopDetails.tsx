"use client";

import { useLayoutStore } from "@/store/layoutStore";
import type { LoopFoldOrientation } from "@/lib/types";
import LabelCanvas from "../canvas/LabelCanvas";
import { getDisplayedDimensions } from "@/lib/utils";

export default function LoopDetails() {
  const data = useLayoutStore((s) => s.data);
  const setFoldOrientation = useLayoutStore((s) => s.setLoopFoldOrientation);
  const setMidForm = useLayoutStore((s) => s.setLoopMidForm);
  const setFoldDistance = useLayoutStore((s) => s.setLoopFoldDistance);
  const setStep = useLayoutStore((s) => s.setStep);

  const maxDistance =
    data.loopFoldOrientation === "vertical" ? data.widthMm : data.heightMm;

  const getMidDistance = (orientation: LoopFoldOrientation) => {
    const { w, h } = getDisplayedDimensions(data.widthMm, data.heightMm, data.orientation);
    return Math.round((orientation === "vertical" ? w : h) / 2);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">Loop Fold Details</h2>
        <p className="text-sm text-[var(--foreground)]/50 mt-1">Configure how the label folds</p>
      </div>

      <div className="flex items-center justify-between p-4 bg-white border border-[var(--border)] rounded-xl">
        <div>
          <label className="text-sm font-semibold text-[var(--foreground)]/80 block">Fold at exact mid point</label>
          <span className="text-xs text-[var(--foreground)]/50">
            {data.loopMidForm ? "Fold at exact mid point" : "Custom fold position"}
          </span>
        </div>
        <button
          onClick={() => {
            const newVal = !data.loopMidForm;
            setMidForm(newVal);
            if (newVal && data.loopFoldOrientation) {
              setFoldDistance(getMidDistance(data.loopFoldOrientation));
            }
          }}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
            data.loopMidForm ? "bg-[var(--primary)]" : "bg-[var(--foreground)]/20"
          }`}
          aria-pressed={data.loopMidForm}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              data.loopMidForm ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div>
        <label className="block text-sm font-semibold text-[var(--foreground)]/80 mb-3">Fold Orientation</label>
        <div className="grid grid-cols-2 gap-4">
          {(["vertical", "horizontal"] as LoopFoldOrientation[]).map((o) => (
            <button
              key={o}
              onClick={() => {
                setFoldOrientation(o);
                const mid = data.loopMidForm
                  ? getMidDistance(o)
                  : Math.round(maxDistance / 2);
                setFoldDistance(mid);
              }}
              className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                data.loopFoldOrientation === o
                  ? "border-[var(--primary)] bg-[var(--primary)]/5"
                  : "border-[var(--border)] bg-white hover:border-[var(--primary)]/30"
              }`}
            >
              <svg className="w-6 h-6 text-[var(--foreground)]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {o === "vertical" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M12 4v16" />
                )}
              </svg>
              <span className="text-sm font-semibold capitalize text-[var(--foreground)]">
                {o === "vertical" ? "Vertical fold" : "Horizontal fold"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!data.loopMidForm && data.loopFoldOrientation && (
        <div>
          <label className="block text-sm font-semibold text-[var(--foreground)]/80 mb-2">
            Fold distance from {data.loopFoldOrientation === "vertical" ? "left edge" : "top edge"} (mm)
          </label>
          <input
            type="number"
            min={1}
            max={maxDistance - 1}
            value={data.loopFoldDistanceMm ?? Math.round(maxDistance / 2)}
            onChange={(e) => {
              const v = Math.min(maxDistance - 1, Math.max(1, Number(e.target.value)));
              setFoldDistance(v);
            }}
            className="w-full max-w-[180px] px-3.5 py-2.5 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition-all duration-200"
          />
          <p className="text-xs text-[var(--foreground)]/50 mt-2">Maximum: {maxDistance} mm</p>
        </div>
      )}

      {data.loopFoldOrientation && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-5 shadow-[var(--shadow-sm)]">
          <p className="text-sm font-semibold text-[var(--foreground)]/80 mb-3">Preview</p>
          <div className="bg-[var(--muted)] rounded-xl p-6 flex items-center justify-center min-h-[220px]">
            <LabelCanvas
              widthMm={data.widthMm}
              heightMm={data.heightMm}
              orientation={data.orientation}
              maxDisplayPx={300}
              foldOrientation={data.loopFoldOrientation}
              foldDistanceMm={data.loopFoldDistanceMm}
              foldMidForm={data.loopMidForm}
              showFold
              showDimensions
            />
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={() => setStep("cutting")} className="px-6 py-2.5 text-sm font-medium text-[var(--foreground)]/60 hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-all duration-200 cursor-pointer">
          Back
        </button>
        <button
          onClick={() => setStep("padding")}
          className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 active:scale-[0.98] transition-all duration-200 cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  );
}
