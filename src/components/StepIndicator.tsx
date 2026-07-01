"use client";

import { useLayoutStore } from "@/store/layoutStore";

const steps = [
  { id: "material", label: "Material" },
  { id: "size", label: "Size & Orientation" },
  { id: "cutting", label: "Cutting Type" },
  { id: "loop-details", label: "Loop Details" },
  { id: "padding", label: "Padding" },
  { id: "final", label: "Final View" },
] as const;

export default function StepIndicator() {
  const step = useLayoutStore((s) => s.step);
  const setStep = useLayoutStore((s) => s.setStep);
  const data = useLayoutStore((s) => s.data);

  const stepOrder = steps.map((s) => s.id);
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {steps.map((s, idx) => {
          const isActive = s.id === step;
          const isPast = idx < currentIdx;
          const isDisabled = s.id === "loop-details" && data.cuttingType !== "loop";

          return (
            <button
              key={s.id}
              disabled={isDisabled}
              onClick={() => !isDisabled && setStep(s.id)}
              className={`flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-[11px] sm:text-xs font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : isPast
                  ? "text-[var(--foreground)]/80 hover:bg-[var(--muted)] cursor-pointer"
                  : isDisabled
                  ? "text-[var(--foreground)]/30 cursor-not-allowed"
                  : "text-[var(--foreground)]/50 hover:bg-[var(--muted)] hover:text-[var(--foreground)]/70 cursor-pointer"
              }`}
            >
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
                  isActive
                    ? "bg-[var(--primary)] text-white"
                    : isPast
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "bg-[var(--muted)] text-[var(--foreground)]/40"
                }`}
              >
                {isPast ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </span>
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
