/**
 * [INPUT]: 依赖 Reading View 渲染 DOM、TextAnchor 数据与 fuzzyMatch 的容错定位能力
 * [OUTPUT]: 对外提供 installReadingViewHighlights，在非 CodeMirror 阅读模式中注入视觉高亮
 * [POS]: editor 模块的 Reading View 投影层，与 highlightExtension 分别覆盖 HTML DOM 与 CM6
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { MarkdownPostProcessorContext, MarkdownRenderChild, Platform } from "obsidian";

import { findBestFuzzyMatch } from "../anchor/fuzzyMatch";
import { AnnotationColor, CommentAnnotation, HighlightAnnotation, TextAnchor } from "../storage/types";

export type ReadingMark = Pick<HighlightAnnotation | CommentAnnotation, "id" | "color" | "anchor" | "orphaned">;

interface InstallReadingHighlightsOptions {
  root: HTMLElement;
  context: MarkdownPostProcessorContext;
  marks: ReadingMark[];
}

interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

interface RenderedRange {
  start: number;
  end: number;
}

interface NormalizedIndex {
  text: string;
  map: number[];
}

const MARK_SELECTOR = ".axl-reading-highlight, mark.axl-highlight";
const MOBILE_RENDER_DELAYS = [0, 80, 220, 520, 900];
const DESKTOP_RENDER_DELAYS = [0, 40, 160];

export function installReadingViewHighlights(options: InstallReadingHighlightsOptions): void {
  const component = new MarkdownRenderChild(options.root);
  let frame: number | null = null;
  let disposed = false;

  const render = (): void => {
    if (disposed) {
      return;
    }

    if (frame !== null) {
      cancelAnimationFrame(frame);
    }

    frame = requestAnimationFrame(() => {
      frame = null;
      refreshReadingViewHighlights(options.root, options.marks);
    });
  };

  const delays = Platform.isMobile ? MOBILE_RENDER_DELAYS : DESKTOP_RENDER_DELAYS;
  for (const delay of delays) {
    const timer = window.setTimeout(render, delay);
    component.register(() => window.clearTimeout(timer));
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.every(isOwnHighlightMutation)) {
      return;
    }

    render();
  });
  observer.observe(options.root, { childList: true, subtree: true, characterData: true });

  component.register(() => {
    disposed = true;
    if (frame !== null) {
      cancelAnimationFrame(frame);
    }
    observer.disconnect();
  });
  options.context.addChild(component);
}

export function refreshReadingViewHighlights(root: HTMLElement, marks: ReadingMark[]): void {
  unwrapReadingHighlights(root);
  renderReadingHighlights(root, marks);
  renderCalloutReadingHighlights(root, marks);
}

function renderReadingHighlights(root: HTMLElement, marks: ReadingMark[]): void {
  const liveMarks = marks
    .filter((mark) => !mark.orphaned && mark.anchor.selectedText.trim())
    .sort((left, right) => right.anchor.selectedText.length - left.anchor.selectedText.length);

  for (const mark of liveMarks) {
    if (root.querySelector(highlightSelectorForId(mark.id))) {
      continue;
    }

    wrapRenderedAnchor(root, mark.anchor, mark.color, mark.id);
  }
}

function renderCalloutReadingHighlights(root: HTMLElement, marks: ReadingMark[]): void {
  const callouts = calloutRoots(root);
  if (!callouts.length) {
    return;
  }

  const liveMarks = marks
    .filter((mark) => !mark.orphaned && mark.anchor.selectedText.trim())
    .sort((left, right) => right.anchor.selectedText.length - left.anchor.selectedText.length);

  for (const callout of callouts) {
    for (const mark of liveMarks) {
      if (root.querySelector(highlightSelectorForId(mark.id))) {
        continue;
      }

      wrapRenderedAnchor(callout, mark.anchor, mark.color, mark.id);
    }
  }
}

function calloutRoots(root: HTMLElement): HTMLElement[] {
  const roots = new Set<HTMLElement>();

  if (root.matches(".callout")) {
    roots.add(root);
  }

  const parentCallout = root.closest<HTMLElement>(".callout");
  if (parentCallout) {
    roots.add(parentCallout);
  }

  for (const callout of Array.from(root.querySelectorAll<HTMLElement>(".callout"))) {
    roots.add(callout);
  }

  return Array.from(roots);
}

function unwrapReadingHighlights(root: HTMLElement): void {
  for (const mark of Array.from(root.querySelectorAll<HTMLElement>(MARK_SELECTOR))) {
    const parent = mark.parentNode;
    if (!parent) {
      continue;
    }

    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }
}

function wrapRenderedAnchor(root: HTMLElement, anchor: TextAnchor, color: AnnotationColor, id: string): boolean {
  const snapshot = collectText(root);
  if (!snapshot.text.trim()) {
    return false;
  }

  const range = locateRenderedRange(snapshot.text, anchor);
  if (!range || range.start === range.end) {
    return false;
  }

  return wrapRange(snapshot.segments, range, color, id);
}

function locateRenderedRange(renderedText: string, anchor: TextAnchor): RenderedRange | null {
  const exact = renderedText.indexOf(anchor.selectedText);
  if (exact >= 0) {
    return {
      start: exact,
      end: exact + anchor.selectedText.length,
    };
  }

  const normalized = locateNormalizedRange(renderedText, anchor.selectedText);
  if (normalized) {
    return normalized;
  }

  const fuzzy = findBestFuzzyMatch(
    renderedText,
    anchor.selectedText,
    0,
  );
  if (!fuzzy || fuzzy.confidence < 0.55) {
    return null;
  }

  return {
    start: fuzzy.startOffset,
    end: fuzzy.endOffset,
  };
}

function locateNormalizedRange(renderedText: string, selectedText: string): RenderedRange | null {
  const rendered = normalizeWithMap(renderedText);
  const selected = normalizeWithMap(selectedText);
  if (!rendered.text || !selected.text) {
    return null;
  }

  const normalizedStart = rendered.text.indexOf(selected.text);
  if (normalizedStart < 0) {
    return null;
  }

  const normalizedEnd = normalizedStart + selected.text.length - 1;
  const start = rendered.map[normalizedStart];
  const end = rendered.map[normalizedEnd] + 1;
  if (start === undefined || end === undefined || start >= end) {
    return null;
  }

  return { start, end };
}

function normalizeWithMap(value: string): NormalizedIndex {
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/.test(char)) {
      pendingSpace = text.length > 0;
      continue;
    }

    if (pendingSpace) {
      text += " ";
      map.push(index);
      pendingSpace = false;
    }

    text += char.toLowerCase();
    map.push(index);
  }

  return { text: text.trim(), map };
}

function collectText(root: HTMLElement): { text: string; segments: TextSegment[] } {
  const segments: TextSegment[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }

      const tag = parent.tagName.toLowerCase();
      if (["script", "style"].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest(`${MARK_SELECTOR}, mark.axl-highlight, pre, textarea, input`)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (!node.textContent) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode() as Text | null;
  while (node) {
    const start = text.length;
    text += node.textContent ?? "";
    segments.push({ node, start, end: text.length });
    node = walker.nextNode() as Text | null;
  }

  return { text, segments };
}

function wrapRange(segments: TextSegment[], range: RenderedRange, color: AnnotationColor, id: string): boolean {
  const touched = segments.filter((segment) => segment.end > range.start && segment.start < range.end);
  if (!touched.length) {
    return false;
  }

  for (const segment of touched) {
    const localStart = Math.max(0, range.start - segment.start);
    const localEnd = Math.min(segment.node.length, range.end - segment.start);
    if (localStart >= localEnd || !segment.node.parentNode) {
      continue;
    }

    const selected = splitTextRange(segment.node, localStart, localEnd);
    if (!selected.textContent?.trim()) {
      continue;
    }

    const mark = document.createElement("mark");
    mark.className = `axl-reading-highlight axl-highlight axl-highlight--${color}`;
    mark.dataset.axlColor = color;
    mark.dataset.axlId = id;
    mark.style.setProperty("background-color", highlightBackground(color), "important");
    mark.tabIndex = 0;
    selected.parentNode?.insertBefore(mark, selected);
    mark.appendChild(selected);
  }

  return true;
}

function splitTextRange(node: Text, start: number, end: number): Text {
  let selected = node;
  if (start > 0) {
    selected = selected.splitText(start);
  }

  const selectedLength = end - start;
  if (selectedLength < selected.length) {
    selected.splitText(selectedLength);
  }

  return selected;
}

function highlightBackground(color: string): string {
  const colors: Record<string, string> = {
    yellow: "rgba(245, 197, 24, 0.42)",
    orange: "rgba(255, 140, 0, 0.36)",
    pink: "rgba(255, 105, 180, 0.32)",
    green: "rgba(82, 196, 26, 0.30)",
    blue: "rgba(22, 119, 255, 0.28)",
    purple: "rgba(114, 46, 209, 0.30)",
  };

  return colors[color] ?? colors.yellow;
}

function isOwnHighlightMutation(mutation: MutationRecord): boolean {
  const target = mutation.target;
  if (target instanceof HTMLElement && target.closest(MARK_SELECTOR)) {
    return true;
  }

  return Array.from(mutation.addedNodes).every((node) => {
    return node instanceof HTMLElement && Boolean(node.closest(MARK_SELECTOR));
  });
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

function highlightSelectorForId(id: string): string {
  const escaped = cssEscape(id);
  return `.axl-reading-highlight[data-axl-id="${escaped}"], mark.axl-highlight[data-axl-id="${escaped}"]`;
}
