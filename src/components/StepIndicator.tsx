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

type StepId = (typeof steps)[number]["id"];

// Validation: each step requires certain fields to be set before it can be reached.
function isStepUnlocked(stepId: StepId, data: ReturnType<typeof useLayoutStore.getState>["data"]): boolean {
  switch (stepId) {
    case "material":
      return true; // first step is always reachable
    case "size":
      return !!data.materialId;
    case "cutting":
      return !!data.materialId && data.widthMm > 0 && data.heightMm > 0;
    case "loop-details":
      return !!data.materialId && data.widthMm > 0 && data.heightMm > 0 && !!data.cuttingType;
    case "padding":
      return (
        !!data.materialId &&
        data.widthMm > 0 &&
        data.heightMm > 0 &&
        !!data.cuttingType &&
        (data.cuttingType !== "loop" ||
          (!!data.loopFoldOrientation && (data.loopMidForm || (data.loopFoldDistanceMm ?? 0) > 0)))
      );
    case "final":
      return (
        !!data.materialId &&
        data.widthMm > 0 &&
        data.heightMm > 0 &&
        !!data.cuttingType &&
        (data.cuttingType !== "loop" ||
          (!!data.loopFoldOrientation && (data.loopMidForm || (data.loopFoldDistanceMm ?? 0) > 0))) &&
        (data.padding.top >= 0 ||
          data.padding.right >= 0 ||
          data.padding.bottom >= 0 ||
          data.padding.left >= 0)
      );
    default:
      return false;
  }
}

// All steps that have been "unlocked" (i.e. have valid data) — these are always reachable backwards.
function getUnlockedSteps(data: ReturnType<typeof useLayoutStore.getState>["data"]): Set<StepId> {
  const unlocked = new Set<StepId>();
  for (const s of steps) {
    if (isStepUnlocked(s.id, data)) unlocked.add(s.id);
  }
  return unlocked;
}

export default function StepIndicator() {
  const step = useLayoutStore((s) => s.step);
  const setStep = useLayoutStore((s) => s.setStep);
  const data = useLayoutStore((s) => s.data);

  const stepOrder = steps.map((s) => s.id);
  const currentIdx = stepOrder.indexOf(step);
  const unlocked = getUnlockedSteps(data);

  const canJumpTo = (targetIdx: number) => {
    // Backwards navigation is always allowed to unlocked steps
    if (targetIdx <= currentIdx) return true;
    // Forwards: the target step must be unlocked (i.e. all previous required data is filled)
    return isStepUnlocked(steps[targetIdx].id, data);
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {steps.map((s, idx) => {
          const isActive = s.id === step;
          const isPast = idx < currentIdx;
          const reachable = canJumpTo(idx);

          return (
            <button
              key={s.id}
              disabled={!reachable}
              onClick={() => reachable && setStep(s.id)}
              className={`flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-[11px] sm:text-xs font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : isPast
                  ? "text-[var(--foreground)]/80 hover:bg-[var(--muted)] cursor-pointer"
                  : reachable
                  ? "text-[var(--foreground)]/50 hover:bg-[var(--muted)] hover:text-[var(--foreground)]/70 cursor-pointer"
                  : "text-[var(--foreground)]/30 cursor-not-allowed"
              }`}
              title={
                !reachable && idx > currentIdx
                  ? "Complete previous steps to unlock this step"
                  : undefined
              }
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
