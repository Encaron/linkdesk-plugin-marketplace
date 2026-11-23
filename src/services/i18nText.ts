/**
 * i18nText — 目录数据的**语言槽位**解析（唯一入口；⛔ 不再用 t(数据) 碰运气）。
 *
 * 契约（与 @linkdesk/marketplace-kit 的 `locales` 同形）：
 *   base 字段（name/description/title/hint/intro/storeTitle…）永远是必填的兜底；
 *   `locales[lang][field]` 是可选覆盖。解析顺序：精确语言 → 主语言（zh-CN→zh）→ base。
 *
 * ⚠️ 语言码与插件 i18n 同源（en / zh；允许 zh-CN 这类带 region 的键）。
 * ⛔ 本文件不处理 UI 字符串——那些仍走 t()（key=中文原文）。
 */
import i18n from "i18next";

export type LocaleText = Record<string, string | undefined>;
export type Locales = Record<string, LocaleText>;

/** 带语言槽位的目录对象（base 字段由调用方按实体类型约束）。 */
export interface LocalizedLike {
  locales?: Locales;
  [field: string]: unknown;
}

/** 精确语言键 + 主语言键（zh-CN → zh）的候选顺序。 */
export function localeKeys(lang: string): string[] {
  const l = String(lang || "zh").toLowerCase();
  const base = l.split("-")[0];
  return l === base ? [base] : [l, base];
}

/** 目录字段解析：locales 覆盖 → base。field 不存在时返回 undefined。 */
export function localizedField(obj: LocalizedLike | undefined | null, field: string, lang?: string): string | undefined {
  if (!obj) return undefined;
  const keys = localeKeys(lang ?? i18n.language ?? "zh");
  for (const key of keys) {
    const v = obj.locales?.[key]?.[field];
    if (typeof v === "string" && v.trim()) return v;
  }
  const base = obj[field];
  return typeof base === "string" ? base : undefined;
}

/** 便捷：解析失败时返回空串（供 JSX 直接消费）。参数放宽到 unknown，方便 ResolvedRepo 等包装对象。 */
export function lt(obj: unknown, field: string, lang?: string): string {
  return localizedField(obj as LocalizedLike | undefined | null, field, lang) ?? "";
}

const LOCALE_KEY_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

/**
 * 解析作者声明的 `locales`（白名单归一）：
 *   · 语言键必须像 `en` / `zh` / `zh-CN` / `pt-BR`（小写归一）；
 *   · 值只收非空字符串字段（name/description/title/subtitle/hint/intro/storeTitle/bio…）；
 *   · 坏形状静默丢弃（与目录其它白名单字段同一防御语义），空表返回 undefined。
 */
export function parseLocales(raw: unknown): Locales | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Locales = {};
  for (const [langRaw, fields] of Object.entries(raw as Record<string, unknown>)) {
    const lang = String(langRaw).toLowerCase();
    if (!LOCALE_KEY_RE.test(lang)) continue;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) continue;
    const clean: LocaleText = {};
    for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) clean[field] = value.trim();
    }
    if (Object.keys(clean).length) out[lang] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}
