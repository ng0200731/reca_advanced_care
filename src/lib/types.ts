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
  | "split-workspace"
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
  sideType?: SideType;
  edgeType?: EdgeType;
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

export type SplitRegionType = "overflow" | "fixed";

export type SplitContentSourceType = "translation" | "manual";

export type SplitContentSource = {
  id: string;
  type: SplitContentSourceType;
  label: string;
  translationId?: number;
  manualText?: string;
};

export type SplitRegion = {
  id: string;
  regionId: string;
  side: "front" | "back";
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  type: SplitRegionType;
  overflowTargetId?: string;
  contentSourceId?: string;
};

export type SplitConfiguration = {
  id?: string;
  name: string;
  layoutId: string;
  fontId?: string;
  /** Font size in points (pt). Persisted to the legacy `fontSizeMm` DB column. */
  fontSizePt: number;
  allowSplitText: boolean;
  connectionText?: string;
  imageData?: string;
  imageOpacity: number;
  regions: SplitRegion[];
  contentSources: SplitContentSource[];
};
