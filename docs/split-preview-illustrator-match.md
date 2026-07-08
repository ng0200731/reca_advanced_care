# Split Preview And Illustrator Match Implementation Notes

This document records the code-level rules that made the Split Workspace web preview and Illustrator export match. Use this as the handover document before changing text wrapping, overflow, SVG export, or `.ai` export.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
// Web preview, SVG-for-Illustrator, and .ai export should all consume
// the same simulation result object.
const [simulation, setSimulation] = useState<ReturnType<typeof simulateOverflow> | null>(null);
```

## Success Rule

The expected result is that text fills the green region, wraps before crossing the right green edge, and overflows only when the next full line would cross the bottom green edge. Illustrator must show the same text rows as the web preview.

Code detail:

```ts
// src/lib/splitSimulation.ts
const fitted = fitTextToBox({
  text,
  width: availableWidth * renderUnitsPerMm,
  height: availableHeight * renderUnitsPerMm,
  unit: "px",
  fontSizeUnit: "pt",
  fontFamily,
  fontSize: fontSizePt,
  allowSplit: config.allowSplitText,
  connectionText: config.connectionText ?? "",
  safeWidthMargin: TEXT_SAFE_MARGIN_MM * renderUnitsPerMm,
});

simulatedRegion.text = fitted.text;
simulatedRegion.overflowed = fitted.overflow;
```

## Root Cause Of The Illustrator Mismatch

The web preview renders text as browser HTML inside an SVG `foreignObject`, while Illustrator `.ai` export renders editable PDF text objects. The actual bug came from scaling the region box with the workspace zoom while leaving the preview font at the raw configured CSS `pt` size. That made preview wrapping change with zoom, and the export later tried to compensate by rewriting the point size instead of keeping the real configured size.

Code detail:

```tsx
// src/components/modules/SplitWorkspace.tsx
// Web preview uses HTML layout inside SVG.
<foreignObject
  x={layout.clipX}
  y={layout.clipY}
  width={layout.clipWidth}
  height={layout.clipHeight}
>
  <div
    style={{
      width: `${layout.clipWidth}px`,
      height: `${layout.clipHeight}px`,
      overflow: "hidden",
      whiteSpace: "pre-wrap",
      fontFamily,
      fontSize: `${fontSizePt}pt`,
      lineHeight: String(lineHeight),
    }}
  >
    {r.text}
  </div>
</foreignObject>
```

## Source Of Truth

`region.text` from `simulateOverflow(...)` is the source of truth. The export code must not re-wrap text, because re-wrapping in Illustrator would create different line breaks from the browser preview.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
const wrapTextForIllustrator = (text: string, fontSizePt: number) => {
  return {
    lines: getTextLines(text),
    lineHeightPt: getTextLineHeight(fontSizePt),
    overflow: false,
  };
};
```

## Browser Measurement Probe

The fitting algorithm uses a hidden DOM probe so the browser decides wrapping and vertical fit. The probe must use the same font family, font size, line height, `white-space`, `overflow-wrap`, and `word-break` behavior as the preview.

Code detail:

```ts
// src/lib/textLayout.ts
el.style.whiteSpace = "pre-wrap";
el.style.overflowWrap = allowSplit ? "anywhere" : "normal";
el.style.wordBreak = allowSplit ? "break-word" : "normal";
el.style.fontFamily = fontFamily;
el.style.fontSize = `${fontSize}${fontSizeUnit}`;
el.style.lineHeight = String(TEXT_LINE_HEIGHT_MULTIPLIER);
el.style.width = `${width}${unit}`;
el.style.maxWidth = `${width}${unit}`;
```

## Bottom Edge Measurement

The block-height probe must use visible overflow while measuring. If it uses `overflow: hidden`, a line can look like it fits only because the browser clipped the part below the box. That creates the exact bug where Illustrator later shows extra lines below the green edge.

Code detail:

```ts
// src/lib/textLayout.ts
const blockProbe = createProbe({
  width: safeWidth,
  height,
  unit,
  fontSizeUnit,
  fontFamily,
  fontSize,
  allowSplit,
  overflow: "visible",
});
```

## Actual Fit Test

The vertical fit check uses the real rendered text rectangles from a browser `Range`. It compares the visible bottom of the text to the measured content box height, allowing only a tiny visual tolerance.

Code detail:

```ts
// src/lib/textLayout.ts
const range = document.createRange();
range.selectNodeContents(blockProbe);
const rects = Array.from(range.getClientRects());
range.detach();

const probeTop = blockProbe.getBoundingClientRect().top;
const visibleTextBottom = Math.max(...rects.map((rect) => rect.bottom)) - probeTop;
const visualLineAllowance = 2;
return visibleTextBottom <= blockProbe.clientHeight + visualLineAllowance;
```

## Right Edge Wrapping

A word stays on the current line only if the hidden single-line probe says the candidate still fits on one rendered line. If adding the word creates another line, that word moves to the next line.

Code detail:

```ts
// src/lib/textLayout.ts
lineProbe.textContent = "M";
const singleLineHeight = lineProbe.scrollHeight;

const lineFits = (candidate: string) => {
  lineProbe.textContent = candidate;
  return lineProbe.scrollHeight <= singleLineHeight + 1;
};

const testLine = currentLine ? `${currentLine} ${word}` : word;

if (lineFits(testLine)) {
  currentLine = testLine;
  continue;
}
```

## Long Word Splitting

When `allowSplitText` is enabled, a single overlong word can split by character and add `connectionText` to the split segment. When `allowSplitText` is disabled, the fitter does not force character splitting.

Code detail:

```ts
// src/lib/textLayout.ts
if (!allowSplit) {
  if (currentLine) {
    if (!pushLine(currentLine)) {
      remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex, {
        leadingLine: currentLine,
      });
      break;
    }
  }

  remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex);
  break;
}

const candidate = suffix
  ? `${remainingWord.slice(0, mid)}${connectionText}`
  : remainingWord.slice(0, mid);
```

## Overflow Chain

After fitting, `fitted.text` remains in the current region and `fitted.remainder` moves to the configured overflow target. If there is no target, the remainder stays on the same region for the next label.

Code detail:

```ts
// src/lib/splitSimulation.ts
if (fitted.remainder.length > 0) {
  hasOverflow = true;
  if (region.overflowTargetId && regionById.has(region.overflowTargetId)) {
    const targetText = remainingByRegion[region.overflowTargetId] || "";
    remainingByRegion[region.overflowTargetId] = targetText
      ? `${targetText} ${fitted.remainder}`
      : fitted.remainder;
  } else {
    remainingByRegion[region.regionId] = fitted.remainder;
  }
}
```

## Preview Layout

The web preview does not calculate `maxLines = floor(height / lineHeight)`. It reads the already-fitted `region.text`, splits it into lines, and displays it inside the same clipped content box.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
const getRegionTextLayout = (
  region: SimulatedRegion,
  sidePadding: { top: number; right: number; bottom: number; left: number },
  unitsPerMm: number,
  fontSizeUnits: number
) => {
  const contentBox = getRegionContentBox(region, sidePadding, unitsPerMm);
  const lineHeight = getTextLineHeight(fontSizeUnits);
  const lines = getTextLines(region.text);

  return {
    lineHeight,
    clipX: contentBox.x,
    clipY: contentBox.y,
    clipWidth: contentBox.width,
    clipHeight: contentBox.height,
    visibleLines: lines,
    showOverflow: contentBox.width <= 0 || contentBox.height <= 0
      ? lines.length > 0
      : region.overflowed,
  };
};
```

## Shared Content Box

Preview and export both use `getRegionContentBox(...)` so the text area is synchronized with the same green padding/border geometry.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
const contentXmm = Math.max(region.x, sidePadding.left);
const contentYmm = Math.max(region.y, sidePadding.top);
const contentRightMm = Math.min(region.x + region.widthMm, widthMm - sidePadding.right);
const contentBottomMm = Math.min(region.y + region.heightMm, heightMm - sidePadding.bottom);

return {
  x: contentXmm * unitsPerMm,
  y: contentYmm * unitsPerMm,
  width: Math.max(0, (contentRightMm - contentXmm) * unitsPerMm),
  height: Math.max(0, (contentBottomMm - contentYmm) * unitsPerMm),
};
```

## Scaled Preview Font Size

The browser preview and the overflow simulation must scale the configured point size into the current canvas units before measuring or drawing text. Illustrator export should then keep the original configured point size. This keeps the preview visually correct at any zoom level while preserving the real exported point size.

Code detail:

```ts
// src/lib/splitTextSizing.ts
export const CSS_PX_PER_MM = 96 / 25.4;

export function getPreviewCanvasFontPt(fontSizePt: number, renderUnitsPerMm: number) {
  return fontSizePt * (renderUnitsPerMm / CSS_PX_PER_MM);
}
```

```ts
// src/components/modules/SplitWorkspace.tsx
const previewFontSizePt = getPreviewCanvasFontPt(
  Math.max(4, config.fontSizePt),
  scale
);

<div style={{ fontSize: `${previewFontSizePt}pt` }}>{r.text}</div>
```

```ts
// src/lib/splitSimulation.ts
const previewFontSizePt = getPreviewCanvasFontPt(fontSizePt, renderUnitsPerMm);

const fitted = fitTextToBox({
  width: availableWidth * renderUnitsPerMm,
  height: availableHeight * renderUnitsPerMm,
  fontSize: previewFontSizePt,
});
```

## Illustrator SVG Export

The editable SVG-for-Illustrator export must use the real configured point size and reuse `wrapTextForIllustrator(...)`. This keeps the SVG export aligned with the `.ai` export while preserving the selected point size in Illustrator.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
const bodyFontSizePt = Math.max(4, config.fontSizePt);
const wrapped = wrapTextForIllustrator(r.text, bodyFontSizePt);

wrapped.lines.forEach((line, lineIdx) => {
  const lineY =
    textY + (lineIdx + 1) * wrapped.lineHeightPt - bodyFontSizePt * 0.2;
  svgContent += `  <text x="${textX}" y="${lineY}" font-family="${fontFamilyAttr}" font-size="${bodyFontSizePt}" fill="${fill}">${escapeXml(line)}</text>\n`;
});
```

## Editable `.ai` Export

The `.ai` file is created as a PDF-backed Illustrator file with real text objects. It must not be created by rasterizing the SVG onto a canvas.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
const doc = new jsPDF({
  orientation: pageW > pageH ? "landscape" : "portrait",
  unit: "pt",
  format: [pageW, pageH],
});

doc.text(text, x, y, textOptions);
const pdfBlob = doc.output("blob");
downloadBlob(pdfBlob, `${config.name || "simulation"}.ai`);
```

## Font Embedding

The selected uploaded font is fetched from `/api/fonts/file/:id`, converted to base64, added to jsPDF's virtual file system, and registered with `doc.addFont(...)`. This keeps Illustrator text editable and tied to the selected font instead of a fallback.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
const fontRes = await fetch(`/api/fonts/file/${selectedFont.id}`);
const buf = await fontRes.arrayBuffer();
const bytes = new Uint8Array(buf);

const ext = selectedFont.filename?.split(".").pop()?.toLowerCase() === "otf" ? "otf" : "ttf";
const vfsName = `SplitFont.${ext}`;
const embeddedFontName = selectedFont.font_name || "SplitFont";

doc.addFileToVFS(vfsName, base64);
doc.addFont(vfsName, embeddedFontName, "normal");
bodyFontName = embeddedFontName;
```

## Right Edge Safety In Illustrator

Even with the same font and font size, Illustrator can render a line slightly wider than the browser. The export checks the jsPDF text width and applies `horizontalScale` only when the line would exceed the green content box width.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
const aiTextFitMarginPt = 0.75;

if (maxWidthPt !== undefined && maxWidthPt > 0 && text.length > 0) {
  const safeMaxWidthPt = Math.max(0.1, maxWidthPt - aiTextFitMarginPt);
  const textWidthPt = doc.getTextWidth(text);
  if (textWidthPt > safeMaxWidthPt) {
    textOptions.horizontalScale = Math.max(0.01, safeMaxWidthPt / textWidthPt);
  }
}
```

## Text Drawing Call

Every region line is drawn through `drawText(...)` with `contentBox.width` as the maximum width. Do not call `doc.text(...)` directly for body region lines unless the same width-fit logic is preserved.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
wrapped.lines.forEach((line, lineIdx) => {
  const fill: [number, number, number] =
    getConnectionTextFill(line) === "#059669" ? [5, 150, 98] : [51, 51, 51];
  const lineY =
    textY + (lineIdx + 1) * wrapped.lineHeightPt - bodyFontSizePt * 0.2;
  drawText(line, textX, lineY, bodyFontSizePt, fill, "left", contentBox.width);
});
```

## Overflow Marker

The red `+` marker should be drawn at the bottom-right corner of the full region rectangle, not after the last text line. This prevents the marker from moving when line count changes.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
if (wrapped.overflow || r.overflowed) {
  drawText(
    "+",
    rx + rw - 3,
    ry + rh - 3,
    8,
    [239, 68, 68],
    "right"
  );
}
```

## Raster Export Is Not Allowed For `.ai`

The Illustrator export must not use canvas rasterization. Raster export makes the text non-editable and can trigger browser security errors such as tainted canvas when an image/font source is not canvas-safe.

Code detail:

```ts
// Do not use inside handleExportAIFile(...)
ctx.drawImage(...);
canvas.toDataURL("image/png");
doc.addImage(...);
```

The separate PDF button may still use raster logic, but `handleExportAIFile(...)` must not.

## Test Checklist

Always rerun simulation before exporting. The export uses the current `simulation` state, so stale simulation data means stale Illustrator output.

Code detail:

```ts
// src/components/modules/SplitWorkspace.tsx
const result = simulateOverflow(
  config,
  widthMm,
  heightMm,
  {
    front: getPadding("front"),
    back: getPadding("back"),
  },
  fontName,
  scale
);
setSimulation(result);
```

## Manual Verification Steps

Use the following visual checks after making changes: web preview last line equals Illustrator last line, no text crosses the right green edge, no text crosses the bottom green edge, overflow goes to the configured target, text remains editable in Illustrator, and selected font is used.

Code detail:

```bash
npx tsc --noEmit
rg -n "handleExportAIFile|toDataURL|drawImage|addImage|doc.text|horizontalScale" src/components/modules/SplitWorkspace.tsx
```

Expected result: `doc.text(...)` and `horizontalScale` can appear inside `handleExportAIFile(...)`; `toDataURL`, `drawImage`, and `addImage` must not appear inside `handleExportAIFile(...)`.

## Common Regression Causes

If the preview and Illustrator diverge again, check whether any change reintroduced fixed `maxLines`, re-wrapped text in export, stopped scaling the preview font with `getPreviewCanvasFontPt(...)`, changed the block probe back to hidden overflow, removed `horizontalScale`, or made the preview and export use different fonts.

Code detail:

```ts
// These patterns should stay true.
overflow: "visible";                 // block measurement probe
getTextLines(region.text);           // export source of truth
getPreviewCanvasFontPt(...);         // preview/simulation font scaling
Math.max(4, config.fontSizePt);      // Illustrator body font size
drawText(..., contentBox.width);      // right-edge safety
doc.addFileToVFS(...); doc.addFont(...); // editable selected font
```
