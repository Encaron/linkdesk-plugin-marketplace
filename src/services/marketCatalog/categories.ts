/**
 * categories — 分类**封闭名单**与归桶（纯函数，vitest 直测，零 window/IO/i18n）。
 *
 * 正典 = 04 §5.1（2026-11-20 二次拍板）：主分类 7 桶 + 小分类封闭名单，作者只能**选**、⛔ 自创
 * （自由标签在十万级插件量级 = chip 灾难）。名单外 slug 分两处处理，⛔ 都不静默吞：
 *   · parse 期 —— 记声明警告（`CatalogWarning`：unknown-category / unknown-subcategory），
 *     原值保留（作者自查要看得到自己写了什么；06 §三「白名单外静默丢」的教训）；
 *   · 归桶期 —— `primaryCategoryOf` 退回 OTHER（04 §三·机制 4：没声明/写错的件不丢，落「其他」）。
 *
 * rail 顺序 = **数据不是代码**（04 §九·3）：目录仓 `categoryRail.order` 声明；未注册 slug 不进 rail，
 * 恒末位「其他」桶。显示名仍走 i18n `category.*` 值表（marketCategories.ts），本模块只管身份与顺序。
 */

import type { CatalogEntry, CatalogWarning, CategoryRailDecl } from "./types";

/** 兜底桶固定 slug——UI 值表 key 同此（恒存在、恒末位，04 §三·机制 4） */
export const OTHER_CATEGORY_SLUG = "other";

/** 现役 7 桶（04 §5.1；⛔ 扩桶 = 用户明示走 04 §5.3 SOP） */
export const PRIMARY_CATEGORY_SLUGS = [
  "development",
  "documents",
  "hardware",
  "network",
  "productivity",
  "themes",
  "entertainment",
] as const;

/** 小分类封闭名单（04 §5.1 逐格照抄；slug 全英文、zh 走市场值表） */
export const SUBCATEGORY_SLUGS: Readonly<Record<string, readonly string[]>> = {
  development: ["code-editing", "terminal", "vcs", "runtime", "i18n", "debug", "snippets"],
  documents: ["viewer", "convert", "markdown", "files", "office-doc", "notebook"],
  hardware: ["serial", "flash", "probe", "smart-control", "home-automation", "sensor", "iot", "can-bus"],
  network: ["browser", "chat", "cloud", "download", "packet-capture", "proxy", "remote"],
  productivity: ["clipboard", "notes", "ai", "color", "todo", "timer", "launcher", "calculator"],
  themes: ["color-scheme", "icon-pack", "font-pack", "wallpaper", "cursor-set", "sound-pack"],
  entertainment: ["player", "game", "music", "comic", "novel", "stream"],
};

const PRIMARY_SET = new Set<string>(PRIMARY_CATEGORY_SLUGS);
const SUBCATEGORY_SET = new Set<string>(Object.values(SUBCATEGORY_SLUGS).flat());

/** 主分类 slug 在册？（7 桶之一；`other` 不是声明值，是兜底桶） */
export function isKnownPrimaryCategory(slug: string): boolean {
  return PRIMARY_SET.has(slug);
}

/** 小分类 slug 在册？（跨桶并集——schema 不编码父子关系，parse 期只判「是不是名单里的人」） */
export function isKnownSubcategory(slug: string): boolean {
  return SUBCATEGORY_SET.has(slug);
}

/** 主分类判定——`category` 在册优先，退第一个在册的 `categories[]`，再退 OTHER。
 *  ⚠️ 未注册值**不进** rail，但条目本身照样归 OTHER 可见（06 §七验收）。 */
export function primaryCategoryOf(entry: Pick<CatalogEntry, "category" | "categories">): string {
  const primary = entry.category?.trim();
  if (primary && isKnownPrimaryCategory(primary)) return primary;
  for (const slug of entry.categories ?? []) {
    const s = slug?.trim();
    if (s && isKnownPrimaryCategory(s)) return s;
  }
  return OTHER_CATEGORY_SLUG;
}

/** 条目分类声明体检——名单外主分类/小分类各记一条警告（原值进 detail，作者自查定位）。
 *  空/缺声明不算错（04 §5.1：漏写 → 落「其他」桶可见，无报错）。 */
export function validateEntryCategories(entry: Pick<CatalogEntry, "id" | "category" | "categories">): CatalogWarning[] {
  const warnings: CatalogWarning[] = [];
  const primary = entry.category?.trim();
  if (primary && !isKnownPrimaryCategory(primary)) {
    warnings.push({ code: "unknown-category", entryId: entry.id, detail: primary });
  }
  for (const raw of entry.categories ?? []) {
    const slug = raw?.trim();
    if (!slug || isKnownSubcategory(slug)) continue;
    warnings.push({ code: "unknown-subcategory", entryId: entry.id, detail: slug });
  }
  return warnings;
}

/** rail 顺序（声明消费）——声明里在册 slug 按声明序 → 未声明到的在册桶按规范序补齐 → `other` 恒末位。
 *  未注册 slug 丢弃（`unknown-rail-category` 警告由 parse 期记，这里只管顺序）。 */
export function buildCategoryRailOrder(decl?: CategoryRailDecl): string[] {
  const out: string[] = [];
  for (const slug of decl?.order ?? []) {
    const s = slug?.trim();
    if (s && isKnownPrimaryCategory(s) && !out.includes(s)) out.push(s);
  }
  for (const slug of PRIMARY_CATEGORY_SLUGS) if (!out.includes(slug)) out.push(slug);
  out.push(OTHER_CATEGORY_SLUG);
  return out;
}

/** 按主分类归桶——按 rail 顺序输出，空桶不产出（04 §5.1：空分类不进首页瓷片区，rail 灰显由 UI 另判）。
 *  `order` 缺省 = 规范序 + other；`other` 恒末位（声明里写了也没用）。 */
export function groupByPrimaryCategory(
  entries: CatalogEntry[],
  order?: string[],
): Array<{ slug: string; entries: CatalogEntry[] }> {
  const slugs = (order && order.length > 0 ? order : buildCategoryRailOrder()).filter(
    (s, i, a) => s !== OTHER_CATEGORY_SLUG && a.indexOf(s) === i,
  );
  const buckets = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const slug = primaryCategoryOf(entry);
    const list = buckets.get(slug);
    if (list) list.push(entry);
    else buckets.set(slug, [entry]);
  }
  const out: Array<{ slug: string; entries: CatalogEntry[] }> = [];
  for (const slug of [...slugs, OTHER_CATEGORY_SLUG]) {
    const list = buckets.get(slug);
    if (list && list.length > 0) out.push({ slug, entries: list });
  }
  return out;
}
