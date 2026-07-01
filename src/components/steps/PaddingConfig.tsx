"use client";

import { useLayoutStore } from "@/store/layoutStore";
import type { PaddingValues } from "@/lib/types";
import LabelCanvas from "../canvas/LabelCanvas";

function PaddingInputs({
  values,
  onChange,
  regionLabel,
}: {
  values: PaddingValues;
  onChange: (v: PaddingValues) => void;
  regionLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {(["top", "right", "bottom", "left"] as (keyof PaddingValues)[]).map((side) => (
        <div key={side}>
          <label className="block text-xs font-medium text-[var(--foreground)]/60 capitalize mb-1.5">
            {regionLabel ? `${regionLabel} ${side}` : side}
          </label>
          <input
            type="number"
            min={0}
            max={200}
            value={values[side]}
            onChange={(e) => onChange({ ...values, [side]: Math.max(0, Number(e.target.value)) })}
            className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition-all duration-200"
          />
        </div>
      ))}
    </div>
  );
}

export default function PaddingConfig() {
  const data = useLayoutStore((s) => s.data);
  const setPaddingOption = useLayoutStore((s) => s.setPaddingOption);
  const setPadding = useLayoutStore((s) => s.setPadding);
  const setPaddingRegion2 = useLayoutStore((s) => s.setPaddingRegion2);
  const setPaddingSyncRegions = useLayoutStore((s) => s.setPaddingSyncRegions);
  const setStep = useLayoutStore((s) => s.setStep);

  const isLoop = data.cuttingType === "loop";
  const hasFold = isLoop && data.loopFoldOrientation != null && (data.loopMidForm || data.loopFoldDistanceMm != null);
  const applyAll = data.paddingOption === "same";
  const syncRegions = data.paddingSyncRegions ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">Padding</h2>
        <p className="text-sm text-[var(--foreground)]/50 mt-1">
          {isLoop
            ? "Set inner padding for each region (green dotted area)"
            : "Set inner padding for the label (green dotted area)"}
        </p>
      </div>

      <div className="flex items-center justify-between p-4 bg-white border border-[var(--border)] rounded-xl">
        <div>
          <label className="text-sm font-semibold text-[var(--foreground)]/80 block">Apply all 4 sides</label>
          <span className="text-xs text-[var(--foreground)]/50">
            {applyAll ? "Same value for all sides" : "Custom per side"}
          </span>
        </div>
        <button
          onClick={() => {
            const newVal = data.paddingOption === "same" ? "individual" : "same";
            setPaddingOption(newVal);
            if (newVal === "same") {
              const val = data.padding.top;
              setPadding({ top: val, right: val, bottom: val, left: val });
            }
          }}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
            applyAll ? "bg-[var(--primary)]" : "bg-[var(--foreground)]/20"
          }`}
          aria-pressed={applyAll}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              applyAll ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {hasFold && (
        <div className="flex items-center justify-between p-4 bg-white border border-[var(--border)] rounded-xl">
          <div>
            <label className="text-sm font-semibold text-[var(--foreground)]/80 block">Apply to all regions</label>
            <span className="text-xs text-[var(--foreground)]/50">
              {syncRegions ? "Region 2 uses Region 1 padding" : "Region 2 can be set separately"}
            </span>
          </div>
          <button
            onClick={() => setPaddingSyncRegions(!syncRegions)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
              syncRegions ? "bg-[var(--primary)]" : "bg-[var(--foreground)]/20"
            }`}
            aria-pressed={syncRegions}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                syncRegions ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      <div className="bg-white border border-[var(--border)] rounded-xl p-5">
        <label className="block text-sm font-semibold text-[var(--foreground)]/80 mb-3">
          Region 1 {hasFold ? "(before fold)" : ""}
        </label>
        {applyAll ? (
          <div className="max-w-[140px]">
            <label className="block text-xs font-medium text-[var(--foreground)]/60 mb-1.5">All sides (mm)</label>
            <input
              type="number"
              min={0}
              max={200}
              value={data.padding.top}
              onChange={(e) => {
                const val = Math.max(0, Number(e.target.value));
                setPadding({ top: val, right: val, bottom: val, left: val });
              }}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition-all duration-200"
            />
          </div>
        ) : (
          <PaddingInputs values={data.padding} onChange={(v) => setPadding(v)} />
        )}
      </div>

      {hasFold && !syncRegions && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-5">
          <label className="block text-sm font-semibold text-[var(--foreground)]/80 mb-3">Region 2 (after fold)</label>
          {applyAll ? (
            <div className="max-w-[140px]">
              <label className="block text-xs font-medium text-[var(--foreground)]/60 mb-1.5">All sides (mm)</label>
              <input
                type="number"
                min={0}
                max={200}
                value={data.paddingRegion2?.top ?? 0}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value));
                  setPaddingRegion2({ top: val, right: val, bottom: val, left: val });
                }}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition-all duration-200"
              />
            </div>
          ) : (
            <PaddingInputs
              values={data.paddingRegion2 ?? { top: 0, right: 0, bottom: 0, left: 0 }}
              onChange={(v) => setPaddingRegion2(v)}
              regionLabel="R2"
            />
          )}
        </div>
      )}

      <div className="bg-white border border-[var(--border)] rounded-xl p-5 shadow-[var(--shadow-sm)]">
        <p className="text-sm font-semibold text-[var(--foreground)]/80 mb-3">Preview</p>
        <div className="bg-[var(--muted)] rounded-xl p-6 flex items-center justify-center min-h-[240px]">
          <LabelCanvas
            widthMm={data.widthMm}
            heightMm={data.heightMm}
            orientation={data.orientation}
            maxDisplayPx={300}
            foldOrientation={data.loopFoldOrientation}
            foldDistanceMm={data.loopFoldDistanceMm}
            foldMidForm={data.loopMidForm}
            showFold={isLoop}
            padding={data.padding}
            paddingRegion2={data.paddingRegion2}
            showPadding
            showDimensions
          />
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={() => setStep(isLoop ? "loop-details" : "cutting")} className="px-6 py-2.5 text-sm font-medium text-[var(--foreground)]/60 hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-all duration-200 cursor-pointer">
          Back
        </button>
        <button
          onClick={() => setStep("final")}
          className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 active:scale-[0.98] transition-all duration-200 cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  );
}
