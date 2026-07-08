export const CSS_PX_PER_MM = 96 / 25.4;

export function getPreviewCanvasFontPt(fontSizePt: number, renderUnitsPerMm: number) {
  return fontSizePt * (renderUnitsPerMm / CSS_PX_PER_MM);
}
