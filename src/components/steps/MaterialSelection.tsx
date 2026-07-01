"use client";

import { useEffect } from "react";
import { useLayoutStore } from "@/store/layoutStore";
import type { SideType, EdgeType } from "@/lib/types";

const defaultMaterials = [
  {
    id: "satin",
    name: "Satin",
    imageUrl: "/materials/satin.svg",
    displayOrder: 1,
  },
  {
    id: "cotton",
    name: "Cotton",
    imageUrl: "/materials/cotton.svg",
    displayOrder: 2,
  },
  {
    id: "polyester",
    name: "Polyester",
    imageUrl: "/materials/polyester.svg",
    displayOrder: 3,
  },
];

const materialIcons: Record<string, React.ReactNode> = {
  Satin: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  Cotton: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  ),
  Polyester: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
};

const sideOptions: { value: SideType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: "single",
    label: "Single Side",
    desc: "Print on one side only",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <line x1="7" y1="10" x2="17" y2="10" />
        <line x1="7" y1="13" x2="14" y2="13" />
      </svg>
    ),
  },
  {
    value: "double",
    label: "Double Side",
    desc: "Print on front and back",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path d="M4 8c0-1.1.9-2 2-2h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
        <path d="M4 10h16" strokeDasharray="2 2" />
        <path d="M9 6V4h6v2" />
      </svg>
    ),
  },
];

const edgeOptions: { value: EdgeType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: "woven",
    label: "Woven Edge",
    desc: "Soft finished woven border",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <rect x="4" y="6" width="16" height="12" rx="1" />
        <path d="M4 8h16M4 16h16" />
        <path d="M6 6v12M18 6v12" />
      </svg>
    ),
  },
  {
    value: "slit",
    label: "Slit Edge",
    desc: "Clean cut slit border",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <rect x="4" y="6" width="16" height="12" rx="1" />
        <line x1="4" y1="6" x2="4" y2="18" strokeDasharray="1.5 1.5" />
        <line x1="20" y1="6" x2="20" y2="18" strokeDasharray="1.5 1.5" />
      </svg>
    ),
  },
];

export default function MaterialSelection() {
  const materials = useLayoutStore((s) => s.materials);
  const setMaterials = useLayoutStore((s) => s.setMaterials);
  const selectedId = useLayoutStore((s) => s.data.materialId);
  const setMaterialId = useLayoutStore((s) => s.setMaterialId);
  const sideType = useLayoutStore((s) => s.data.sideType);
  const setSideType = useLayoutStore((s) => s.setSideType);
  const edgeType = useLayoutStore((s) => s.data.edgeType);
  const setEdgeType = useLayoutStore((s) => s.setEdgeType);
  const setStep = useLayoutStore((s) => s.setStep);

  useEffect(() => {
    if (materials.length === 0) {
      setMaterials(defaultMaterials);
    }
  }, [materials.length, setMaterials]);

  const list = materials.length > 0 ? materials : defaultMaterials;
  const hasMaterial = Boolean(selectedId);
  const canProceed = hasMaterial && sideType != null && edgeType != null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">Choose Material</h2>
        <p className="text-sm text-[var(--foreground)]/50 mt-1">Select the fabric type for your care label</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {list.map((m) => {
          const isSelected = selectedId === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMaterialId(m.id)}
              className={`relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-[var(--shadow-md)]"
                  : "border-[var(--border)] bg-white hover:border-[var(--primary)]/30 hover:shadow-[var(--shadow-sm)]"
              }`}
            >
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center transition-colors duration-200 ${
                isSelected ? "bg-[var(--primary)] text-white" : "bg-[var(--muted)] text-[var(--foreground)]/60"
              }`}>
                {materialIcons[m.name]}
              </div>
              <span className="text-sm font-semibold text-[var(--foreground)]">{m.name}</span>
              {isSelected && (
                <span className="absolute top-3 right-3 w-5 h-5 bg-[var(--primary)] rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {hasMaterial && (
        <div className="space-y-6 animate-[fadeIn_0.25s_ease-out]">
          <div className="h-px bg-[var(--border)]" />

          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Side Configuration</h3>
            <p className="text-sm text-[var(--foreground)]/50 mt-1">Will the label be printed on one side or both sides?</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sideOptions.map((opt) => {
              const isSelected = sideType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSideType(opt.value)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer text-left ${
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-[var(--shadow-sm)]"
                      : "border-[var(--border)] bg-white hover:border-[var(--primary)]/30"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200 ${
                    isSelected ? "bg-[var(--primary)] text-white" : "bg-[var(--muted)] text-[var(--foreground)]/60"
                  }`}>
                    {opt.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground)]/50 mt-0.5">{opt.desc}</p>
                  </div>
                  {isSelected && (
                    <span className="ml-auto w-5 h-5 bg-[var(--primary)] rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Edge Finish</h3>
            <p className="text-sm text-[var(--foreground)]/50 mt-1">Choose how the label edges will be finished</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {edgeOptions.map((opt) => {
              const isSelected = edgeType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setEdgeType(opt.value)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer text-left ${
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-[var(--shadow-sm)]"
                      : "border-[var(--border)] bg-white hover:border-[var(--primary)]/30"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200 ${
                    isSelected ? "bg-[var(--primary)] text-white" : "bg-[var(--muted)] text-[var(--foreground)]/60"
                  }`}>
                    {opt.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground)]/50 mt-0.5">{opt.desc}</p>
                  </div>
                  {isSelected && (
                    <span className="ml-auto w-5 h-5 bg-[var(--primary)] rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setStep("size")}
          disabled={!canProceed}
          className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-200 cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  );
}
