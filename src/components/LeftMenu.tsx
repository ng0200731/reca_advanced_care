"use client";

import { useEffect } from "react";
import { useLayoutStore } from "@/store/layoutStore";
import type { ViewPanel } from "@/lib/types";

type MenuSection = {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: { id: ViewPanel; label: string }[];
};

function MenuChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-[var(--foreground)]/40 transition-transform duration-200 ${
        expanded ? "rotate-90" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  );
}

const topSections: MenuSection[] = [
  {
    key: "customer",
    label: "Customer",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5" />
      </svg>
    ),
    items: [
      { id: "customer-create", label: "Create" },
      { id: "customer-view", label: "View" },
    ],
  },
  {
    key: "layout",
    label: "Layout",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
    items: [
      { id: "layout-create", label: "Create" },
      { id: "layout-view", label: "View" },
    ],
  },
  {
    key: "translation",
    label: "Translation",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.5 2.5l-2 7m-2 0h5m-5 0l-1 4m13-4h2m-2 0l-2 7m-2 0h5m-5 0l-1 4" />
      </svg>
    ),
    items: [
      { id: "translation-create", label: "Create" },
      { id: "translation-view", label: "View" },
    ],
  },
  {
    key: "font",
    label: "Font",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
    items: [
      { id: "font-create", label: "Upload" },
      { id: "font-view", label: "View" },
    ],
  },
];

export default function LeftMenu({ onNavigate }: { onNavigate?: () => void }) {
  const viewPanel = useLayoutStore((s) => s.viewPanel);
  const setViewPanel = useLayoutStore((s) => s.setViewPanel);
  const menuExpanded = useLayoutStore((s) => s.menuExpanded);
  const setMenuExpanded = useLayoutStore((s) => s.setMenuExpanded);
  const savedLayouts = useLayoutStore((s) => s.savedLayouts);

  const isActive = (id: ViewPanel) => viewPanel === id;

  const handleSetViewPanel = (panel: ViewPanel) => {
    setViewPanel(panel);
    onNavigate?.();
  };

  const toggleSection = (key: string) => {
    setMenuExpanded(key, !menuExpanded[key]);
  };

  useEffect(() => {
    topSections.forEach((section) => {
      if (section.items.some((item) => item.id === viewPanel)) {
        setMenuExpanded(section.key, true);
      }
    });
  }, [viewPanel, setMenuExpanded]);

  return (
    <div className="w-full h-full flex flex-col bg-white border-r border-[var(--border)] overflow-y-auto">
      <div className="p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--foreground)] leading-tight">WashCare Label</h1>
            <p className="text-xs text-[var(--foreground)]/50">Design Studio</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="mb-2 px-3">
          <span className="text-[11px] font-semibold text-[var(--foreground)]/40 uppercase tracking-wider">
            Workspace
          </span>
        </div>

        <div className="space-y-1">
          {topSections.map((section) => {
            const expanded = !!menuExpanded[section.key];
            const hasActiveItem = section.items.some((item) => isActive(item.id));
            return (
              <div key={section.key} className="rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(section.key)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                    hasActiveItem
                      ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                      : "text-[var(--foreground)]/70 hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {section.icon}
                    <span>{section.label}</span>
                  </div>
                  <MenuChevron expanded={expanded} />
                </button>

                {expanded && (
                  <div className="pl-4 mt-1 space-y-1">
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSetViewPanel(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer ${
                          isActive(item.id)
                            ? "bg-[var(--primary)]/10 text-[var(--primary)] font-semibold"
                            : "text-[var(--foreground)]/60 hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActive(item.id) ? "bg-[var(--primary)]" : "bg-[var(--foreground)]/30"
                          }`}
                        />
                        <span>{item.label}</span>
                        {item.id === "layout-view" && savedLayouts.length > 0 && (
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                            {savedLayouts.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>


      </div>

      <div className="p-4 border-t border-[var(--border)]">
        <div className="text-[10px] text-[var(--foreground)]/40 leading-relaxed">
          Use the workspace to create, preview, and export professional wash care labels.
        </div>
      </div>
    </div>
  );
}
