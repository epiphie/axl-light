/**
 * [INPUT]: 依赖 DOM selection 与 Obsidian 命令回调，接收高亮颜色与便签动作
 * [OUTPUT]: 对外提供 SelectionToolbar，在选中文本附近显示非侵入式阅读工具条
 * [POS]: editor 模块的交互入口，被 main.ts 装配并调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ANNOTATION_COLORS, AnnotationColor } from "../storage/types";
import { getColorLabel, t } from "../i18n/helpers";

interface SelectionToolbarOptions {
  onHighlight: (color: AnnotationColor) => void;
  onComment: () => void;
  onCopy: () => void;
  onOpenSidebar: () => void;
}

export class SelectionToolbar {
  private readonly element: HTMLElement;
  private visible = false;
  private readonly handleMouseUp = (): void => {
    window.setTimeout(() => this.showForSelection(), 0);
  };

  constructor(private readonly options: SelectionToolbarOptions) {
    this.element = document.body.createDiv({ cls: "axl-toolbar axl-selection-toolbar" });
    this.render();
    this.hide();
    document.addEventListener("mouseup", this.handleMouseUp);
  }

  destroy(): void {
    document.removeEventListener("mouseup", this.handleMouseUp);
    this.element.remove();
  }

  showForSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      this.hide();
      return;
    }

    const text = selection.toString().trim();
    const range = selection.getRangeAt(0);
    if (!text || !isSelectionInsideWorkspace(range)) {
      this.hide();
      return;
    }

    const rect = range.getBoundingClientRect();
    this.element.style.left = `${Math.max(8, rect.left + rect.width / 2)}px`;
    this.element.style.top = `${Math.max(8, rect.top - 46)}px`;
    this.element.toggleClass("is-visible", true);
    this.visible = true;
  }

  hide(): void {
    this.element.toggleClass("is-visible", false);
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  private render(): void {
    for (const color of ANNOTATION_COLORS) {
      const button = this.element.createEl("button", {
        cls: `axl-toolbar-color axl-toolbar-color--${color}`,
        attr: {
          type: "button",
          "aria-label": t("toolbar.highlightAriaLabel", { color: getColorLabel(color) }),
          "data-axl-color": color,
        },
      });
      button.addEventListener("click", () => this.options.onHighlight(color));
    }

    this.element.createDiv({ cls: "axl-toolbar-sep" });

    const commentButton = this.iconButton(t("toolbar.addStickyNote"), NOTE_ICON);
    commentButton.addEventListener("click", () => this.options.onComment());

    const copyButton = this.iconButton(t("toolbar.copy"), COPY_ICON);
    copyButton.addEventListener("click", () => this.options.onCopy());

    const sidebarButton = this.iconButton(t("toolbar.openOverview"), OVERVIEW_ICON);
    sidebarButton.addEventListener("click", () => this.options.onOpenSidebar());
  }

  private iconButton(label: string, svg: string): HTMLButtonElement {
    const button = this.element.createEl("button", {
      cls: "axl-toolbar-action",
      attr: {
        type: "button",
        "aria-label": label,
        title: label,
      },
    });
    button.innerHTML = svg;
    return button;
  }
}

function isSelectionInsideWorkspace(range: Range): boolean {
  const container =
    range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  if (!container) {
    return false;
  }

  return Boolean(
    container.closest(".workspace") ||
      container.closest(".callout-content") ||
      container.closest(".markdown-preview-view"),
  );
}

const NOTE_ICON = `
  <svg width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5
      a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
`;

const COPY_ICON = `
  <svg width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13"
      rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4
      a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
`;

const OVERVIEW_ICON = `
  <svg width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/>
    <line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/>
    <line x1="3" y1="12" x2="3.01" y2="12"/>
    <line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
`;
