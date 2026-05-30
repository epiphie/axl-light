/**
 * [INPUT]: 依赖 locale/en.ts 与 locale/zh-cn.ts 语言包
 * [OUTPUT]: 对外提供 t() 翻译函数、detectLocale() 语言检测、getColorLabel()、getNoteTitleLabel()
 * [POS]: i18n 模块核心，被所有需要展示用户文本的模块引用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import en from "./locale/en";
import zhCN from "./locale/zh-cn";

// ---- Types ----

type Join<K, P extends string> = K extends string ? (P extends "" ? K : `${P}.${K}`) : never;

type Paths<T, P extends string = ""> = T extends object
  ? {
      [K in keyof T]: K extends string ? (T[K] extends string ? Join<K, P> : Paths<T[K], Join<K, P>>) : never;
    }[keyof T]
  : never;

export type TranslationKey = Paths<typeof en>;

type SupportedLocale = "en" | "zh-cn";
type LocaleMessages = Record<string, unknown>;

// ---- Locale State ----

const messages: Record<SupportedLocale, LocaleMessages> = {
  en: en as unknown as LocaleMessages,
  "zh-cn": zhCN as unknown as LocaleMessages,
};

let currentLocale: SupportedLocale = "en";

export function getLocale(): SupportedLocale {
  return currentLocale;
}

export function detectLocale(app: { getLanguage?: () => string }): SupportedLocale {
  const getLanguage = (app as Record<string, unknown>).getLanguage as (() => string) | undefined;
  const lang = getLanguage?.() ?? momentLocale() ?? "en";

  const normalized = String(lang).toLowerCase();
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-hans") {
    currentLocale = "zh-cn";
  } else {
    currentLocale = "en";
  }
  return currentLocale;
}

function momentLocale(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const win = window as Window & { moment?: { locale?: () => string } };
  return win.moment?.locale?.();
}

// ---- t() Function ----

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const localeMessages = messages[currentLocale];
  const parts = key.split(".");
  let value: unknown = localeMessages;

  for (const part of parts) {
    if (value == null || typeof value !== "object") {
      return key;
    }
    value = (value as Record<string, unknown>)[part];
  }

  if (typeof value !== "string") {
    return key;
  }

  if (vars) {
    return value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
  }

  return value;
}

// ---- Color Display Helper ----

export function getColorLabel(color: string): string {
  const colorMessages = messages[currentLocale]?.color as Record<string, string> | undefined;
  return colorMessages?.[color] ?? color;
}

// ---- Note Title Label Helper ----

export function getNoteTitleLabel(title: string): string {
  const titleMessages = messages[currentLocale]?.noteTitle as Record<string, string> | undefined;
  return titleMessages?.[title] ?? title;
}
