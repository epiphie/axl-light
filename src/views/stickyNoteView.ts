/**
 * [INPUT]: 依赖 Obsidian MarkdownRenderer、CommentAnnotation 数据与便签操作回调
 * [OUTPUT]: 对外提供 renderStickyNoteCard，用于渲染可折叠、可编辑的便签卡片
 * [POS]: views 模块的便签卡片组件，当前保留为 PDF/弹层卡片样式的兼容组件
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { App, Component, MarkdownRenderer, setIcon } from "obsidian";

import { getColorLabel, t } from "../i18n/helpers";
import { CommentAnnotation } from "../storage/types";

interface StickyNoteCardOptions {
  app: App;
  component: Component;
  sourcePath: string;
  comment: CommentAnnotation;
  onToggle: (comment: CommentAnnotation) => void;
  onUpdate: (comment: CommentAnnotation, content: string, title?: string) => void;
  onDelete: (comment: CommentAnnotation) => void;
}

export function renderStickyNoteCard(container: HTMLElement, options: StickyNoteCardOptions): HTMLElement {
  container.empty();
  const card = container.createDiv({
    cls: `axl-card axl-card--${options.comment.color} axl-sticky-card`,
    attr: {
      "data-axl-color": options.comment.color,
      "data-axl-id": options.comment.id,
      "data-axl-card-id": options.comment.id,
    },
  });

  const header = card.createDiv({ cls: "axl-card-head" });
  header.createSpan({
    cls: `axl-card-color-label axl-label--${options.comment.color}`,
    text: getColorLabel(options.comment.color),
  });
  header.createSpan({ cls: "axl-card-page", text: t("stickyNote.modeLabel") });
  header.createSpan({ cls: "axl-card-time", text: formatTime(options.comment.updatedAt) });
  header.createSpan({ cls: "axl-card-author", text: options.comment.author });
  const tools = header.createDiv({ cls: "axl-card-tools" });

  const edit = tools.createEl("button", {
    cls: "axl-icon-btn",
    attr: { type: "button", title: t("stickyNote.editTooltip") },
  });
  setIcon(edit, "pencil");

  const collapse = tools.createEl("button", {
    cls: "axl-icon-btn",
    attr: { type: "button", title: options.comment.collapsed ? t("stickyNote.expand") : t("stickyNote.collapse") },
  });
  setIcon(collapse, options.comment.collapsed ? "chevron-down" : "chevron-up");
  collapse.addEventListener("click", () => options.onToggle(options.comment));

  const remove = tools.createEl("button", {
    cls: "axl-icon-btn",
    attr: { type: "button", title: t("stickyNote.deleteTooltip") },
  });
  setIcon(remove, "trash-2");
  remove.addEventListener("click", () => options.onDelete(options.comment));

  if (options.comment.collapsed) {
    const body = card.createDiv({ cls: "axl-card-body" });
    body.createDiv({ cls: "axl-card-quote", text: options.comment.anchor.selectedText });
    return card;
  }

  const body = card.createDiv({ cls: "axl-card-body" });
  body.createDiv({ cls: "axl-card-quote", text: options.comment.anchor.selectedText });
  const content = body.createDiv({ cls: "axl-card-content" });
  renderDisplayMode(content, options);
  edit.addEventListener("click", () => renderEditMode(content, options));
  const foot = card.createDiv({ cls: "axl-card-foot" });
  foot.createEl("button", { cls: "axl-card-more", text: "···", attr: { type: "button", title: t("stickyNote.moreTooltip") } });

  return card;
}

function renderDisplayMode(container: HTMLElement, options: StickyNoteCardOptions): void {
  container.empty();
  MarkdownRenderer.render(options.app, options.comment.content, container, options.sourcePath, options.component);
}

function renderEditMode(container: HTMLElement, options: StickyNoteCardOptions): void {
  container.empty();
  const title = container.createEl("input", {
    cls: "axl-sticky-title-editor",
    attr: { type: "text", placeholder: t("stickyNote.titlePlaceholder") },
  });
  title.value = options.comment.title ?? "";
  const editor = container.createEl("textarea", {
    cls: "axl-sticky-editor",
    attr: { rows: "5", placeholder: t("stickyNote.editorPlaceholder") },
  });
  editor.value = options.comment.content;
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);

  const actions = container.createDiv({ cls: "axl-sticky-edit-actions" });
  const save = actions.createEl("button", { text: t("stickyNote.save"), cls: "mod-cta", attr: { type: "button" } });
  const cancel = actions.createEl("button", { text: t("stickyNote.cancel"), attr: { type: "button" } });

  const saveContent = (): void => {
    options.onUpdate(options.comment, editor.value, title.value.trim());
    renderDisplayMode(container, {
      ...options,
      comment: {
        ...options.comment,
        title: title.value.trim(),
        content: editor.value,
      },
    });
  };

  save.addEventListener("click", saveContent);
  cancel.addEventListener("click", () => renderDisplayMode(container, options));
  editor.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      saveContent();
    }
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
