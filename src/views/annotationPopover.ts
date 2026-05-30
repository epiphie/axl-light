/**
 * [INPUT]: 依赖 Obsidian MarkdownRenderer、注释/高亮数据与目标 DOM 坐标
 * [OUTPUT]: 对外提供 AnnotationPopover，在窄屏或阅读模式点击高亮时显示便签内容
 * [POS]: views 模块的轻量弹层，补足 sticky lane collapse 后的阅读入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { App, Component, MarkdownRenderer, setIcon } from "obsidian";

import { getColorLabel, t } from "../i18n/helpers";
import { AnnotationColor, CommentAnnotation, HighlightAnnotation } from "../storage/types";

interface AnnotationPopoverOptions {
  app: App;
  component: Component;
}

interface AnnotationPopoverItem {
  id: string;
  color: AnnotationColor;
  kind: "highlight" | "comment";
  quote: string;
  content?: string;
  author?: string;
}

interface ShowPopoverOptions {
  rect: DOMRect;
  sourcePath: string;
  items: AnnotationPopoverItem[];
}

type PopoverSource = HighlightAnnotation | CommentAnnotation;

export class AnnotationPopover {
  private readonly element: HTMLElement;

  constructor(private readonly options: AnnotationPopoverOptions) {
    this.element = document.body.createDiv({ cls: "axl-annotation-popover" });
    this.element.addEventListener("click", (event) => event.stopPropagation());
    this.hide();
  }

  destroy(): void {
    this.element.remove();
  }

  show(options: ShowPopoverOptions): void {
    this.element.empty();
    this.element.toggleClass("is-visible", true);

    const header = this.element.createDiv({ cls: "axl-popover-header" });
    header.createSpan({ cls: "axl-popover-title", text: t("popover.title") });
    const close = header.createEl("button", {
      cls: "axl-icon-button",
      attr: { type: "button", title: t("popover.closeTooltip") },
    });
    setIcon(close, "x");
    close.addEventListener("click", () => this.hide());

    const list = this.element.createDiv({ cls: "axl-popover-list" });
    for (const item of options.items) {
      this.renderItem(list, item, options.sourcePath);
    }

    this.place(options.rect);
  }

  hide(): void {
    this.element.toggleClass("is-visible", false);
    this.element.empty();
  }

  static itemFromAnnotation(annotation: PopoverSource): AnnotationPopoverItem {
    const isComment = "content" in annotation;
    return {
      id: annotation.id,
      color: annotation.color,
      kind: isComment ? "comment" : "highlight",
      quote: annotation.anchor.selectedText,
      content: isComment ? annotation.content : undefined,
      author: isComment ? annotation.author : undefined,
    };
  }

  private renderItem(container: HTMLElement, item: AnnotationPopoverItem, sourcePath: string): void {
    const card = container.createDiv({
      cls: "axl-popover-card",
      attr: {
        "data-axl-color": item.color,
        "data-axl-id": item.id,
      },
    });

    const meta = card.createDiv({ cls: "axl-popover-meta" });
    meta.createSpan({ cls: "axl-color-chip", text: getColorLabel(item.color), attr: { "data-axl-color": item.color } });
    meta.createSpan({ text: item.kind === "comment" ? item.author ?? t("popover.fallbackAuthor") : t("popover.highlightOnly") });

    card.createDiv({ cls: "axl-popover-quote", text: item.quote });
    if (!item.content) {
      card.createDiv({ cls: "axl-popover-empty", text: t("popover.emptyNote") });
      return;
    }

    const body = card.createDiv({ cls: "axl-popover-body" });
    MarkdownRenderer.render(this.options.app, item.content, body, sourcePath, this.options.component);
  }

  private place(rect: DOMRect): void {
    const width = Math.min(320, window.innerWidth - 24);
    const left = clamp(rect.left + rect.width / 2 - width / 2, 12, window.innerWidth - width - 12);
    const below = rect.bottom + 10;
    const top = below + 220 > window.innerHeight ? Math.max(12, rect.top - 230) : below;

    this.element.style.width = `${width}px`;
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
