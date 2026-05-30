/**
 * [INPUT]: 依赖 Obsidian ItemView、AnnotationStore 数据与插件主类回调
 * [OUTPUT]: 对外提供 AnnotationSidebarView，将 highlight 与关联 note 合并为同一张总览卡片
 * [POS]: views 模块的右侧 Leaf 总览面板，是 sticky lane 移除后的主注释工作台
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ItemView, MarkdownRenderer, MarkdownView, Notice, setIcon, TFile, WorkspaceLeaf } from "obsidian";

import type OverlayAnnotationsPlugin from "../../main";
import { getColorLabel, getNoteTitleLabel, t } from "../i18n/helpers";
import {
  ANNOTATION_COLORS,
  AnnotationColor,
  AnnotationSortMode,
  CommentAnnotation,
  HighlightAnnotation,
  PdfCommentAnnotation,
  PdfHighlightAnnotation,
} from "../storage/types";

export const ANNOTATION_SIDEBAR_VIEW = "axl-light-sidebar";

type AnnotationKind = "highlight" | "note";
type AnnotationMode = "md" | "pdf";
type TypeFilter = "all" | AnnotationKind;

type HighlightSource =
  | {
      mode: "md";
      highlight: HighlightAnnotation;
      note: CommentAnnotation | null;
      pageNumber: null;
      startOffset: number;
    }
  | {
      mode: "pdf";
      highlight: PdfHighlightAnnotation;
      note: PdfCommentAnnotation | null;
      pageNumber: number;
      startOffset: number;
    };

type OrphanNoteSource =
  | {
      mode: "md";
      note: CommentAnnotation;
      pageNumber: null;
      startOffset: number;
    }
  | {
      mode: "pdf";
      note: PdfCommentAnnotation;
      pageNumber: number;
      startOffset: number;
    };

type SidebarCard =
  | {
      id: string;
      kind: "highlight";
      mode: AnnotationMode;
      color: AnnotationColor;
      text: string;
      content: string;
      createdAt: string;
      startOffset: number;
      pageNumber: number | null;
      orphaned?: boolean;
      isCode: boolean;
      highlight: HighlightAnnotation | PdfHighlightAnnotation;
      note: CommentAnnotation | PdfCommentAnnotation | null;
    }
  | {
      id: string;
      kind: "note";
      mode: AnnotationMode;
      color: AnnotationColor;
      text: string;
      content: string;
      createdAt: string;
      startOffset: number;
      pageNumber: number | null;
      orphaned?: boolean;
      isCode: boolean;
      highlight: null;
      note: CommentAnnotation | PdfCommentAnnotation;
    };

export class AnnotationSidebarView extends ItemView {
  private query = "";
  private color: AnnotationColor | "all" = "all";
  private type: TypeFilter = "all";
  private sort: AnnotationSortMode = "document";

  constructor(leaf: WorkspaceLeaf, private readonly plugin: OverlayAnnotationsPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return ANNOTATION_SIDEBAR_VIEW;
  }

  getDisplayText(): string {
    return t("sidebar.viewName");
  }

  getIcon(): string {
    return "axl-light-icon";
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass("axl-sidebar");
    await this.render();
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1] ?? this.containerEl;
    container.empty();
    container.addClass("axl-overview");

    const file = this.app.workspace.getActiveFile();
    this.renderHeader(container);
    this.renderControls(container);

    if (!file) {
      container.createDiv({ cls: "axl-empty", text: t("sidebar.emptyState") });
      return;
    }

    const document = await this.plugin.store.getDocument(file);
    const rawCards = this.buildCards(
      document.highlights,
      document.comments,
      document.pdfHighlights,
      document.pdfComments,
    );
    const cards = this.filterCards(rawCards);
    const highlightCount =
      document.highlights.filter((highlight) => !highlight.orphaned).length +
      document.pdfHighlights.filter((highlight) => !highlight.orphaned).length;
    const noteCount =
      document.comments.filter((comment) => !comment.orphaned).length +
      document.pdfComments.filter((comment) => !comment.orphaned).length;
    container.createDiv({ cls: "axl-ov-count", text: t("sidebar.countTemplate", { highlightCount: String(highlightCount), noteCount: String(noteCount) }) });

    const list = container.createDiv({ cls: "axl-ov-list" });
    if (!cards.length) {
      list.createDiv({ cls: "axl-empty", text: t("sidebar.noMatches") });
    } else {
      for (const card of cards) {
        this.renderCard(list, file, card);
      }
    }

    this.renderExportFooter(container, file);
  }

  private buildCards(
    highlights: HighlightAnnotation[],
    comments: CommentAnnotation[],
    pdfHighlights: PdfHighlightAnnotation[],
    pdfComments: PdfCommentAnnotation[],
  ): SidebarCard[] {
    const usedNotes = new Set<string>();
    const cards: SidebarCard[] = [];

    for (const source of this.markdownHighlightSources(highlights, comments, usedNotes)) {
      cards.push(this.highlightCard(source));
    }

    for (const source of this.pdfHighlightSources(pdfHighlights, pdfComments, usedNotes)) {
      cards.push(this.highlightCard(source));
    }

    for (const source of this.orphanNoteSources(comments, pdfComments, usedNotes)) {
      cards.push(this.orphanNoteCard(source));
    }

    return cards;
  }

  private markdownHighlightSources(
    highlights: HighlightAnnotation[],
    comments: CommentAnnotation[],
    usedNotes: Set<string>,
  ): HighlightSource[] {
    return highlights.map((highlight) => {
      const note = this.findAttachedMarkdownNote(highlight, comments, usedNotes);
      if (note) {
        usedNotes.add(note.id);
      }

      return {
        mode: "md",
        highlight,
        note,
        pageNumber: null,
        startOffset: highlight.anchor.startOffset,
      };
    });
  }

  private pdfHighlightSources(
    highlights: PdfHighlightAnnotation[],
    comments: PdfCommentAnnotation[],
    usedNotes: Set<string>,
  ): HighlightSource[] {
    return highlights.map((highlight) => {
      const note = this.findAttachedPdfNote(highlight, comments, usedNotes);
      if (note) {
        usedNotes.add(note.id);
      }

      return {
        mode: "pdf",
        highlight,
        note,
        pageNumber: highlight.anchor.pageNumber,
        startOffset: Number.MAX_SAFE_INTEGER,
      };
    });
  }

  private orphanNoteSources(
    comments: CommentAnnotation[],
    pdfComments: PdfCommentAnnotation[],
    usedNotes: Set<string>,
  ): OrphanNoteSource[] {
    return [
      ...comments
        .filter((note) => !usedNotes.has(note.id))
        .map((note): OrphanNoteSource => ({
          mode: "md",
          note,
          pageNumber: null,
          startOffset: note.anchor.startOffset,
        })),
      ...pdfComments
        .filter((note) => !usedNotes.has(note.id))
        .map((note): OrphanNoteSource => ({
          mode: "pdf",
          note,
          pageNumber: note.anchor.pageNumber,
          startOffset: Number.MAX_SAFE_INTEGER,
        })),
    ];
  }

  private findAttachedMarkdownNote(
    highlight: HighlightAnnotation,
    comments: CommentAnnotation[],
    usedNotes: Set<string>,
  ): CommentAnnotation | null {
    return (
      comments.find((note) => !usedNotes.has(note.id) && note.highlightId === highlight.id) ??
      comments.find((note) => {
        return (
          !usedNotes.has(note.id) &&
          !note.highlightId &&
          note.anchor.startOffset === highlight.anchor.startOffset &&
          note.anchor.selectedText === highlight.anchor.selectedText
        );
      }) ??
      null
    );
  }

  private findAttachedPdfNote(
    highlight: PdfHighlightAnnotation,
    comments: PdfCommentAnnotation[],
    usedNotes: Set<string>,
  ): PdfCommentAnnotation | null {
    return (
      comments.find((note) => !usedNotes.has(note.id) && note.highlightId === highlight.id) ??
      comments.find((note) => {
        return (
          !usedNotes.has(note.id) &&
          !note.highlightId &&
          note.anchor.pageNumber === highlight.anchor.pageNumber &&
          note.anchor.selectedText === highlight.anchor.selectedText
        );
      }) ??
      null
    );
  }

  private highlightCard(source: HighlightSource): SidebarCard {
    return {
      id: source.highlight.id,
      kind: "highlight",
      mode: source.mode,
      color: source.highlight.color,
      text: source.highlight.anchor.selectedText,
      content: source.note?.content ?? "",
      createdAt: source.highlight.createdAt,
      startOffset: source.startOffset,
      pageNumber: source.pageNumber,
      orphaned: source.highlight.orphaned || source.note?.orphaned,
      isCode: isCodeAnchor(source.highlight.anchor),
      highlight: source.highlight,
      note: source.note,
    };
  }

  private orphanNoteCard(source: OrphanNoteSource): SidebarCard {
    return {
      id: source.note.id,
      kind: "note",
      mode: source.mode,
      color: source.note.color,
      text: source.note.anchor.selectedText,
      content: source.note.content,
      createdAt: source.note.createdAt,
      startOffset: source.startOffset,
      pageNumber: source.pageNumber,
      orphaned: source.note.orphaned,
      isCode: isCodeAnchor(source.note.anchor),
      highlight: null,
      note: source.note,
    };
  }

  private renderHeader(container: Element): void {
    const header = container.createDiv({ cls: "axl-ov-head" });
    header.createSpan({ cls: "axl-ov-title", text: t("sidebar.header.title") });
    const close = header.createEl("button", {
      cls: "axl-icon-btn axl-ov-close",
      attr: { type: "button", title: t("sidebar.header.closeTitle"), "aria-label": t("sidebar.header.closeAriaLabel") },
    });
    setIcon(close, "x");
    close.addEventListener("click", () => {
      void this.leaf.detach();
    });
  }

  private renderControls(container: Element): void {
    const searchRow = container.createDiv({ cls: "axl-ov-search-row" });
    const search = searchRow.createEl("input", {
      cls: "axl-ov-search",
      attr: { type: "search", placeholder: t("sidebar.search.placeholder") },
    });
    search.value = this.query;
    search.addEventListener("input", async () => {
      this.query = search.value;
      await this.render();
    });
    const filterButton = searchRow.createEl("button", { cls: "axl-icon-btn", attr: { type: "button", title: t("sidebar.search.filterTitle") } });
    setIcon(filterButton, "filter");

    const filterRow = container.createDiv({ cls: "axl-ov-filter-row" });
    const color = filterRow.createEl("select", { cls: "axl-filter-select" });
    color.createEl("option", { text: t("sidebar.filter.allColors"), value: "all" });
    for (const item of ANNOTATION_COLORS) {
      color.createEl("option", { text: getColorLabel(item), value: item });
    }
    color.value = this.color;
    color.addEventListener("change", async () => {
      this.color = color.value as AnnotationColor | "all";
      await this.render();
    });

    const type = filterRow.createEl("select", { cls: "axl-filter-select" });
    type.createEl("option", { text: t("sidebar.filter.allTypes"), value: "all" });
    type.createEl("option", { text: t("sidebar.filter.typeHighlight"), value: "highlight" });
    type.createEl("option", { text: t("sidebar.filter.typeNote"), value: "note" });
    type.value = this.type;
    type.addEventListener("change", async () => {
      this.type = type.value as TypeFilter;
      await this.render();
    });

    const sort = filterRow.createEl("select", { cls: "axl-filter-select" });
    const sortOptions: { value: string; label: string }[] = [
      { value: "document", label: t("sidebar.sort.document") },
      { value: "newest", label: t("sidebar.sort.newest") },
      { value: "oldest", label: t("sidebar.sort.oldest") },
    ];
    for (const item of sortOptions) {
      sort.createEl("option", { text: item.label, value: item.value });
    }
    sort.value = this.sort;
    sort.addEventListener("change", async () => {
      this.sort = sort.value as AnnotationSortMode;
      await this.render();
    });
  }

  private renderCard(list: Element, file: TFile, cardData: SidebarCard): void {
    const card = list.createDiv({
      cls: `axl-ov-card axl-ov-card--${cardData.color}`,
      attr: this.cardAttributes(cardData),
    });
    card.toggleClass("is-orphaned", !!cardData.orphaned);

    const head = card.createDiv({ cls: "axl-ov-card-head" });
    head.createSpan({ cls: `axl-ov-label axl-label--${cardData.color}`, text: getColorLabel(cardData.color) });
    head.createSpan({ cls: "axl-ov-meta", text: cardData.mode });
    head.createSpan({ cls: "axl-ov-dot", text: "·" });
    const title = cardData.note?.title ?? "";
    const type = head.createSpan({
      cls: "axl-ov-type",
      text: title ? getNoteTitleLabel(title) : cardData.kind,
    });
    if (title) {
      type.dataset.title = title;
    }
    head.createSpan({ cls: "axl-ov-time", text: formatTime(cardData.createdAt) });

    const quote = card.createDiv({ cls: "axl-ov-quote" });
    quote.textContent = cardData.text;
    quote.toggleClass("is-code", cardData.isCode || isCodeLikeText(cardData.text));
    this.addExpandToggle(quote, card);
    if (cardData.content) {
      const content = card.createDiv({ cls: "axl-ov-content" });
      void MarkdownRenderer.render(this.app, cardData.content, content, file.path, this).then(() => {
        this.addExpandToggle(content, card);
      });
    }

    const source = card.createDiv({ cls: "axl-ov-source" });
    source.createSpan({ cls: "axl-ov-file", text: file.name });
    source.createSpan({ cls: "axl-ov-mode", text: cardData.pageNumber ? t("sidebar.card.pdfPage", { page: String(cardData.pageNumber) }) : t("sidebar.card.modeMarkdown") });

    const actions = card.createDiv({ cls: "axl-ov-actions" });
    if (cardData.note) {
      const edit = actions.createEl("button", {
        cls: "axl-ov-btn axl-ov-btn--icon",
        attr: { type: "button", title: t("sidebar.card.editNoteTitle"), "data-action": "edit-note" },
      });
      setIcon(edit, "pencil");
      edit.addEventListener("click", () => this.openInlineEditor(card, file, cardData, cardData.content));
    } else if (cardData.highlight) {
      const addNote = actions.createEl("button", {
        cls: "axl-ov-btn",
        text: t("sidebar.card.addNote"),
        attr: { type: "button", "data-action": "add-note" },
      });
      addNote.addEventListener("click", () => {
        addNote.addClass("hidden");
        this.openInlineEditor(card, file, cardData, "");
      });
    }

    const jump = actions.createEl("button", {
      cls: "axl-ov-btn",
      text: t("sidebar.card.jump"),
      attr: { type: "button", "data-action": "jump" },
    });
    jump.addEventListener("click", () => this.jumpTo(file, cardData.startOffset, cardData.pageNumber));

    const remove = actions.createEl("button", {
      cls: "axl-ov-btn axl-ov-btn--danger",
      text: t("sidebar.card.delete"),
      attr: { type: "button", "data-action": "delete" },
    });
    remove.addEventListener("click", async () => {
      await this.deleteCard(file, cardData);
      new Notice(t("sidebar.card.annotationDeleted"));
      await this.plugin.refreshAnnotations();
    });

    const edit = card.createDiv({ cls: "axl-ov-edit hidden" });
    const textarea = edit.createEl("textarea", {
      cls: "axl-ov-textarea",
      attr: { placeholder: t("sidebar.inlineEditor.placeholder") },
    });
    const editActions = edit.createDiv({ cls: "axl-ov-edit-actions" });
    editActions.createEl("button", { cls: "axl-ov-save", text: t("sidebar.inlineEditor.save"), attr: { type: "button" } });
    editActions.createEl("button", { cls: "axl-ov-cancel", text: t("sidebar.inlineEditor.cancel"), attr: { type: "button" } });
  }

  private cardAttributes(card: SidebarCard): Record<string, string> {
    const attrs: Record<string, string> = { "data-id": card.id };
    if (card.highlight) {
      attrs["data-highlight-id"] = card.highlight.id;
    }
    if (card.note) {
      attrs["data-note-id"] = card.note.id;
    }
    return attrs;
  }

  private openInlineEditor(card: HTMLElement, file: TFile, cardData: SidebarCard, initialValue: string): void {
    const edit = card.querySelector<HTMLElement>(".axl-ov-edit");
    const textarea = card.querySelector<HTMLTextAreaElement>(".axl-ov-textarea");
    const save = card.querySelector<HTMLButtonElement>(".axl-ov-save");
    const cancel = card.querySelector<HTMLButtonElement>(".axl-ov-cancel");
    const addNote = card.querySelector<HTMLElement>('[data-action="add-note"]');
    if (!edit || !textarea || !save || !cancel) {
      return;
    }

    textarea.value = initialValue;
    edit.removeClass("hidden");
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const saveContent = async (): Promise<void> => {
      await this.saveCardContent(file, cardData, textarea.value);
      await this.plugin.refreshAnnotations();
    };

    save.onclick = () => {
      void saveContent();
    };
    cancel.onclick = () => {
      textarea.value = initialValue;
      edit.addClass("hidden");
      addNote?.removeClass("hidden");
    };
    textarea.onkeydown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void saveContent();
      }
      if (event.key === "Escape") {
        textarea.value = initialValue;
        edit.addClass("hidden");
        addNote?.removeClass("hidden");
      }
    };
  }

  private addExpandToggle(contentEl: HTMLElement, wrapperEl: HTMLElement): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const lineHeight = parseFloat(getComputedStyle(contentEl).lineHeight);
        const threshold = lineHeight * 3 + 10;
        if (contentEl.scrollHeight <= threshold + 2) {
          return;
        }

        const button = document.createElement("span");
        button.className = "axl-ov-expand-btn";
        button.textContent = t("sidebar.card.showMore");
        button.tabIndex = 0;
        button.setAttribute("role", "button");
        contentEl.insertAdjacentElement("afterend", button);
        const toggle = (): void => {
          const expanded = contentEl.hasClass("expanded");
          contentEl.toggleClass("expanded", !expanded);
          button.setText(expanded ? t("sidebar.card.showMore") : t("sidebar.card.showLess"));
        };
        button.addEventListener("click", toggle);
        button.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        });
      });
    });
  }

  private async saveCardContent(file: TFile, card: SidebarCard, content: string): Promise<void> {
    if (card.note && card.mode === "pdf") {
      await this.plugin.store.updatePdfComment(file, {
        ...(card.note as PdfCommentAnnotation),
        content,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (card.note && card.mode === "md") {
      await this.plugin.store.updateComment(file, {
        ...(card.note as CommentAnnotation),
        content,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (card.highlight && card.mode === "pdf") {
      const now = new Date().toISOString();
      const highlight = card.highlight as PdfHighlightAnnotation;
      await this.plugin.store.addPdfComment(file, {
        id: crypto.randomUUID(),
        highlightId: highlight.id,
        anchor: highlight.anchor,
        content,
        color: highlight.color,
        position: { offsetX: 20, offsetY: 0 },
        collapsed: false,
        author: this.plugin.settings.defaultAuthor,
        createdAt: now,
        updatedAt: now,
        replies: [],
        resolved: false,
      });
      return;
    }

    if (card.highlight && card.mode === "md") {
      const now = new Date().toISOString();
      const highlight = card.highlight as HighlightAnnotation;
      await this.plugin.store.addComment(file, {
        id: crypto.randomUUID(),
        highlightId: highlight.id,
        anchor: highlight.anchor,
        content,
        color: highlight.color,
        position: { offsetX: 20, offsetY: 0 },
        collapsed: false,
        author: this.plugin.settings.defaultAuthor,
        createdAt: now,
        updatedAt: now,
        replies: [],
        resolved: false,
      });
    }
  }

  private async deleteCard(file: TFile, card: SidebarCard): Promise<void> {
    if (card.highlight) {
      await this.plugin.store.removeAnnotation(file, card.highlight.id);
    }
    if (card.note) {
      await this.plugin.store.removeAnnotation(file, card.note.id);
    }
  }

  private filterCards(cards: SidebarCard[]): SidebarCard[] {
    return cards
      .filter((card) => this.color === "all" || card.color === this.color)
      .filter((card) => {
        if (this.type === "all") {
          return true;
        }
        if (this.type === "highlight") {
          return card.kind === "highlight";
        }
        return Boolean(card.note);
      })
      .filter((card) => {
        const haystack = `${card.text} ${card.content}`.toLowerCase();
        return haystack.includes(this.query.toLowerCase());
      })
      .sort((a, b) => {
        if (this.sort === "newest") {
          return this.cardUpdatedAt(b).localeCompare(this.cardUpdatedAt(a));
        }
        if (this.sort === "oldest") {
          return this.cardUpdatedAt(a).localeCompare(this.cardUpdatedAt(b));
        }
        return (a.pageNumber ?? 0) - (b.pageNumber ?? 0) || a.startOffset - b.startOffset;
      });
  }

  private cardUpdatedAt(card: SidebarCard): string {
    return card.note?.updatedAt ?? card.createdAt;
  }

  private renderExportFooter(container: Element, file: TFile | null): void {
    const footer = container.createDiv({ cls: "axl-ov-foot" });
    const exportButton = footer.createEl("button", { cls: "axl-export-btn", text: t("sidebar.export.buttonLabel"), attr: { type: "button" } });
    exportButton.disabled = !file;
    exportButton.addEventListener("click", async () => {
      if (!file) {
        return;
      }
      const exported = await this.plugin.store.exportNotes(file);
      new Notice(t("sidebar.export.exportedNotice", { path: exported.path }));
    });
    footer.createDiv({ cls: "axl-ov-export-note", text: t("sidebar.export.footnote") });
  }

  private async jumpTo(file: TFile, offset: number, pageNumber: number | null): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    if (file.extension.toLowerCase() === "pdf") {
      window.setTimeout(() => {
        const page = document.querySelector<HTMLElement>(
          `.workspace-leaf.mod-active .pdf-page[data-page-number="${pageNumber}"], .workspace-leaf.mod-active .page[data-page-number="${pageNumber}"]`,
        );
        page?.scrollIntoView({ block: "center" });
        page?.addClass("axl-flash-target");
        window.setTimeout(() => page?.removeClass("axl-flash-target"), 850);
      }, 120);
      return;
    }

    const view = leaf.view instanceof MarkdownView ? leaf.view : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      return;
    }

    const pos = view.editor.offsetToPos(offset);
    view.editor.setCursor(pos);
    view.editor.scrollIntoView({ from: pos, to: pos }, true);
    view.containerEl.addClass("axl-flash-target");
    window.setTimeout(() => view.containerEl.removeClass("axl-flash-target"), 850);
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isCodeAnchor(anchor: HighlightAnnotation["anchor"] | PdfHighlightAnnotation["anchor"]): boolean {
  return "isCode" in anchor && Boolean(anchor.isCode);
}

function isCodeLikeText(text: string): boolean {
  return /^[ \t]{2,}/m.test(text) || /\n[ \t]{2,}\S/.test(text);
}
