/**
 * [INPUT]: 依赖 obsidian App/Vault/Adapter 的文件读写能力，依赖 storage/types 的 sidecar JSON 合约
 * [OUTPUT]: 对外提供 AnnotationStore，负责 Markdown/PDF 的 .obsidian-annotations sidecar 文件、索引、缓存与导出
 * [POS]: storage 模块的唯一持久化入口，隔离原始 Markdown 与注释数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { App, normalizePath, TFile } from "obsidian";

import { getColorLabel, t } from "../i18n/helpers";
import {
  AnnotationIndex,
  AnnotationIndexEntry,
  CommentAnnotation,
  EMPTY_INDEX,
  FileAnnotationDocument,
  HighlightAnnotation,
  PdfCommentAnnotation,
  PdfHighlightAnnotation,
} from "./types";

const STORE_DIR = ".obsidian-annotations";
const INDEX_PATH = normalizePath(`${STORE_DIR}/index.json`);

export class AnnotationStore {
  private readonly documents = new Map<string, FileAnnotationDocument>();
  private index: AnnotationIndex = EMPTY_INDEX;
  private changeVersion = 0;

  constructor(private readonly app: App) {}

  get version(): number {
    return this.changeVersion;
  }

  async initialize(): Promise<void> {
    await this.ensureStoreDir();
    this.index = await this.readJson<AnnotationIndex>(INDEX_PATH, EMPTY_INDEX);
  }

  getCachedDocument(filePath: string): FileAnnotationDocument | null {
    return this.documents.get(this.toCacheKey(filePath)) ?? null;
  }

  async getDocument(file: TFile): Promise<FileAnnotationDocument> {
    const filePath = this.normalizeVaultPath(file.path);
    const cacheKey = this.toCacheKey(filePath);
    const cached = this.documents.get(cacheKey);
    if (cached) {
      return cached;
    }

    const sidecarPath = this.toSidecarPath(filePath);
    const fallback = await this.createEmptyDocument(file);
    const document = await this.readJson<FileAnnotationDocument>(sidecarPath, fallback);
    this.documents.set(cacheKey, this.normalizeDocument(document, filePath));
    return this.documents.get(cacheKey)!;
  }

  async saveDocument(document: FileAnnotationDocument): Promise<void> {
    const filePath = this.normalizeVaultPath(document.filePath);
    const sidecarPath = this.toSidecarPath(filePath);
    const normalized = this.normalizeDocument(document, filePath);
    await this.ensureStoreDir();
    await this.app.vault.adapter.write(sidecarPath, JSON.stringify(normalized, null, 2));

    this.documents.set(this.toCacheKey(normalized.filePath), normalized);
    this.index.files[normalized.filePath] = this.toIndexEntry(normalized, sidecarPath);
    await this.writeIndex();
    this.changeVersion += 1;
  }

  async addHighlight(file: TFile, highlight: HighlightAnnotation): Promise<FileAnnotationDocument> {
    const document = await this.getDocument(file);
    document.highlights = [...document.highlights, highlight].sort(
      (a, b) => a.anchor.startOffset - b.anchor.startOffset,
    );
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
    return document;
  }

  async addComment(file: TFile, comment: CommentAnnotation): Promise<FileAnnotationDocument> {
    const document = await this.getDocument(file);
    document.comments = [...document.comments, comment].sort(
      (a, b) => a.anchor.startOffset - b.anchor.startOffset,
    );
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
    return document;
  }

  async addPdfHighlight(file: TFile, highlight: PdfHighlightAnnotation): Promise<FileAnnotationDocument> {
    const document = await this.getDocument(file);
    document.pdfHighlights = [...document.pdfHighlights, highlight].sort(
      (a, b) => a.anchor.pageNumber - b.anchor.pageNumber,
    );
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
    return document;
  }

  async addPdfComment(file: TFile, comment: PdfCommentAnnotation): Promise<FileAnnotationDocument> {
    const document = await this.getDocument(file);
    document.pdfComments = [...document.pdfComments, comment].sort((a, b) => {
      return a.anchor.pageNumber - b.anchor.pageNumber;
    });
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
    return document;
  }

  async updatePdfComment(file: TFile, comment: PdfCommentAnnotation): Promise<FileAnnotationDocument> {
    const document = await this.getDocument(file);
    document.pdfComments = document.pdfComments.map((item) => (item.id === comment.id ? comment : item));
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
    return document;
  }

  async updateComment(file: TFile, comment: CommentAnnotation): Promise<FileAnnotationDocument> {
    const document = await this.getDocument(file);
    document.comments = document.comments.map((item) => (item.id === comment.id ? comment : item));
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
    return document;
  }

  async updateCommentContent(
    file: TFile,
    commentId: string,
    content: string,
    title?: string,
  ): Promise<FileAnnotationDocument> {
    const document = await this.getDocument(file);
    document.comments = document.comments.map((item) => {
      if (item.id !== commentId) {
        return item;
      }

      return {
        ...item,
        title,
        content,
        updatedAt: new Date().toISOString(),
      };
    });
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
    return document;
  }

  async updatePdfCommentContent(
    file: TFile,
    commentId: string,
    content: string,
    title?: string,
  ): Promise<FileAnnotationDocument> {
    const document = await this.getDocument(file);
    document.pdfComments = document.pdfComments.map((item) => {
      if (item.id !== commentId) {
        return item;
      }

      return {
        ...item,
        title,
        content,
        updatedAt: new Date().toISOString(),
      };
    });
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
    return document;
  }

  async removeAnnotation(file: TFile, annotationId: string): Promise<FileAnnotationDocument> {
    const document = await this.getDocument(file);
    document.highlights = document.highlights.filter((item) => item.id !== annotationId);
    document.comments = document.comments.filter((item) => item.id !== annotationId);
    document.pdfHighlights = document.pdfHighlights.filter((item) => item.id !== annotationId);
    document.pdfComments = document.pdfComments.filter((item) => item.id !== annotationId);
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
    return document;
  }

  async migrateFilePath(oldPath: string, file: TFile): Promise<void> {
    const normalizedOldPath = this.normalizeVaultPath(oldPath);
    const oldSidecar = this.toSidecarPath(normalizedOldPath);
    const oldDocument = await this.readJson<FileAnnotationDocument | null>(oldSidecar, null);
    if (!oldDocument) {
      return;
    }

    const nextDocument: FileAnnotationDocument = {
      ...oldDocument,
      filePath: this.normalizeVaultPath(file.path),
      fileHash: await this.hashFile(file),
      lastModified: new Date().toISOString(),
    };

    await this.saveDocument(nextDocument);
    await this.deleteIfExists(oldSidecar);
    delete this.index.files[normalizedOldPath];
    await this.writeIndex();
    this.documents.delete(this.toCacheKey(normalizedOldPath));
  }

  async exportNotes(file: TFile): Promise<TFile> {
    const document = await this.getDocument(file);
    const baseName = file.basename || file.name.replace(/\.md$/i, "");
    const targetPath = normalizePath(`${file.parent?.path ?? ""}/${baseName}-notes.md`);
    const now = new Date().toISOString();
    const lines = [
      `# ${t("export.notesHeading", { path: file.path })}`,
      "",
      `${t("export.exportedLabel", { date: now })}`,
      "",
      `## ${t("export.highlightsHeading")}`,
      "",
      ...document.highlights.map((highlight) => {
        return t("export.highlightItem", {
          text: highlight.anchor.selectedText,
          color: getColorLabel(highlight.color),
          date: highlight.createdAt,
        });
      }),
      ...document.pdfHighlights.map((highlight) => {
        return t("export.pdfPageItem", {
          text: highlight.anchor.selectedText,
          page: String(highlight.anchor.pageNumber),
          color: getColorLabel(highlight.color),
          date: highlight.createdAt,
        });
      }),
      "",
      `## ${t("export.stickyNotesHeading")}`,
      "",
      ...document.comments.map((comment) => {
        return [
          `### ${comment.anchor.selectedText}`,
          "",
          `${t("export.colorLabel", { color: getColorLabel(comment.color) })}`,
          `${t("export.createdLabel", { date: comment.createdAt })}`,
          "",
          comment.content,
          "",
        ].join("\n");
      }),
      ...document.pdfComments.map((comment) => {
        return [
          `### PDF page ${comment.anchor.pageNumber}: ${comment.anchor.selectedText}`,
          "",
          `${t("export.colorLabel", { color: getColorLabel(comment.color) })}`,
          `${t("export.createdLabel", { date: comment.createdAt })}`,
          "",
          comment.content,
          "",
        ].join("\n");
      }),
    ];

    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, lines.join("\n"));
      return existing;
    }

    return this.app.vault.create(targetPath, lines.join("\n"));
  }

  async touchFileHash(file: TFile): Promise<void> {
    const document = await this.getDocument(file);
    document.fileHash = await this.hashFile(file);
    document.lastModified = new Date().toISOString();
    await this.saveDocument(document);
  }

  async hashFile(file: TFile): Promise<string> {
    if (file.extension === "md") {
      return this.hashString(await this.app.vault.cachedRead(file));
    }

    const bytes = await this.app.vault.readBinary(file);
    return this.hashBytes(bytes);
  }

  toSidecarPath(filePath: string): string {
    const safeName = this.normalizeVaultPath(filePath)
      .toLowerCase()
      .split(/[\\/]/)
      .map((part) => encodeURIComponent(part))
      .join("__");
    return normalizePath(`${STORE_DIR}/${safeName}.json`);
  }

  private async createEmptyDocument(file: TFile): Promise<FileAnnotationDocument> {
    return {
      filePath: this.normalizeVaultPath(file.path),
      fileHash: await this.hashFile(file),
      lastModified: new Date().toISOString(),
      highlights: [],
      comments: [],
      pdfHighlights: [],
      pdfComments: [],
    };
  }

  private normalizeDocument(document: FileAnnotationDocument, filePath: string): FileAnnotationDocument {
    return {
      filePath,
      fileHash: document.fileHash ?? "",
      lastModified: document.lastModified ?? new Date().toISOString(),
      highlights: document.highlights ?? [],
      comments: document.comments ?? [],
      pdfHighlights: document.pdfHighlights ?? [],
      pdfComments: document.pdfComments ?? [],
    };
  }

  private toIndexEntry(document: FileAnnotationDocument, sidecarPath: string): AnnotationIndexEntry {
    return {
      filePath: document.filePath,
      sidecarPath,
      fileHash: document.fileHash,
      highlightCount: document.highlights.length + document.pdfHighlights.length,
      commentCount: document.comments.length + document.pdfComments.length,
      updatedAt: document.lastModified,
    };
  }

  private async ensureStoreDir(): Promise<void> {
    const storeDir = normalizePath(STORE_DIR);
    if (!(await this.app.vault.adapter.exists(storeDir))) {
      await this.app.vault.adapter.mkdir(storeDir);
    }
  }

  private async writeIndex(): Promise<void> {
    await this.ensureStoreDir();
    await this.app.vault.adapter.write(INDEX_PATH, JSON.stringify(this.index, null, 2));
  }

  private async readJson<T>(path: string, fallback: T): Promise<T> {
    const normalizedPath = normalizePath(path);
    if (!(await this.app.vault.adapter.exists(normalizedPath))) {
      return fallback;
    }

    try {
      return JSON.parse(await this.app.vault.adapter.read(normalizedPath)) as T;
    } catch {
      return fallback;
    }
  }

  private async deleteIfExists(path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    if (await this.app.vault.adapter.exists(normalizedPath)) {
      await this.app.vault.adapter.remove(normalizedPath);
    }
  }

  private normalizeVaultPath(filePath: string): string {
    return normalizePath(filePath);
  }

  private toCacheKey(filePath: string): string {
    return this.normalizeVaultPath(filePath).toLowerCase();
  }

  private async hashString(content: string): Promise<string> {
    return this.hashBytes(new TextEncoder().encode(content));
  }

  private async hashBytes(bytes: BufferSource): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
}
