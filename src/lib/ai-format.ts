/**
 * Turns an LLM's plain-text answer into renderable blocks.
 *
 * The prompts ask for plain text (no markdown), so this parses the light shape
 * they actually produce: "- " bullets, an optional short "Saran:"/"Suggestions:"
 * heading, and prose. Heading detection is locale-agnostic — any short line
 * ending in a colon — so it works whichever language the model replied in.
 *
 * Anything it cannot classify becomes a paragraph, so a model that ignores the
 * requested shape still renders as readable text rather than breaking the UI.
 */

export type AiBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'para'; text: string };

/** Bullet ("- ", "• ", "* ") or numbered ("1. ", "2) ") list markers. */
const LIST_MARKER = /^\s*(?:[-•*]|\d+[.)])\s+/;

/**
 * A heading ends in a colon AND introduces a list. Requiring the list is what
 * separates "Saran:" from a sentence that merely ends in a colon, and it holds
 * across languages — an earlier length-only rule dropped Indonesian headings,
 * which run longer than their English equivalents.
 *
 * The cap only stops a whole paragraph from becoming a heading.
 */
const MAX_HEADING_LENGTH = 80;

export function parseAiText(raw: string): AiBlock[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const blocks: AiBlock[] = [];
  let list: string[] = [];
  let para: string[] = [];

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
  };
  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ kind: 'para', text: para.join(' ') });
      para = [];
    }
  };
  const flush = () => {
    flushList();
    flushPara();
  };

  /** True when the next non-empty line starts a list. */
  const introducesList = (from: number): boolean => {
    for (let j = from + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (!next.trim()) continue;
      return LIST_MARKER.test(next);
    }
    return false;
  };

  for (const [index, line] of lines.entries()) {
    const text = line.trim();
    if (!text) {
      flush();
      continue;
    }
    if (LIST_MARKER.test(line)) {
      flushPara();
      list.push(text.replace(LIST_MARKER, ''));
      continue;
    }
    if (text.endsWith(':') && text.length <= MAX_HEADING_LENGTH && introducesList(index)) {
      flush();
      blocks.push({ kind: 'heading', text: text.slice(0, -1).trim() });
      continue;
    }
    flushList();
    para.push(text);
  }
  flush();
  return blocks;
}

export interface TextRun {
  text: string;
  /** True for figures worth setting in a heavier, tabular face. */
  emphasis: boolean;
}

/**
 * Rupiah amounts and percentages — the numbers an owner scans for. Accepts
 * "IDR" as well as "Rp": models replying in English tend to write IDR even
 * when the prompt asks for Rp.
 */
const FIGURE = /((?:Rp|IDR)\s?[\d.,]*\d|\d[\d.,]*%)/g;

/** Splits a line into plain and emphasized runs so the UI can weight figures. */
export function highlightNumbers(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;
  for (const m of text.matchAll(FIGURE)) {
    const start = m.index;
    if (start > last) runs.push({ text: text.slice(last, start), emphasis: false });
    runs.push({ text: m[0], emphasis: true });
    last = start + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), emphasis: false });
  return runs.length > 0 ? runs : [{ text, emphasis: false }];
}
