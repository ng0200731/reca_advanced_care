import { fitTextToBox } from "./textLayout";
import { getPreviewCanvasFontPt } from "./splitTextSizing";
import type { SplitConfiguration, SplitRegion, SplitContentSource } from "./types";

type RegionPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type SimulationPadding =
  | RegionPadding
  | {
      front: RegionPadding;
      back: RegionPadding;
    };

const TEXT_SAFE_MARGIN_MM = 0.35;

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

// Measure the real rendered width in the actual font, using canvas metrics.
let measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidthMm(text: string, fontSizePt: number, fontFamily: string): number {
  if (typeof document === "undefined") {
    return text.length * ((fontSizePt * 25.4) / 72) * 0.5;
  }
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) {
    return text.length * ((fontSizePt * 25.4) / 72) * 0.5;
  }
  ctx.font = `${fontSizePt}pt "${fontFamily}"`;
  const widthPx = ctx.measureText(text).width;
  return (widthPx * 25.4) / 96;
}

function buildTextRemainder(
  paragraphs: string[],
  paragraphIndex: number,
  words: string[],
  wordIndex: number,
  currentWordOverride?: string
) {
  const remainingParagraphs: string[] = [];
  const currentParts = words.slice(wordIndex);

  if (currentWordOverride !== undefined) {
    if (currentParts.length > 0) {
      currentParts[0] = currentWordOverride;
    } else {
      currentParts.push(currentWordOverride);
    }
  }

  if (currentParts.length > 0) {
    remainingParagraphs.push(currentParts.join(" "));
  }

  for (let i = paragraphIndex + 1; i < paragraphs.length; i++) {
    remainingParagraphs.push(paragraphs[i].trim());
  }

  return remainingParagraphs.join("\n").trim();
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
): { keep: string; remainder: string } {
  const safeMaxWidthMm = Math.max(0, maxWidthMm - TEXT_SAFE_MARGIN_MM);
  const normalizedText = text.replace(/\r\n/g, "\n").trim();

  if (!normalizedText || safeMaxWidthMm <= 0 || maxHeightMm <= 0) {
    return { keep: "", remainder: normalizedText };
  }

  const paragraphs = normalizedText.split("\n");
  const maxLines = Math.max(1, Math.floor(maxHeightMm / lineHeightMm));
  const keepLines: string[] = [];
  let remainder = "";

  const pushLine = (line: string) => {
    if (keepLines.length < maxLines) {
      keepLines.push(line.trim());
      return true;
    }
    return false;
  };

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const words = paragraphs[paragraphIndex].trim().split(/\s+/).filter((word) => word.length > 0);
    let currentLine = "";

    if (words.length === 0) {
      if (!pushLine("")) {
        remainder = paragraphs.slice(paragraphIndex).join("\n").trim();
        break;
      }
      continue;
    }

    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
      const word = words[wordIndex];
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (measureTextWidthMm(testLine, fontSizePt, fontFamily) <= safeMaxWidthMm) {
        currentLine = testLine;
        continue;
      }

      if (measureTextWidthMm(word, fontSizePt, fontFamily) <= safeMaxWidthMm) {
        if (currentLine) {
          if (!pushLine(currentLine)) {
            remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex);
            break;
          }
          currentLine = word;
          continue;
        }
        currentLine = word;
        continue;
      }

      if (!allowSplit) {
        if (currentLine && !pushLine(currentLine)) {
          remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex);
          break;
        }
        remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex);
        break;
      }

      if (currentLine) {
        if (!pushLine(currentLine)) {
          remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex);
          break;
        }
        currentLine = "";
      }

      let remainingWord = word;
      while (remainingWord) {
        if (measureTextWidthMm(remainingWord, fontSizePt, fontFamily) <= safeMaxWidthMm) {
          currentLine = remainingWord;
          remainingWord = "";
          continue;
        }

        if (keepLines.length >= maxLines) {
          remainder = buildTextRemainder(
            paragraphs,
            paragraphIndex,
            words,
            wordIndex,
            remainingWord
          );
          break;
        }

        let cut = 1;
        while (
          cut < remainingWord.length &&
          measureTextWidthMm(
            `${remainingWord.slice(0, cut + 1)}${connectionText}`,
            fontSizePt,
            fontFamily
          ) <= safeMaxWidthMm
        ) {
          cut++;
        }

        const prefix = remainingWord.slice(0, cut);
        const suffix = remainingWord.slice(cut);
        const segment = suffix ? `${prefix}${connectionText}` : prefix;

        if (!pushLine(segment)) {
          remainder = buildTextRemainder(
            paragraphs,
            paragraphIndex,
            words,
            wordIndex,
            remainingWord
          );
          break;
        }

        remainingWord = suffix;
      }

      if (remainder) {
        break;
      }
    }

    if (remainder) {
      break;
    }

    if (currentLine && !pushLine(currentLine)) {
      remainder = currentLine;
      break;
    }
  }

  return {
    keep: keepLines.join("\n"),
    remainder: remainder.trim(),
  };
}

function getRegionText(region: SplitRegion, sources: SplitContentSource[]): string {
  if (!region.contentSourceId) return "";
  const source = sources.find((s) => s.id === region.contentSourceId);
  if (!source) return "";
  if (source.type === "manual") return source.manualText ?? "";
  return `[${source.label}]`;
}

function getPaddingForRegion(
  padding: SimulationPadding,
  side: "front" | "back"
): RegionPadding {
  if ("front" in padding) {
    return padding[side];
  }
  return padding;
}

function getRegionContentBounds(
  region: SplitRegion,
  layoutWidthMm: number,
  layoutHeightMm: number,
  padding: RegionPadding
) {
  const left = Math.max(region.x, padding.left);
  const top = Math.max(region.y, padding.top);
  const right = Math.min(region.x + region.widthMm, layoutWidthMm - padding.right);
  const bottom = Math.min(region.y + region.heightMm, layoutHeightMm - padding.bottom);

  return {
    x: left,
    y: top,
    widthMm: Math.max(0, right - left),
    heightMm: Math.max(0, bottom - top),
  };
}

export function simulateOverflow(
  config: SplitConfiguration,
  layoutWidthMm: number,
  layoutHeightMm: number,
  padding: SimulationPadding,
  fontFamily = "sans-serif",
  renderUnitsPerMm = 96 / 25.4
): SimulationResult {
  const fontSizePt = config.fontSizePt || 8;
  const previewFontSizePt = getPreviewCanvasFontPt(fontSizePt, renderUnitsPerMm);

  const labels: SimulatedLabel[] = [];
  const remainingByRegion: Record<string, string> = {};

  for (const region of config.regions) {
    remainingByRegion[region.regionId] = getRegionText(region, config.contentSources);
  }

  const regionById = new Map(config.regions.map((region) => [region.regionId, region]));

  const spatialSort = (a: SplitRegion, b: SplitRegion) => {
    if (a.side !== b.side) return a.side === "front" ? -1 : 1;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  };

  const getSortedRegions = () => {
    const inDegree: Record<string, number> = {};
    config.regions.forEach((region) => {
      inDegree[region.regionId] = 0;
    });
    config.regions.forEach((region) => {
      if (region.overflowTargetId && regionById.has(region.overflowTargetId)) {
        inDegree[region.overflowTargetId]++;
      }
    });

    const sorted: SplitRegion[] = [];
    const processed = new Set<string>();

    while (sorted.length < config.regions.length) {
      const available = config.regions
        .filter((region) => !processed.has(region.regionId) && inDegree[region.regionId] === 0)
        .sort(spatialSort);

      if (available.length === 0) break;

      const next = available[0];
      sorted.push(next);
      processed.add(next.regionId);

      if (next.overflowTargetId && regionById.has(next.overflowTargetId)) {
        inDegree[next.overflowTargetId]--;
      }
    }

    config.regions.forEach((region) => {
      if (!processed.has(region.regionId)) {
        sorted.push(region);
      }
    });

    return sorted;
  };

  const getChainStartsAndEnds = () => {
    const hasIncoming = new Set(
      config.regions.filter((region) => region.overflowTargetId).map((region) => region.overflowTargetId)
    );
    const starts = config.regions
      .filter((region) => !hasIncoming.has(region.regionId))
      .sort(spatialSort);
    const ends: SplitRegion[] = [];
    const visited = new Set<string>();

    const follow = (region: SplitRegion) => {
      if (visited.has(region.regionId)) return;
      visited.add(region.regionId);
      if (!region.overflowTargetId || !regionById.has(region.overflowTargetId)) {
        ends.push(region);
        return;
      }
      follow(regionById.get(region.overflowTargetId)!);
    };

    starts.forEach(follow);
    return { starts, ends };
  };

  const sortedRegions = getSortedRegions();
  let safetyCounter = 0;
  const maxLabels = 100;

  while (safetyCounter < maxLabels) {
    safetyCounter++;

    const currentLabel: SimulatedLabel = {
      labelIndex: labels.length,
      front: [],
      back: [],
    };

    let hasOverflow = false;
    let anyContentPlaced = false;

    for (const region of sortedRegions) {
      const text = remainingByRegion[region.regionId] || "";
      const regionPadding = getPaddingForRegion(padding, region.side);
      const contentBounds = getRegionContentBounds(
        region,
        layoutWidthMm,
        layoutHeightMm,
        regionPadding
      );
      const availableWidth = contentBounds.widthMm;
      const availableHeight = contentBounds.heightMm;

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
        const fitted = fitTextToBox({
          text,
          width: availableWidth * renderUnitsPerMm,
          height: availableHeight * renderUnitsPerMm,
          unit: "px",
          fontSizeUnit: "pt",
          fontFamily,
          fontSize: previewFontSizePt,
          allowSplit: config.allowSplitText,
          connectionText: config.connectionText ?? "",
          safeWidthMargin: TEXT_SAFE_MARGIN_MM * renderUnitsPerMm,
        });

        simulatedRegion.text = fitted.text;
        simulatedRegion.overflowed = fitted.overflow;
        remainingByRegion[region.regionId] = "";

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

    const hasRemaining = Object.values(remainingByRegion).some((value) => value.trim().length > 0);
    if (!hasRemaining) break;
    if (!hasOverflow && !anyContentPlaced) break;

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
    .filter((value) => value.trim().length > 0)
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
    .map((region) => {
      if (!region.contentSourceId) return "";
      const source = sources.find((item) => item.id === region.contentSourceId);
      if (!source) return "";
      return source.type === "manual" ? source.manualText ?? "" : `[${source.label}]`;
    })
    .filter(Boolean)
    .join(" ");

  if (!fixedText) return result;

  const fixedRegionIds = new Set(fixedRegions.map((region) => region.regionId));
  const labels = result.labels.map((label) => ({
    ...label,
    front: label.front.map((region) => ({
      ...region,
      text: fixedRegionIds.has(region.regionId) ? "" : region.text,
    })),
    back: label.back.map((region) => ({
      ...region,
      text: fixedRegionIds.has(region.regionId) ? "" : region.text,
    })),
  }));

  if (option === "tail") {
    const lastLabel = labels[labels.length - 1];
    const backRegions = lastLabel.back.filter((region) => region.type === "overflow");
    if (backRegions.length > 0) {
      const target = backRegions[backRegions.length - 1];
      target.text = target.text ? `${target.text}\n${fixedText}` : fixedText;
    }
    return { ...result, labels };
  }

  const newLabel: SimulatedLabel = {
    labelIndex: labels.length,
    front: fixedRegions
      .filter((region) => region.side === "front")
      .map((region) => ({
        regionId: region.regionId,
        side: region.side,
        x: region.x,
        y: region.y,
        widthMm: region.widthMm,
        heightMm: region.heightMm,
        type: "fixed" as const,
        text: getRegionText(region, sources),
        overflowed: false,
      })),
    back: fixedRegions
      .filter((region) => region.side === "back")
      .map((region) => ({
        regionId: region.regionId,
        side: region.side,
        x: region.x,
        y: region.y,
        widthMm: region.widthMm,
        heightMm: region.heightMm,
        type: "fixed" as const,
        text: getRegionText(region, sources),
        overflowed: false,
      })),
  };

  return { ...result, labels: [...labels, newLabel] };
}
