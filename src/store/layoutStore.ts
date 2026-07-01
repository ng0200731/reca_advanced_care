"use client";

import { create } from "zustand";
import type {
  LayoutData,
  StepId,
  Material,
  Orientation,
  CuttingType,
  SideType,
  EdgeType,
  LoopFoldOrientation,
  PaddingOption,
  PaddingValues,
  ViewMode,
  ViewPanel,
} from "@/lib/types";

const defaultPadding: PaddingValues = { top: 0, right: 0, bottom: 0, left: 0 };

type LayoutStore = {
  step: StepId;
  materials: Material[];
  data: LayoutData;
  isDirty: boolean;
  savedLayouts: { id: string; name: string }[];
  viewPanel: ViewPanel;
  menuExpanded: Record<string, boolean>;

  setStep: (step: StepId) => void;
  setMaterials: (materials: Material[]) => void;
  setViewPanel: (panel: ViewPanel) => void;
  setMenuExpanded: (key: string, expanded: boolean) => void;
  setSavedLayouts: (list: { id: string; name: string }[]) => void;

  setMaterialId: (id: string) => void;
  setSideType: (t: SideType) => void;
  setEdgeType: (t: EdgeType) => void;
  setSize: (widthMm: number, heightMm: number) => void;
  setOrientation: (o: Orientation) => void;
  setCuttingType: (t: CuttingType) => void;
  setLoopFoldOrientation: (o: LoopFoldOrientation | undefined) => void;
  setLoopMidForm: (v: boolean) => void;
  setLoopFoldDistance: (mm: number) => void;
  setPaddingOption: (o: PaddingOption) => void;
  setPadding: (p: PaddingValues) => void;
  setPaddingRegion2: (p: PaddingValues) => void;
  setPaddingSyncRegions: (v: boolean) => void;
  setViewMode: (m: ViewMode) => void;
  setIsBackFlipped: (v: boolean) => void;
  setLayoutName: (name: string) => void;
  loadLayout: (data: LayoutData) => void;
  reset: () => void;
  markClean: () => void;
};

const initialData: LayoutData = {
  name: "",
  materialId: "",
  widthMm: 0,
  heightMm: 0,
  orientation: "portrait",
  cuttingType: "piece",
  paddingOption: "same",
  padding: { ...defaultPadding },
  viewMode: "side-by-side",
  isBackFlipped: false,
};

export const useLayoutStore = create<LayoutStore>((set) => ({
  step: "material",
  materials: [],
  data: { ...initialData },
  isDirty: false,
  savedLayouts: [],
  viewPanel: "layout-create",
  menuExpanded: {},

  setStep: (step) => set({ step }),
  setMaterials: (materials) => set({ materials }),
  setViewPanel: (viewPanel) => set({ viewPanel }),
  setMenuExpanded: (key, expanded) =>
    set((s) => ({ menuExpanded: { ...s.menuExpanded, [key]: expanded } })),
  setSavedLayouts: (savedLayouts) => set({ savedLayouts }),

  setMaterialId: (materialId) =>
    set((s) => ({ data: { ...s.data, materialId }, isDirty: true })),
  setSideType: (sideType) =>
    set((s) => ({ data: { ...s.data, sideType }, isDirty: true })),
  setEdgeType: (edgeType) =>
    set((s) => ({ data: { ...s.data, edgeType }, isDirty: true })),
  setSize: (widthMm, heightMm) =>
    set((s) => ({ data: { ...s.data, widthMm, heightMm }, isDirty: true })),
  setOrientation: (orientation) =>
    set((s) => ({ data: { ...s.data, orientation }, isDirty: true })),
  setCuttingType: (cuttingType) =>
    set((s) => ({
      data: {
        ...s.data,
        cuttingType,
        loopFoldOrientation: undefined,
        loopMidForm: undefined,
        loopFoldDistanceMm: undefined,
        paddingRegion2: undefined,
      },
      isDirty: true,
    })),
  setLoopFoldOrientation: (loopFoldOrientation) =>
    set((s) => ({ data: { ...s.data, loopFoldOrientation }, isDirty: true })),
  setLoopMidForm: (loopMidForm) =>
    set((s) => ({ data: { ...s.data, loopMidForm }, isDirty: true })),
  setLoopFoldDistance: (loopFoldDistanceMm) =>
    set((s) => ({ data: { ...s.data, loopFoldDistanceMm }, isDirty: true })),
  setPaddingOption: (paddingOption) =>
    set((s) => ({ data: { ...s.data, paddingOption }, isDirty: true })),
  setPadding: (padding) =>
    set((s) => ({
      data: {
        ...s.data,
        padding,
        paddingRegion2: s.data.paddingSyncRegions ? padding : s.data.paddingRegion2,
      },
      isDirty: true,
    })),
  setPaddingRegion2: (paddingRegion2) =>
    set((s) => ({ data: { ...s.data, paddingRegion2 }, isDirty: true })),
  setPaddingSyncRegions: (paddingSyncRegions) =>
    set((s) => ({
      data: {
        ...s.data,
        paddingSyncRegions,
        paddingRegion2: paddingSyncRegions ? s.data.padding : s.data.paddingRegion2,
      },
      isDirty: true,
    })),
  setViewMode: (viewMode) =>
    set((s) => ({ data: { ...s.data, viewMode }, isDirty: true })),
  setIsBackFlipped: (isBackFlipped) =>
    set((s) => ({ data: { ...s.data, isBackFlipped }, isDirty: true })),
  setLayoutName: (name) =>
    set((s) => ({ data: { ...s.data, name }, isDirty: true })),
  loadLayout: (data) => set({ data, isDirty: false }),
  reset: () => set({ data: { ...initialData }, step: "material", isDirty: false }),
  markClean: () => set({ isDirty: false }),
}));
