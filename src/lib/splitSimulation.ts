import type { SplitConfiguration, SplitRegion, SplitContentSource } from "./types";

export type SimulatedLabel = {
  labelIndex: number;
  front: SimulatedRegion[];
  back: SimulatedRegion[];
};

export type SimulatedRegion = {
  regionId: string;
  side: "front" | "back";
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  type: "overflow" | "fixed";
  text: string;
  overflowed: boolean;
};

export type SimulationResult = {
  labels: SimulatedLabel[];
  unplacedText: string;
};

// Measure the REAL rendered width of text in the actual font, using canvas.
// Cached per (font) so repeated measurements stay fast.
let _measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidthMm(text: string, fontSizePt: number, fontFamily: string): number {
  if (typeof document === "undefined") {
    // SSR fallback: rough estimate (won't run in browser).
    return text.length * ((fontSizePt * 25.4) / 72) * 0.5;
  }
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  const ctx = _measureCanvas.getContext("2d");
  if (!ctx) return text.length * ((fontSizePt * 25.4) / 72) * 0.5;
  ctx.font = `${fontSizePt}pt "${fontFamily}"`;
  const widthPx = ctx.measureText(text).width;
  // Canvas measures in CSS px at 96 DPI; convert to mm.
  return (widthPx * 25.4) / 96;
}

function wrapText(
  text: string,
  maxWidthMm: number,
  maxHeightMm: number,
  fontSizePt: number,
  fontFamily: string,
  lineHeightMm: number,
  allowSplit: boolean,
  connectionText: string
): { keep: string; remainder: string; splitAtWord: boolean } {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  const maxLines = Math.max(1, Math.floor(maxHeightMm / lineHeightMm));

  const keepLines: string[] = [];
  let currentLine = "";
  let remainder = "";
  let splitAtWord = false;

  const pushCurrentLine = () => {
    if (!currentLine) return true;
    if (keepLines.length < maxLines) {
      keepLines.push(currentLine.trim());
      currentLine = "";
      return true;
    }
    return false;
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? currentLine + " " + word : word;

    // Measure the ACTUAL rendered width — does it cross the region edge?
    if (measureTextWidthMm(testLine, fontSizePt, fontFamily) <= maxWidthMm) {
      currentLine = testLine;
      continue;
    }

    // The word does not fit on the current line as-is.
    // Is the word itself wider than a whole line?
    if (measureTextWidthMm(word, fontSizePt, fontFamily) > maxWidthMm) {
      if (!allowSplit) {
        // No splitting: whole word moves to the next region/label.
        if (currentLine) {
          if (!pushCurrentLine()) {
            remainder = words.slice(i).join(" ");
            break;
          }
        }
        remainder = words.slice(i).join(" ");
        break;
      }
      // Splitting allowed: push what we have, then break the word by measuring.
      if (currentLine && !pushCurrentLine()) {
        remainder = words.slice(i).join(" ");
        break;
      }
      let w = word;
      while (measureTextWidthMm(w + connectionText, fontSizePt, fontFamily) > maxWidthMm) {
        if (keepLines.length >= maxLines) {
          remainder = w + (i + 1 < words.length ? " " + words.slice(i + 1).join(" ") : "");
          break;
        }
        // Find the largest prefix that fits together with the connection text.
        let cut = 1;
        while (
          cut < w.length &&
          measureTextWidthMm(w.slice(0, cut + 1) + connectionText, fontSizePt, fontFamily) <= maxWidthMm
        ) {
          cut++;
        }
        keepLines.push(w.slice(0, cut) + connectionText);
        w = w.slice(cut);
        splitAtWord = true;
      }
      if (remainder) break;
      currentLine = w;
      continue;
    }

    // Word fits on a line by itself: push current line, start new line with word.
    if (!pushCurrentLine()) {
      remainder = words.slice(i).join(" ");
      break;
    }
    currentLine = word;
  }

  if (!remainder && currentLine) {
    if (!pushCurrentLine()) {
      remainder = currentLine;
    }
  }

  return { keep: keepLines.join("\n"), remainder: remainder.trim(), splitAtWord };
}

function getRegionText(region: SplitRegion, sources: SplitContentSource[]): string {
  if (!region.contentSourceId) return "";
  const source = sources.find((s) => s.id === region.contentSourceId);
  if (!source) return "";
  if (source.type === "manual") return source.manualText ?? "";
  return `[${source.label}]`;
}

export function simulateOverflow(
  config: SplitConfiguration,
  layoutWidthMm: number,
  layoutHeightMm: number,
  padding: { top: number; right: number; bottom: number; left: number },
  fontFamily = "sans-serif"
): SimulationResult {
  const fontSizePt = config.fontSizePt || 8;
  const renderedFontSizeMm = (fontSizePt * 25.4) / 72;
  const lineHeight = renderedFontSizeMm * 1.25 * 1.02;

  const labels: SimulatedLabel[] = [];

  // Build initial remaining text map
  const remainingByRegion: Record<string, string> = {};
  for (const region of config.regions) {
    remainingByRegion[region.regionId] = getRegionText(region, config.contentSources);
  }

  const regionById = new Map(config.regions.map((r) => [r.regionId, r]));

  const spatialSort = (a: SplitRegion, b: SplitRegion) => {
    if (a.side !== b.side) return a.side === "front" ? -1 : 1;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  };

  // Topological sort: a region is processed before its overflow target so text
  // can flow through the chain within a single label.
  const getSortedRegions = () => {
    const inDegree: Record<string, number> = {};
    config.regions.forEach((r) => {
      inDegree[r.regionId] = 0;
    });
    config.regions.forEach((r) => {
      if (r.overflowTargetId && regionById.has(r.overflowTargetId)) {
        inDegree[r.overflowTargetId]++;
      }
    });

    const sorted: SplitRegion[] = [];
    const processed = new Set<string>();
    while (sorted.length < config.regions.length) {
      const available = config.regions
        .filter((r) => !processed.has(r.regionId) && inDegree[r.regionId] === 0)
        .sort(spatialSort);
      if (available.length === 0) break;
      const next = available[0];
      sorted.push(next);
      processed.add(next.regionId);
      if (next.overflowTargetId && regionById.has(next.overflowTargetId)) {
        inDegree[next.overflowTargetId]--;
      }
    }
    config.regions.forEach((r) => {
      if (!processed.has(r.regionId)) sorted.push(r);
    });
    return sorted;
  };

  // For each overflow chain, find its start (no incoming) and end (no outgoing).
  const getChainStartsAndEnds = () => {
    const hasIncoming = new Set(
      config.regions.filter((r) => r.overflowTargetId).map((r) => r.overflowTargetId)
    );
    const starts = config.regions.filter((r) => !hasIncoming.has(r.regionId)).sort(spatialSort);
    const ends: SplitRegion[] = [];
    const visited = new Set<string>();
    const follow = (r: SplitRegion) => {
      if (visited.has(r.regionId)) return;
      visited.add(r.regionId);
      if (!r.overflowTargetId || !regionById.has(r.overflowTargetId)) {
        ends.push(r);
        return;
      }
      follow(regionById.get(r.overflowTargetId)!);
    };
    starts.forEach(follow);
    return { starts, ends };
  };

  const sortedRegions = getSortedRegions();

  let safetyCounter = 0;
  const maxLabels = 100;

  while (safetyCounter < maxLabels) {
    safetyCounter++;
    const labelIndex = labels.length;
    const currentLabel: SimulatedLabel = {
      labelIndex,
      front: [],
      back: [],
    };

    let hasOverflow = false;
    let anyContentPlaced = false;

    for (const region of sortedRegions) {
      const text = remainingByRegion[region.regionId] || "";
      const availableWidth = region.widthMm - padding.left - padding.right;
      const availableHeight = region.heightMm - padding.top - padding.bottom;

      const simulatedRegion: SimulatedRegion = {
        regionId: region.regionId,
        side: region.side,
        x: region.x,
        y: region.y,
        widthMm: region.widthMm,
        heightMm: region.heightMm,
        type: region.type,
        text: "",
        overflowed: false,
      };

      if (region.type === "fixed") {
        simulatedRegion.text = text;
        remainingByRegion[region.regionId] = "";
      } else if (text && availableWidth > 0 && availableHeight > 0) {
        const { keep, remainder, splitAtWord } = wrapText(
          text,
          availableWidth,
          availableHeight,
          fontSizePt,
          fontFamily,
          lineHeight,
          config.allowSplitText,
          config.connectionText ?? ""
        );

        // When a word is split and flows to another region, append the
        // connection text to the last line of this region.
        let finalKeep = keep;
        if (splitAtWord && region.overflowTargetId && config.connectionText) {
          const lines = keep.split("\n");
          if (lines.length > 0) {
            lines[lines.length - 1] += config.connectionText;
            finalKeep = lines.join("\n");
          }
        }

        simulatedRegion.text = finalKeep;
        simulatedRegion.overflowed = remainder.length > 0;
        remainingByRegion[region.regionId] = "";

        if (remainder.length > 0) {
          hasOverflow = true;
          if (region.overflowTargetId && regionById.has(region.overflowTargetId)) {
            const targetText = remainingByRegion[region.overflowTargetId] || "";
            remainingByRegion[region.overflowTargetId] = targetText
              ? targetText + " " + remainder
              : remainder;
          } else {
            // No downstream target: remainder stays with this region so it can
            // be moved back to the chain start for the next physical label.
            remainingByRegion[region.regionId] = remainder;
          }
        }
      }

      if (simulatedRegion.text || text) {
        anyContentPlaced = true;
      }

      if (region.side === "front") {
        currentLabel.front.push(simulatedRegion);
      } else {
        currentLabel.back.push(simulatedRegion);
      }
    }

    labels.push(currentLabel);

    const hasRemaining = Object.values(remainingByRegion).some((t) => t.trim().length > 0);
    if (!hasRemaining) break;
    if (!hasOverflow && !anyContentPlaced) break;

    // Move remainder from each chain's end back to its start for the next label.
    const { starts, ends } = getChainStartsAndEnds();
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      const end = ends[i];
      if (end && start && end.regionId !== start.regionId) {
        const endRemainder = remainingByRegion[end.regionId] || "";
        if (endRemainder.trim().length > 0) {
          remainingByRegion[start.regionId] = endRemainder;
          remainingByRegion[end.regionId] = "";
        }
      }
    }
  }

  const unplacedText = Object.values(remainingByRegion)
    .filter((t) => t.trim().length > 0)
    .join("\n");

  return { labels, unplacedText };
}

export function applyFixedContentOption(
  result: SimulationResult,
  fixedRegions: SplitRegion[],
  sources: SplitContentSource[],
  option: "tail" | "new-label"
): SimulationResult {
  if (fixedRegions.length === 0) return result;

  const fixedText = fixedRegions
    .map((r) => {
      if (!r.contentSourceId) return "";
      const source = sources.find((s) => s.id === r.contentSourceId);
      if (!source) return "";
      return source.type === "manual" ? source.manualText ?? "" : `[${source.label}]`;
    })
    .filter(Boolean)
    .join(" ");

  if (!fixedText) return result;

  const fixedRegionIds = new Set(fixedRegions.map((r) => r.regionId));

  const labels = result.labels.map((label) => ({
    ...label,
    front: label.front.map((r) => ({ ...r, text: fixedRegionIds.has(r.regionId) ? "" : r.text })),
    back: label.back.map((r) => ({ ...r, text: fixedRegionIds.has(r.regionId) ? "" : r.text })),
  }));

  if (option === "tail") {
    const lastLabel = labels[labels.length - 1];
    const backRegions = lastLabel.back.filter((r) => r.type === "overflow");
    if (backRegions.length > 0) {
      const target = backRegions[backRegions.length - 1];
      target.text = target.text ? target.text + "\n" + fixedText : fixedText;
    }
    return { ...result, labels };
  }

  // new-label: append a label with only fixed content
  const newLabel: SimulatedLabel = {
    labelIndex: labels.length,
    front: fixedRegions
      .filter((r) => r.side === "front")
      .map((r) => ({
        regionId: r.regionId,
        side: r.side,
        x: r.x,
        y: r.y,
        widthMm: r.widthMm,
        heightMm: r.heightMm,
        type: "fixed",
        text: getRegionText(r, sources),
        overflowed: false,
      })),
    back: fixedRegions
      .filter((r) => r.side === "back")
      .map((r) => ({
        regionId: r.regionId,
        side: r.side,
        x: r.x,
        y: r.y,
        widthMm: r.widthMm,
        heightMm: r.heightMm,
        type: "fixed",
        text: getRegionText(r, sources),
        overflowed: false,
      })),
  };

  return { ...result, labels: [...labels, newLabel] };
}
