import { jsPDF } from "jspdf";

export type PaddingValues = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export function mmToPixels(mm: number, dpi: number = 96): number {
  return (mm * dpi) / 25.4;
}

export function pixelsToMm(pixels: number, dpi: number = 96): number {
  return (pixels * 25.4) / dpi;
}

export function getDisplayedDimensions(
  widthMm: number,
  heightMm: number,
  orientation: "portrait" | "landscape"
): { w: number; h: number } {
  return {
    w: orientation === "portrait" ? widthMm : heightMm,
    h: orientation === "portrait" ? heightMm : widthMm,
  };
}

function getFoldDistance(
  foldOrientation: "vertical" | "horizontal",
  w: number,
  h: number,
  foldDistanceMm: number | undefined,
  foldMidForm: boolean
): number {
  if (foldMidForm) {
    return foldOrientation === "vertical" ? w / 2 : h / 2;
  }
  return foldDistanceMm ?? (foldOrientation === "vertical" ? w / 2 : h / 2);
}

export function generateSvgLabel(
  widthMm: number,
  heightMm: number,
  orientation: "portrait" | "landscape",
  foldOrientation?: "vertical" | "horizontal",
  foldDistanceMm?: number,
  padding?: PaddingValues,
  paddingRegion2?: PaddingValues,
  showPadding: boolean = false,
  showFold: boolean = false,
  showDimensions: boolean = false,
  foldMidForm: boolean = false,
  isFlipped: boolean = false,
  labelText?: { isFront: boolean }
): string {
  const { w, h } = getDisplayedDimensions(widthMm, heightMm, orientation);

  const parts: string[] = [];

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`);

  const shapes: string[] = [];
  const text: string[] = [];
  const dimensions: string[] = [];

  shapes.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="white" stroke="black" stroke-width="0.3"/>`);

  if (labelText) {
    if (labelText.isFront) {
      text.push(`<text x="${w / 2}" y="${h / 2 - 4}" text-anchor="middle" font-size="4" fill="#333">CARE LABEL</text>`);
      text.push(`<text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" font-size="3" fill="#666">FRONT SIDE</text>`);
    } else {
      text.push(`<text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="4" fill="#333">BACK SIDE</text>`);
    }
  }

  if (showFold && foldOrientation) {
    const distance = getFoldDistance(foldOrientation, w, h, foldDistanceMm, foldMidForm);
    if (foldOrientation === "vertical") {
      const y2 = foldMidForm ? h / 2 : h;
      shapes.push(`<line x1="${distance}" y1="0" x2="${distance}" y2="${y2}" stroke="#DC2626" stroke-width="0.3" stroke-dasharray="2,2"/>`);
    } else {
      const x2 = foldMidForm ? w / 2 : w;
      shapes.push(`<line x1="0" y1="${distance}" x2="${x2}" y2="${distance}" stroke="#DC2626" stroke-width="0.3" stroke-dasharray="2,2"/>`);
    }
  }

  if (showPadding && padding) {
    const drawPad = (pad: PaddingValues, offsetX: number = 0, offsetY: number = 0, regionW: number = w, regionH: number = h) => {
      if (pad.top + pad.bottom >= regionH || pad.left + pad.right >= regionW) return;
      shapes.push(`<rect x="${offsetX + pad.left}" y="${offsetY + pad.top}" width="${regionW - pad.left - pad.right}" height="${regionH - pad.top - pad.bottom}" fill="none" stroke="#22c55e" stroke-width="0.3" stroke-dasharray="2,2"/>`);
    };

    if (foldOrientation) {
      const distance = getFoldDistance(foldOrientation, w, h, foldDistanceMm, foldMidForm);
      const r2Pad = paddingRegion2 || { top: 0, right: 0, bottom: 0, left: 0 };
      if (foldOrientation === "vertical") {
        drawPad(padding, 0, 0, distance, h);
        drawPad(r2Pad, distance, 0, w - distance, h);
      } else {
        drawPad(padding, 0, 0, w, distance);
        drawPad(r2Pad, 0, distance, w, h - distance);
      }
    } else {
      drawPad(padding);
    }
  }

  if (showDimensions) {
    const fontSize = 2.5;
    dimensions.push(`<text x="${w / 2}" y="${h + 3}" text-anchor="middle" font-size="${fontSize}" fill="#333">${w.toFixed(0)} mm</text>`);
    dimensions.push(`<text x="${w + 3}" y="${h / 2}" text-anchor="middle" font-size="${fontSize}" fill="#333" transform="rotate(90,${w + 3},${h / 2})">${h.toFixed(0)} mm</text>`);
  }

  const isBackFlipped = isFlipped && labelText && !labelText.isFront;

  if (isBackFlipped && foldOrientation === "vertical") {
    parts.push(`<g transform="scale(-1, 1) translate(-${w}, 0)">`);
    parts.push(...shapes);
    parts.push(`</g>`);
    parts.push(...text);
    parts.push(...dimensions);
  } else if (isBackFlipped) {
    parts.push(`<g transform="rotate(180, ${w / 2}, ${h / 2})">`);
    parts.push(...shapes);
    parts.push(...text);
    parts.push(`</g>`);
    parts.push(...dimensions);
  } else {
    parts.push(...shapes);
    parts.push(...text);
    parts.push(...dimensions);
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

export function generateCombinedSvgString(
  widthMm: number,
  heightMm: number,
  orientation: "portrait" | "landscape",
  viewMode: "side-by-side" | "top-bottom",
  isBackFlipped: boolean,
  foldOrientation?: "vertical" | "horizontal",
  foldDistanceMm?: number,
  padding?: PaddingValues,
  paddingRegion2?: PaddingValues,
  showPadding: boolean = true,
  showFold: boolean = false,
  foldMidForm: boolean = false
): string {
  const { w, h } = getDisplayedDimensions(widthMm, heightMm, orientation);
  const gapMm = 10;
  const marginMm = 8;
  const isSideBySide = viewMode === "side-by-side";
  const totalW = isSideBySide ? w * 2 + gapMm : w;
  const totalH = isSideBySide ? h : h * 2 + gapMm;
  const pageW = totalW + marginMm * 2;
  const pageH = totalH + marginMm * 2;

  const frontSvg = generateSvgLabel(
    widthMm,
    heightMm,
    orientation,
    foldOrientation,
    foldDistanceMm,
    padding,
    paddingRegion2,
    showPadding,
    showFold,
    true,
    foldMidForm,
    false,
    { isFront: true }
  );

  const backSvg = generateSvgLabel(
    widthMm,
    heightMm,
    orientation,
    foldOrientation,
    foldDistanceMm,
    padding,
    paddingRegion2,
    showPadding,
    showFold,
    true,
    foldMidForm,
    isBackFlipped,
    { isFront: false }
  );

  const stripSvg = (svg: string) =>
    svg.replace(/<[?]xml[^?]*[?]>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");

  const frontX = marginMm;
  const frontY = marginMm;
  const backX = isSideBySide ? marginMm + w + gapMm : marginMm;
  const backY = isSideBySide ? marginMm : marginMm + h + gapMm;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}">
  <rect x="0" y="0" width="${pageW}" height="${pageH}" fill="white"/>
  <g transform="translate(${frontX}, ${frontY})">
    ${stripSvg(frontSvg)}
  </g>
  <g transform="translate(${backX}, ${backY})">
    ${stripSvg(backSvg)}
  </g>
</svg>`;
}

const A_SERIES_MM = [
  { name: "A4", w: 210, h: 297 },
  { name: "A3", w: 297, h: 420 },
  { name: "A2", w: 420, h: 594 },
  { name: "A1", w: 594, h: 841 },
  { name: "A0", w: 841, h: 1189 },
];

export function findArtboardSize(
  reqW: number,
  reqH: number
): { w: number; h: number; name: string; orientation: "portrait" | "landscape" } {
  for (const size of A_SERIES_MM) {
    if (reqW <= size.w && reqH <= size.h) {
      return { w: size.w, h: size.h, name: size.name, orientation: "portrait" };
    }
    if (reqW <= size.h && reqH <= size.w) {
      return { w: size.h, h: size.w, name: size.name, orientation: "landscape" };
    }
  }
  return {
    w: reqW,
    h: reqH,
    name: "Custom",
    orientation: reqW > reqH ? "landscape" : "portrait",
  };
}

export function generatePdfLabel(
  widthMm: number,
  heightMm: number,
  orientation: "portrait" | "landscape",
  foldOrientation?: "vertical" | "horizontal",
  foldDistanceMm?: number,
  padding?: PaddingValues,
  paddingRegion2?: PaddingValues,
  showPadding: boolean = false,
  showFold: boolean = false,
  foldMidForm: boolean = false
): ArrayBuffer {
  const { w, h } = getDisplayedDimensions(widthMm, heightMm, orientation);

  const doc = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "mm",
    format: [w, h],
  });

  drawLabelOnPdf(doc, 0, 0, w, h, foldOrientation, foldDistanceMm, padding, paddingRegion2, showPadding, showFold, foldMidForm);

  return doc.output("arraybuffer") as ArrayBuffer;
}

function drawLabelOnPdf(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  foldOrientation?: "vertical" | "horizontal",
  foldDistanceMm?: number,
  padding?: PaddingValues,
  paddingRegion2?: PaddingValues,
  showPadding: boolean = false,
  showFold: boolean = false,
  foldMidForm: boolean = false
) {
  // Label outline
  doc.setDrawColor(0);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([], 0);
  doc.rect(x, y, w, h, "FD");

  // Fold line
  if (showFold && foldOrientation) {
    const distance = getFoldDistance(foldOrientation, w, h, foldDistanceMm, foldMidForm);
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 2], 0);

    if (foldOrientation === "vertical") {
      const y2 = foldMidForm ? h / 2 : h;
      doc.line(x + distance, y, x + distance, y + y2);
    } else {
      const x2 = foldMidForm ? w / 2 : w;
      doc.line(x, y + distance, x + x2, y + distance);
    }

    doc.setLineDashPattern([], 0);
  }

  // Padding rectangles
  if (showPadding && padding) {
    doc.setDrawColor(34, 197, 94);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 2], 0);

    const drawPad = (pad: PaddingValues, offsetX: number = 0, offsetY: number = 0, regionW: number = w, regionH: number = h) => {
      if (pad.top + pad.bottom >= regionH || pad.left + pad.right >= regionW) return;
      doc.rect(x + offsetX + pad.left, y + offsetY + pad.top, regionW - pad.left - pad.right, regionH - pad.top - pad.bottom, "S");
    };

    if (foldOrientation) {
      const distance = getFoldDistance(foldOrientation, w, h, foldDistanceMm, foldMidForm);
      const r2Pad = paddingRegion2 || { top: 0, right: 0, bottom: 0, left: 0 };
      if (foldOrientation === "vertical") {
        drawPad(padding, 0, 0, distance, h);
        drawPad(r2Pad, distance, 0, w - distance, h);
      } else {
        drawPad(padding, 0, 0, w, distance);
        drawPad(r2Pad, 0, distance, w, h - distance);
      }
    } else {
      drawPad(padding);
    }

    doc.setLineDashPattern([], 0);
  }
}

export async function generateCombinedPdfLabel(
  widthMm: number,
  heightMm: number,
  orientation: "portrait" | "landscape",
  viewMode: "side-by-side" | "top-bottom",
  isBackFlipped: boolean,
  foldOrientation?: "vertical" | "horizontal",
  foldDistanceMm?: number,
  padding?: PaddingValues,
  paddingRegion2?: PaddingValues,
  showPadding: boolean = true,
  showFold: boolean = false,
  foldMidForm: boolean = false
): Promise<ArrayBuffer> {
  const { w, h } = getDisplayedDimensions(widthMm, heightMm, orientation);
  const gapMm = 10;
  const marginMm = 8;
  const isSideBySide = viewMode === "side-by-side";
  const totalW = isSideBySide ? w * 2 + gapMm : w;
  const totalH = isSideBySide ? h : h * 2 + gapMm;
  const pageW = totalW + marginMm * 2;
  const pageH = totalH + marginMm * 2;

  const combinedSvg = generateCombinedSvgString(
    widthMm,
    heightMm,
    orientation,
    viewMode,
    isBackFlipped,
    foldOrientation,
    foldDistanceMm,
    padding,
    paddingRegion2,
    showPadding,
    showFold,
    foldMidForm
  );

  const doc = new jsPDF({
    orientation: pageW > pageH ? "landscape" : "portrait",
    unit: "mm",
    format: [pageW, pageH],
  });

  const svgBlob = new Blob([combinedSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

    const pngDataUrl = svgToPngDataUrl(img, pageW, pageH);
    doc.addImage(pngDataUrl, "PNG", 0, 0, pageW, pageH);
    return doc.output("arraybuffer") as ArrayBuffer;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function svgToPngDataUrl(
  img: HTMLImageElement,
  widthMm: number,
  heightMm: number,
  dpi: number = 300
): string {
  const canvas = document.createElement("canvas");
  const scale = dpi / 25.4;
  canvas.width = Math.max(1, Math.round(widthMm * scale));
  canvas.height = Math.max(1, Math.round(heightMm * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create canvas context");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function generateProductionPdfLabel(
  widthMm: number,
  heightMm: number,
  orientation: "portrait" | "landscape",
  viewMode: "side-by-side" | "top-bottom",
  isBackFlipped: boolean,
  foldOrientation?: "vertical" | "horizontal",
  foldDistanceMm?: number,
  padding?: PaddingValues,
  paddingRegion2?: PaddingValues,
  showPadding: boolean = true,
  showFold: boolean = false,
  foldMidForm: boolean = false
): Promise<ArrayBuffer> {
  const { w, h } = getDisplayedDimensions(widthMm, heightMm, orientation);
  const gapMm = 10;
  const marginMm = 8;
  const isSideBySide = viewMode === "side-by-side";
  const totalW = isSideBySide ? w * 2 + gapMm : w;
  const totalH = isSideBySide ? h : h * 2 + gapMm;

  const reqW = totalW + marginMm * 2;
  const reqH = totalH + marginMm * 2;
  const artboard = findArtboardSize(reqW, reqH);

  const frontSvg = generateSvgLabel(
    widthMm,
    heightMm,
    orientation,
    foldOrientation,
    foldDistanceMm,
    padding,
    paddingRegion2,
    showPadding,
    showFold,
    true,
    foldMidForm,
    false,
    { isFront: true }
  );

  const backSvg = generateSvgLabel(
    widthMm,
    heightMm,
    orientation,
    foldOrientation,
    foldDistanceMm,
    padding,
    paddingRegion2,
    showPadding,
    showFold,
    true,
    foldMidForm,
    isBackFlipped,
    { isFront: false }
  );

  const combinedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${artboard.w}mm" height="${artboard.h}mm" viewBox="0 0 ${artboard.w} ${artboard.h}">
  <rect x="0" y="0" width="${artboard.w}" height="${artboard.h}" fill="white"/>
  <g transform="translate(${marginMm}, ${marginMm})">
    ${frontSvg.replace(/<[?]xml[^?]*[?]>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}
  </g>
  <g transform="translate(${isSideBySide ? marginMm + w + gapMm : marginMm}, ${isSideBySide ? marginMm : marginMm + h + gapMm})">
    ${backSvg.replace(/<[?]xml[^?]*[?]>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}
  </g>
</svg>`;

  const doc = new jsPDF({
    orientation: artboard.orientation,
    unit: "mm",
    format: [artboard.w, artboard.h],
  });

  const svgBlob = new Blob([combinedSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

    const pngDataUrl = svgToPngDataUrl(img, artboard.w, artboard.h);
    doc.addImage(pngDataUrl, "PNG", 0, 0, artboard.w, artboard.h);
    return doc.output("arraybuffer") as ArrayBuffer;
  } finally {
    URL.revokeObjectURL(url);
  }
}
