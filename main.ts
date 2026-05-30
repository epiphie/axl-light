/**
 * [INPUT]: 依赖 Obsidian Plugin API、CM6 扩展、sidecar AnnotationStore、锚点算法、视图与设置模块
 * [OUTPUT]: 对外提供 OverlayAnnotationsPlugin 主类，注册 ribbon 图标、命令、浮动工具栏、高亮、窄屏弹层、侧栏、设置和 vault 事件
 * [POS]: 插件装配根，协调模块但不修改用户 Markdown 原文
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { addIcon, Editor, MarkdownPostProcessorContext, MarkdownView, Modal, Notice, Plugin, TFile } from "obsidian";

import { createTextAnchor, relocateDocumentAnchors } from "./src/anchor/textAnchor";
import { createHighlightExtension } from "./src/editor/highlightExtension";
import { installReadingViewHighlights, refreshReadingViewHighlights } from "./src/editor/readingViewHighlight";
import { SelectionToolbar } from "./src/editor/selectionToolbar";
import { PdfAnnotationLayer } from "./src/pdf/pdfAnnotationLayer";
import { AnnotationSettingsTab } from "./src/settings/settingsTab";
import { AnnotationStore } from "./src/storage/annotationStore";
import {
  AnnotationColor,
  AnnotationPluginSettings,
  CommentAnnotation,
  DEFAULT_SETTINGS,
  HighlightAnnotation,
  SelectionSnapshot,
} from "./src/storage/types";
import { AnnotationPopover } from "./src/views/annotationPopover";
import { detectLocale, getNoteTitleLabel, t } from "./src/i18n/helpers";
import { ANNOTATION_SIDEBAR_VIEW, AnnotationSidebarView } from "./src/views/sidebarView";

interface CommentModalValue {
  title: string;
  content: string;
}

const NOTE_TITLE_VALUES = ["Insight", "Question", "Reminder"] as const;

function getNoteTitleOptions(): { value: string; label: string }[] {
  return NOTE_TITLE_VALUES.map((value) => ({ value, label: getNoteTitleLabel(value) }));
}

const AXL_LIGHT_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="5" y="5" width="90" height="90" rx="20" ry="20" fill="#F5C518"/>
    <g transform="translate(50,50) rotate(-45) translate(-18,-18)"
      fill="none" stroke="#000" stroke-width="6"
      stroke-linecap="round" stroke-linejoin="round">
      <rect x="8" y="2" width="20" height="28" rx="3" fill="#000" stroke="none"/>
      <polygon points="8,30 28,30 18,42" fill="#000" stroke="none"/>
      <line x1="8" y1="10" x2="28" y2="10" stroke="#F5C518" stroke-width="3"/>
    </g>
  </svg>
`;

export default class OverlayAnnotationsPlugin extends Plugin {
  settings: AnnotationPluginSettings = DEFAULT_SETTINGS;
  store!: AnnotationStore;

  private toolbar!: SelectionToolbar;
  private popover!: AnnotationPopover;
  private pdfLayer!: PdfAnnotationLayer;
  private lastSelection: SelectionSnapshot | null = null;
  private renameMigrationTimer: number | null = null;

  async onload(): Promise<void> {
    addIcon("axl-light-icon", AXL_LIGHT_ICON);
    detectLocale(this.app as unknown as { getLanguage?: () => string });

    // Normalize icon button sizing across platforms (macOS vs Windows SVG rendering)
    document.head.insertAdjacentHTML(
      "beforeend",
      "<style>.axl-icon-btn svg,.axl-icon-button svg{width:18px!important;height:18px!important;min-width:18px!important;min-height:18px!important;flex-shrink:0}</style>",
    );
    await this.loadSettings();
    this.store = new AnnotationStore(this.app);
    await this.store.initialize();

    this.registerView(ANNOTATION_SIDEBAR_VIEW, (leaf) => new AnnotationSidebarView(leaf, this));
    this.registerEditorExtension([
      createHighlightExtension({
        getDocument: (filePath) => this.store.getCachedDocument(filePath),
        getVersion: () => this.store.version,
        rememberSelection: (filePath, startOffset, endOffset, selectedText) => {
          this.lastSelection = { filePath, startOffset, endOffset, selectedText };
        },
      }),
    ]);

    this.toolbar = new SelectionToolbar({
      onHighlight: (color) => this.createHighlight(color),
      onComment: () => this.createComment(),
      onCopy: () => this.copySelection(),
      onOpenSidebar: () => this.activateSidebar(),
    });
    this.popover = new AnnotationPopover({ app: this.app, component: this });
    this.pdfLayer = new PdfAnnotationLayer({
      app: this.app,
      component: this,
      getSettings: () => this.settings,
      getDocument: (file) => this.store.getDocument(file),
      getCachedDocument: (filePath) => this.store.getCachedDocument(filePath),
      addHighlight: async (file, highlight) => {
        await this.store.addPdfHighlight(file, highlight);
        await this.refreshAnnotations();
      },
      addComment: async (file, comment) => {
        await this.store.addPdfComment(file, comment);
        await this.refreshAnnotations();
      },
      updateComment: async (file, comment) => {
        await this.store.updatePdfComment(file, comment);
        await this.refreshAnnotations();
      },
      deleteAnnotation: async (file, annotationId) => {
        await this.store.removeAnnotation(file, annotationId);
        await this.refreshAnnotations();
      },
    });

    this.addSettingTab(new AnnotationSettingsTab(this));
    this.registerRibbonIcon();
    this.registerCommands();
    this.registerEvents();
    this.pdfLayer.register();
    this.registerMarkdownPostProcessor((element, context) => this.renderReadingHighlights(element, context));
  }

  onunload(): void {
    if (this.renameMigrationTimer !== null) {
      window.clearTimeout(this.renameMigrationTimer);
    }
    this.toolbar?.destroy();
    this.popover?.destroy();
    this.app.workspace.detachLeavesOfType(ANNOTATION_SIDEBAR_VIEW);
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) ?? {}),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async refreshAnnotations(): Promise<void> {
    this.app.workspace.updateOptions();
    for (const leaf of this.app.workspace.getLeavesOfType(ANNOTATION_SIDEBAR_VIEW)) {
      const view = leaf.view;
      if (view instanceof AnnotationSidebarView) {
        await view.render();
      }
    }
  }

  private registerRibbonIcon(): void {
    const icon = this.addRibbonIcon("highlighter", t("ribbon.tooltip"), () => {
      void this.activateSidebar();
    });
    icon.addClass("axl-ribbon-icon");
  }

  private registerCommands(): void {
    this.addCommand({
      id: "highlight-selection",
      name: t("command.highlightSelection"),
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "h" }],
      callback: () => this.createHighlight(this.settings.defaultHighlightColor),
    });

    this.addCommand({
      id: "add-sticky-note",
      name: t("command.addStickyNote"),
      hotkeys: [{ modifiers: ["Mod", "Alt"], key: "m" }],
      callback: () => this.createComment(),
    });

    this.addCommand({
      id: "toggle-sticky-notes",
      name: t("command.toggleAnnotationPopovers"),
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "n" }],
      callback: async () => {
        this.settings.stickyNotesVisible = !this.settings.stickyNotesVisible;
        await this.saveSettings();
        await this.refreshAnnotations();
      },
    });

    this.addCommand({
      id: "open-annotation-sidebar",
      name: t("command.openAnnotationOverview"),
      callback: () => this.activateSidebar(),
    });
  }

  private registerEvents(): void {
    this.registerDomEvent(document, "selectionchange", () => this.toolbar.showForSelection());
    this.registerDomEvent(document, "mousedown", (event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest(".axl-selection-toolbar")) {
        window.setTimeout(() => this.toolbar.showForSelection(), 0);
      }
    });
    this.registerDomEvent(document, "click", (event) => {
      void this.handleAnnotationClick(event);
    });

    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        const document = await this.store.getDocument(file);
        const source = await this.app.vault.cachedRead(file);
        const relocated = relocateDocumentAnchors(source, document);
        await this.store.saveDocument({
          ...relocated,
          fileHash: await this.store.hashFile(file),
          lastModified: new Date().toISOString(),
        });
        await this.refreshAnnotations();
      }),
    );

    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!this.settings.migrateOnRename || !(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        if (this.renameMigrationTimer !== null) {
          window.clearTimeout(this.renameMigrationTimer);
        }

        this.renameMigrationTimer = window.setTimeout(async () => {
          await this.store.migrateFilePath(oldPath, file);
          await this.refreshAnnotations();
          this.renameMigrationTimer = null;
        }, 100);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-open", async (file) => {
        if (file instanceof TFile && ["md", "pdf"].includes(file.extension.toLowerCase())) {
          this.popover.hide();
          await this.store.getDocument(file);
          await this.refreshAnnotations();
        }
      }),
    );
  }

  private async createHighlight(color: AnnotationColor): Promise<void> {
    if (this.pdfLayer.isPdfActive()) {
      await this.pdfLayer.createHighlight(color);
      this.toolbar.hide();
      return;
    }

    const snapshot = await this.resolveSelection();

    if (!snapshot) {
      new Notice(t("notice.selectTextFirst"));
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(snapshot.filePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const highlight: HighlightAnnotation = {
      id: crypto.randomUUID(),
      color,
      anchor: createAnchorForSnapshot(await this.app.vault.cachedRead(file), snapshot),
      createdAt: new Date().toISOString(),
    };

    await this.store.addHighlight(file, highlight);
    await this.refreshActiveReadingViewHighlights(file.path);
    await this.refreshAnnotations();
    this.toolbar.hide();
  }

  private async createComment(): Promise<void> {
    if (this.pdfLayer.isPdfActive()) {
      const note = await new CommentModal(this.app, "", "").openAndRead();
      if (note !== null) {
        await this.pdfLayer.createComment(
          this.settings.defaultHighlightColor,
          note.content,
          this.settings.defaultAuthor,
          note.title,
        );
      }
      this.toolbar.hide();
      return;
    }

    const snapshot = await this.resolveSelection();
    if (!snapshot) {
      new Notice(t("notice.selectTextFirst"));
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(snapshot.filePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const note = await new CommentModal(this.app, "", "").openAndRead();
    if (note === null) {
      return;
    }

    const now = new Date().toISOString();
    const comment: CommentAnnotation = {
      id: crypto.randomUUID(),
      anchor: createAnchorForSnapshot(await this.app.vault.cachedRead(file), snapshot),
      title: note.title,
      content: note.content,
      color: this.settings.defaultHighlightColor,
      position: { offsetX: 20, offsetY: 0 },
      collapsed: false,
      author: this.settings.defaultAuthor,
      createdAt: now,
      updatedAt: now,
      replies: [],
      resolved: false,
    };

    await this.store.addComment(file, comment);
    await this.refreshActiveReadingViewHighlights(file.path);
    await this.refreshAnnotations();
    this.toolbar.hide();
  }

  private async refreshActiveReadingViewHighlights(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const document = this.store.getCachedDocument(filePath) ?? (await this.store.getDocument(file));
    const marks = [...document.highlights, ...document.comments].filter((item) => !item.orphaned);
    if (!marks.length) {
      return;
    }

    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || view.file?.path !== filePath) {
        continue;
      }

      const previewRoot = findPreviewRoot(view);
      if (previewRoot) {
        refreshReadingViewHighlights(previewRoot, marks);
        continue;
      }

      const previewMode = (view as MarkdownView & { previewMode?: { rerender?: (force?: boolean) => Promise<void> } })
        .previewMode;
      if (previewMode?.rerender) {
        await previewMode.rerender(true);
        const rerenderedRoot = findPreviewRoot(view);
        if (rerenderedRoot) {
          refreshReadingViewHighlights(rerenderedRoot, marks);
        }
      }
    }
  }

  private async resolveSelection(): Promise<SelectionSnapshot | null> {
    const editor = this.activeEditor();
    if (editor?.file) {
      const selectedText = editor.editor.getSelection();
      if (selectedText) {
        const from = editor.editor.posToOffset(editor.editor.getCursor("from"));
        const to = editor.editor.posToOffset(editor.editor.getCursor("to"));
        this.lastSelection = { filePath: editor.file.path, startOffset: from, endOffset: to, selectedText };
        return this.lastSelection;
      }
    }

    const file = this.app.workspace.getActiveFile();
    const selection = window.getSelection();
    const selectedText = selection?.toString().replace(/\r\n/g, "\n").trim() ?? "";

    if (file && selectedText) {
      const source = await this.app.vault.cachedRead(file);
      const located = locateRenderedSelectionInSource(
        source,
        selectedText,
        selection ? renderedOccurrenceBeforeSelection(selection, selectedText) : 0,
        selection ? isSelectionInsideCallout(selection) : false,
      );

      if (located) {
        this.lastSelection = {
          filePath: file.path,
          startOffset: located.startOffset,
          endOffset: located.endOffset,
          selectedText,
        };
        return this.lastSelection;
      }
    }

    return this.lastSelection;
  }

  private activeEditor(): { editor: Editor; file: TFile | null } | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view ? { editor: view.editor, file: view.file } : null;
  }

  async activateSidebar(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(ANNOTATION_SIDEBAR_VIEW)[0];
    if (!leaf) {
      const nextLeaf = this.app.workspace.getRightLeaf(false);
      if (!nextLeaf) {
        return;
      }
      leaf = nextLeaf;
      await leaf.setViewState({ type: ANNOTATION_SIDEBAR_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  private copySelection(): void {
    const text = window.getSelection()?.toString() || this.activeEditor()?.editor.getSelection() || "";
    if (text) {
      navigator.clipboard.writeText(text);
      new Notice(t("notice.copiedSelection"));
    }
  }

  private async handleAnnotationClick(event: MouseEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      this.popover.hide();
      return;
    }

    const mark = target.closest<HTMLElement>(".axl-highlight, .axl-reading-highlight");
    if (!mark) {
      if (!target.closest(".axl-annotation-popover")) {
        this.popover.hide();
      }
      return;
    }

    const annotationId = mark.dataset.axlId;
    const file = this.app.workspace.getActiveFile();
    if (!annotationId || !(file instanceof TFile)) {
      return;
    }

    const document = this.store.getCachedDocument(file.path) ?? (await this.store.getDocument(file));
    const primary =
      document.comments.find((comment) => comment.id === annotationId) ??
      document.highlights.find((highlight) => highlight.id === annotationId);
    if (!primary) {
      unwrapStaleHighlight(mark);
      return;
    }

    const sameAnchorComments = document.comments.filter((comment) => {
      return (
        comment.id !== primary.id &&
        !comment.orphaned &&
        comment.anchor.startOffset === primary.anchor.startOffset &&
        comment.anchor.endOffset === primary.anchor.endOffset
      );
    });
    const items = [primary, ...sameAnchorComments].map((annotation) => AnnotationPopover.itemFromAnnotation(annotation));

    event.preventDefault();
    event.stopPropagation();
    this.popover.show({
      rect: mark.getBoundingClientRect(),
      sourcePath: file.path,
      items,
    });
  }

  private async renderReadingHighlights(element: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    if (!context.sourcePath) {
      return;
    }

    await sleep(100);

    const file = this.app.vault.getAbstractFileByPath(context.sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const document = await this.store.getDocument(file);
    const marks = [...document.highlights, ...document.comments].filter((item) => !item.orphaned);
    installReadingViewHighlights({ root: element, context, marks });
  }
}

function locateRenderedSelectionInSource(
  source: string,
  selectedText: string,
  occurrenceIndex = 0,
  preferRendered = false,
): { startOffset: number; endOffset: number } | null {
  const exact = nthIndexOf(source, selectedText, occurrenceIndex);
  if (exact >= 0) {
    return {
      startOffset: exact,
      endOffset: exact + selectedText.length,
    };
  }

  if (preferRendered) {
    const rendered = locateSelectionIgnoringQuoteMarkers(source, selectedText, occurrenceIndex);
    if (rendered) {
      return rendered;
    }
  }

  return locateSelectionIgnoringQuoteMarkers(source, selectedText, occurrenceIndex);
}

function createAnchorForSnapshot(source: string, snapshot: SelectionSnapshot) {
  const anchor = createTextAnchor(source, snapshot.startOffset, snapshot.endOffset);
  const selectedText = snapshot.selectedText.replace(/\r\n/g, "\n").trim();
  const sourceText = anchor.selectedText.replace(/\r\n/g, "\n").trim();
  if (!selectedText || selectedText === sourceText) {
    return anchor;
  }

  return {
    ...anchor,
    selectedText,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function findPreviewRoot(view: MarkdownView): HTMLElement | null {
  const previewMode = (
    view as MarkdownView & {
      previewMode?: {
        containerEl?: HTMLElement;
      };
    }
  ).previewMode;

  return (
    view.containerEl.querySelector<HTMLElement>(".markdown-preview-view") ??
    view.containerEl.querySelector<HTMLElement>(".markdown-preview-section") ??
    view.containerEl.querySelector<HTMLElement>(".mod-preview") ??
    previewMode?.containerEl?.querySelector<HTMLElement>(".markdown-preview-section") ??
    previewMode?.containerEl ??
    null
  );
}

function unwrapStaleHighlight(mark: HTMLElement): void {
  const parent = mark.parentNode;
  if (!parent) {
    mark.remove();
    return;
  }

  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark);
  }
  parent.removeChild(mark);
  parent.normalize();
}

function locateSelectionIgnoringQuoteMarkers(
  source: string,
  selectedText: string,
  occurrenceIndex = 0,
): { startOffset: number; endOffset: number } | null {
  const normalizedSelection = selectedText.replace(/\r\n/g, "\n");
  const sourceToRendered: number[] = [];
  let rendered = "";
  let lineStart = true;
  let quotePrefix = false;
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (lineStart && char === ">") {
      quotePrefix = true;
      lineStart = false;
      index += 1;
      continue;
    }

    if (quotePrefix && char === " ") {
      quotePrefix = false;
      index += 1;
      continue;
    }

    if (!quotePrefix && char === "[" && source.slice(index).match(/^\[![\w-]+\]/)) {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      quotePrefix = false;
      continue;
    }

    quotePrefix = false;
    rendered += char;
    sourceToRendered.push(index);
    lineStart = char === "\n";
    index += 1;
  }

  const renderedStart = nthIndexOf(rendered, normalizedSelection, occurrenceIndex);
  if (renderedStart < 0) {
    return null;
  }

  const renderedEnd = renderedStart + normalizedSelection.length - 1;
  return {
    startOffset: sourceToRendered[renderedStart],
    endOffset: sourceToRendered[renderedEnd] + 1,
  };
}

function renderedOccurrenceBeforeSelection(selection: Selection, selectedText: string): number {
  if (!selection.rangeCount || !selectedText) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  const root = selectionRoot(range);
  if (!root) {
    return 0;
  }

  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const beforeText = before.toString().replace(/\r\n/g, "\n");
  before.detach();
  return countOccurrences(beforeText, selectedText);
}

function selectionRoot(range: Range): HTMLElement | null {
  const container =
    range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  return (
    container?.closest<HTMLElement>(".markdown-preview-view") ??
    container?.closest<HTMLElement>(".markdown-preview-section") ??
    container?.closest<HTMLElement>(".mod-preview") ??
    null
  );
}

function isSelectionInsideCallout(selection: Selection): boolean {
  if (!selection.rangeCount) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const container =
    range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  return Boolean(container?.closest(".callout, .callout-content"));
}

function countOccurrences(source: string, target: string): number {
  if (!target) {
    return 0;
  }

  let count = 0;
  let cursor = source.indexOf(target);
  while (cursor >= 0) {
    count += 1;
    cursor = source.indexOf(target, cursor + target.length);
  }
  return count;
}

function nthIndexOf(source: string, target: string, occurrenceIndex: number): number {
  if (!target) {
    return -1;
  }

  let cursor = source.indexOf(target);
  let seen = 0;
  while (cursor >= 0) {
    if (seen >= occurrenceIndex) {
      return cursor;
    }
    seen += 1;
    cursor = source.indexOf(target, cursor + target.length);
  }
  return -1;
}

class CommentModal extends Modal {
  private value: CommentModalValue | null = null;
  private resolve!: (value: CommentModalValue | null) => void;

  constructor(
    app: OverlayAnnotationsPlugin["app"],
    private readonly initialTitle: string,
    private readonly initialContent: string,
  ) {
    super(app);
  }

  openAndRead(): Promise<CommentModalValue | null> {
    this.open();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: t("modal.stickyNoteTitle") });

    const titleRow = this.contentEl.createDiv({ cls: "axl-modal-row" });
    titleRow.createEl("label", { cls: "axl-modal-label", text: t("modal.typeLabel") });
    const title = titleRow.createEl("select", { cls: "axl-modal-select" });
    for (const option of getNoteTitleOptions()) {
      title.createEl("option", { text: option.label, attr: { value: option.value } });
    }
    title.value = normalizedNoteTitle(this.initialTitle);

    const contentRow = this.contentEl.createDiv({ cls: "axl-modal-row" });
    contentRow.createEl("label", { cls: "axl-modal-label", text: t("modal.noteLabel") });
    const input = contentRow.createEl("textarea", {
      cls: "axl-modal-textarea",
      attr: { rows: "8", placeholder: t("modal.notePlaceholder") },
    });
    input.value = this.initialContent;

    const actions = this.contentEl.createDiv({ cls: "axl-modal-actions" });
    const cancel = actions.createEl("button", { text: t("modal.cancel"), cls: "axl-modal-cancel", attr: { type: "button" } });
    const save = actions.createEl("button", { text: t("modal.save"), cls: "axl-modal-save", attr: { type: "button" } });
    cancel.addEventListener("click", () => {
      this.value = null;
      this.close();
    });
    save.addEventListener("click", () => {
      this.value = {
        title: title.value.trim(),
        content: input.value.trim(),
      };
      this.close();
    });
  }

  onClose(): void {
    this.resolve?.(this.value);
  }
}

function normalizedNoteTitle(value: string): string {
  return NOTE_TITLE_VALUES.includes(value as (typeof NOTE_TITLE_VALUES)[number]) ? value : NOTE_TITLE_VALUES[0];
}
