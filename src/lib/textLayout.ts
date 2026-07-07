const TEXT_LINE_HEIGHT_MULTIPLIER = 1.25 * 1.02;

type TextUnit = "mm" | "pt" | "px";

type BuildRemainderOptions = {
  currentWordOverride?: string;
  leadingLine?: string;
};

export type FitTextToBoxOptions = {
  text: string;
  width: number;
  height: number;
  unit: TextUnit;
  fontSizeUnit?: TextUnit;
  fontFamily: string;
  fontSize: number;
  allowSplit: boolean;
  connectionText?: string;
  safeWidthMargin?: number;
};

export type FitTextToBoxResult = {
  lines: string[];
  text: string;
  remainder: string;
  overflow: boolean;
  lineHeight: number;
};

function buildTextRemainder(
  paragraphs: string[],
  paragraphIndex: number,
  words: string[],
  wordIndex: number,
  options: BuildRemainderOptions = {}
) {
  const remainingParagraphs: string[] = [];
  const currentParts = words.slice(wordIndex);

  if (options.currentWordOverride !== undefined) {
    if (currentParts.length > 0) {
      currentParts[0] = options.currentWordOverride;
    } else {
      currentParts.push(options.currentWordOverride);
    }
  }

  const currentParagraphParts =
    options.leadingLine && options.leadingLine.trim().length > 0
      ? [options.leadingLine.trim(), ...currentParts]
      : currentParts;

  if (currentParagraphParts.length > 0) {
    remainingParagraphs.push(currentParagraphParts.join(" "));
  }

  for (let i = paragraphIndex + 1; i < paragraphs.length; i++) {
    remainingParagraphs.push(paragraphs[i].trim());
  }

  return remainingParagraphs.join("\n").trim();
}

function createProbe({
  width,
  height,
  unit,
  fontSizeUnit,
  fontFamily,
  fontSize,
  allowSplit,
}: {
  width: number;
  height?: number;
  unit: TextUnit;
  fontSizeUnit: TextUnit;
  fontFamily: string;
  fontSize: number;
  allowSplit: boolean;
}) {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-99999px";
  el.style.top = "0";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  el.style.boxSizing = "border-box";
  el.style.margin = "0";
  el.style.padding = "0";
  el.style.border = "0";
  el.style.overflow = "hidden";
  el.style.whiteSpace = "pre-wrap";
  el.style.overflowWrap = allowSplit ? "anywhere" : "normal";
  el.style.wordBreak = allowSplit ? "break-word" : "normal";
  el.style.fontFamily = fontFamily;
  el.style.fontSize = `${fontSize}${fontSizeUnit}`;
  el.style.lineHeight = String(TEXT_LINE_HEIGHT_MULTIPLIER);
  el.style.width = `${width}${unit}`;
  el.style.maxWidth = `${width}${unit}`;
  if (height !== undefined) {
    el.style.height = `${height}${unit}`;
    el.style.maxHeight = `${height}${unit}`;
  }
  document.body.appendChild(el);
  return el;
}

export function getTextLineHeight(fontSize: number) {
  return fontSize * TEXT_LINE_HEIGHT_MULTIPLIER;
}

export function getTextLines(text: string) {
  return text ? text.split("\n") : [];
}

export function fitTextToBox({
  text,
  width,
  height,
  unit,
  fontSizeUnit = unit,
  fontFamily,
  fontSize,
  allowSplit,
  connectionText = "",
  safeWidthMargin = 0,
}: FitTextToBoxOptions): FitTextToBoxResult {
  const normalizedText = text.replace(/\r\n/g, "\n").trim();
  const lineHeight = getTextLineHeight(fontSize);
  const safeWidth = Math.max(0, width - safeWidthMargin);

  if (!normalizedText || safeWidth <= 0 || height <= 0) {
    return {
      lines: [],
      text: "",
      remainder: normalizedText,
      overflow: normalizedText.length > 0,
      lineHeight,
    };
  }

  if (typeof document === "undefined") {
    return {
      lines: [normalizedText],
      text: normalizedText,
      remainder: "",
      overflow: false,
      lineHeight,
    };
  }

  const lineProbe = createProbe({
    width: safeWidth,
    unit,
    fontSizeUnit,
    fontFamily,
    fontSize,
    allowSplit,
  });
  const blockProbe = createProbe({
    width: safeWidth,
    height,
    unit,
    fontSizeUnit,
    fontFamily,
    fontSize,
    allowSplit,
  });

  try {
    lineProbe.textContent = "M";
    const singleLineHeight = lineProbe.scrollHeight;

    const lineFits = (candidate: string) => {
      lineProbe.textContent = candidate;
      return lineProbe.scrollHeight <= singleLineHeight + 1;
    };

    const blockFits = (candidateLines: string[]) => {
      blockProbe.textContent = candidateLines.join("\n");
      const range = document.createRange();
      range.selectNodeContents(blockProbe);
      const rects = Array.from(range.getClientRects());
      range.detach();

      if (rects.length === 0) {
        return blockProbe.scrollHeight <= blockProbe.clientHeight + 1;
      }

      const probeTop = blockProbe.getBoundingClientRect().top;
      const visibleTextBottom = Math.max(...rects.map((rect) => rect.bottom)) - probeTop;
      const visualLineAllowance = 2;
      return visibleTextBottom <= blockProbe.clientHeight + visualLineAllowance;
    };

    const keepLines: string[] = [];
    const pushLine = (line: string) => {
      const trimmedLine = line.trim();
      const nextLines = [...keepLines, trimmedLine];
      if (!blockFits(nextLines)) {
        return false;
      }
      keepLines.push(trimmedLine);
      return true;
    };

    const paragraphs = normalizedText.split("\n");
    let remainder = "";

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

        if (lineFits(testLine)) {
          currentLine = testLine;
          continue;
        }

        if (lineFits(word)) {
          if (currentLine) {
            if (!pushLine(currentLine)) {
              remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex, {
                leadingLine: currentLine,
              });
              break;
            }
            currentLine = word;
            continue;
          }

          currentLine = word;
          continue;
        }

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

        if (currentLine) {
          if (!pushLine(currentLine)) {
            remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex, {
              leadingLine: currentLine,
            });
            break;
          }
          currentLine = "";
        }

        let remainingWord = word;
        while (remainingWord) {
          if (lineFits(remainingWord)) {
            currentLine = remainingWord;
            remainingWord = "";
            continue;
          }

          let low = 1;
          let high = remainingWord.length;
          let bestCut = 0;

          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const suffix = remainingWord.slice(mid);
            const candidate = suffix
              ? `${remainingWord.slice(0, mid)}${connectionText}`
              : remainingWord.slice(0, mid);

            if (lineFits(candidate)) {
              bestCut = mid;
              low = mid + 1;
            } else {
              high = mid - 1;
            }
          }

          if (bestCut === 0) {
            remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex, {
              currentWordOverride: remainingWord,
            });
            break;
          }

          const prefix = remainingWord.slice(0, bestCut);
          const suffix = remainingWord.slice(bestCut);
          const segment = suffix ? `${prefix}${connectionText}` : prefix;

          if (!pushLine(segment)) {
            remainder = buildTextRemainder(paragraphs, paragraphIndex, words, wordIndex, {
              currentWordOverride: remainingWord,
            });
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
        remainder = buildTextRemainder(paragraphs, paragraphIndex, [currentLine], 0);
        break;
      }
    }

    return {
      lines: keepLines,
      text: keepLines.join("\n"),
      remainder: remainder.trim(),
      overflow: remainder.trim().length > 0,
      lineHeight,
    };
  } finally {
    document.body.removeChild(lineProbe);
    document.body.removeChild(blockProbe);
  }
}
