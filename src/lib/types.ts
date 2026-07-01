export type Material = {
  id: string;
  name: string;
  imageUrl: string;
  displayOrder: number;
};

export type Orientation = "portrait" | "landscape";

export type CuttingType = "piece" | "loop";

export type SideType = "single" | "double";

export type EdgeType = "woven" | "slit";

export type LoopFoldOrientation = "vertical" | "horizontal";

export type PaddingOption = "same" | "individual";

export type ViewMode = "side-by-side" | "top-bottom";

export type ViewPanel =
  | "customer-create"
  | "customer-view"
  | "layout-create"
  | "layout-view"
  | "translation-create"
  | "translation-view"
  | "font-create"
  | "font-view";

export type PaddingValues = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type StepId =
  | "material"
  | "size"
  | "cutting"
  | "loop-details"
  | "padding"
  | "final";

export type LayoutData = {
  id?: string;
  name: string;
  materialId: string;
  sideType: SideType;
  edgeType: EdgeType;
  widthMm: number;
  heightMm: number;
  orientation: Orientation;
  cuttingType: CuttingType;
  loopFoldOrientation?: LoopFoldOrientation;
  loopMidForm?: boolean;
  loopFoldDistanceMm?: number;
  paddingOption: PaddingOption;
  padding: PaddingValues;
  paddingRegion2?: PaddingValues;
  paddingSyncRegions?: boolean;
  viewMode: ViewMode;
  isBackFlipped?: boolean;
};
