/**
 * storeData — 商店的**纯数据推导层**（排序 / 分组 / 小类 chips / 搜索 / 榜单 / 计数）。
 *
 * 纪律（10 §六）：解析/排序/筛选不进 JSX——视图只调本文件的纯函数。分类归桶与 chips 名单的
 * **唯一权威**仍是 `services/marketCatalog/categories.ts`（棒 3 落码）；本文件只做「有货即显」
 * 与展示序，⛔ 不复制岗位名单、⛔ 不用 categories[0] 当主分类。
 *
 * 下载数：由调用方注入 `dlOf(entry)`（`useDownloadCounts` 的表）——纯函数不碰网络。
 */

import { primaryCategoryOf, SUBCATEGORY_SLUGS, groupByPrimaryCategory } from "../../services/marketCatalog";
import { authorLabel, formatSize } from "../../services/catalogText";
import type { CatalogEntry } from "../../services/marketCatalog";
import type { PackageState } from "../../services/catalogStatus";

/* ═══ 分类展示 ═══ */

/** 分类说明（值 = i18n key 原文；⛔ 内部缩写——08 §三·文案自解释） */
export const CATEGORY_DESC: Record<string, string> = {
  development: "框架、运行时与编码工具",
  documents: "阅读、批注与文件整理",
  hardware: "串口、外设与硬件玩家工具",
  network: "联网诊断与流量观察",
  productivity: "效率、自动化与快捷触发",
  themes: "主题、图标与外观",
  reading: "长读与订阅",
  entertainment: "消遣与媒体",
  other: "未声明分类的插件都落这里——作者在 manifest 声明 category 后自动归位",
};

/** 分类桶内**有货的小类**（≥1，保 04 §5.1 名单序；⛔ 满 3 旧规） */
export function chipsOf(entries: readonly CatalogEntry[], bucket: string): string[] {
  const allowed = SUBCATEGORY_SLUGS[bucket] ?? [];
  const present = new Set<string>();
  for (const entry of entries) {
    for (const raw of entry.categories ?? []) {
      const slug = raw?.trim();
      if (slug && allowed.includes(slug)) present.add(slug);
    }
  }
  return allowed.filter((slug) => present.has(slug));
}

/** 只声明大类/未选小类的件数（含声明了名单外 slug 的件——名单外=未标注兜底） */
export function untaggedCountOf(entries: readonly CatalogEntry[], bucket: string): number {
  const allowed = SUBCATEGORY_SLUGS[bucket] ?? [];
  let n = 0;
  for (const entry of entries) {
    const hasKnown = (entry.categories ?? []).some((raw) => {
      const slug = raw?.trim();
      return !!slug && allowed.includes(slug);
    });
    if (!hasKnown) n++;
  }
  return n;
}

/** chip 过滤（`__none` = 未标注小类兜底）；再点同一 chip 由调用方清除（wasOn 语义） */
export function applySubcategory(entries: readonly CatalogEntry[], chip: string, bucket: string): CatalogEntry[] {
  if (chip === "__none") {
    const allowed = SUBCATEGORY_SLUGS[bucket] ?? [];
    return entries.filter(
      (e) => !(e.categories ?? []).some((raw) => !!raw?.trim() && allowed.includes(raw.trim())),
    );
  }
  return entries.filter((e) => (e.categories ?? []).some((raw) => raw?.trim() === chip));
}

/** rail 计数（空桶 = 0，rail 灰显保留；⛔ 空桶不产出瓷片） */
export function countByBucket(entries: readonly CatalogEntry[], railOrder: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const slug of railOrder) out.set(slug, 0);
  for (const bucket of groupByPrimaryCategory([...entries], [...railOrder])) {
    out.set(bucket.slug, bucket.entries.length);
  }
  return out;
}

/* ═══ 来源 / 作者 / 仓库展示 ═══ */

export type SourceKey = "official" | "third" | "local";

/** 来源身份（筛选与徽标同源）：官方目录条目/厂商认证 → official；本地条目 → local；其余 → third */
export function sourceKeyOf(entry: CatalogEntry): SourceKey {
  if (entry.sourceName === "local" || authorLabel(entry.author) === "本地") return "local";
  if (entry.official || entry.vendorId) return "official";
  return "third";
}

export function authorOf(entry: CatalogEntry): string {
  return authorLabel(entry.author) ?? "官方";
}

/** 仓库展示名（分组头用）：条目来源仓库 → 「官方 Plugin Store」 */
export function repoLabelOf(entry: CatalogEntry): string {
  return entry.sourceName || "官方 Plugin Store";
}

export function sizeLabelOf(entry: CatalogEntry): string | undefined {
  return formatSize(entry.size);
}

/* ═══ 安装状态筛选（只放搜索表达不了的可枚举事实） ═══ */

export interface InstallFilters {
  installed: boolean;
  uninstalled: boolean;
  update: boolean;
  official: boolean;
  third: boolean;
  local: boolean;
}

export const EMPTY_FILTERS: InstallFilters = {
  installed: false,
  uninstalled: false,
  update: false,
  official: false,
  third: false,
  local: false,
};

export function filterCount(f: InstallFilters): number {
  return Object.values(f).filter(Boolean).length;
}

export function applyInstallFilters(
  entries: readonly CatalogEntry[],
  f: InstallFilters,
  stateOf: (entry: CatalogEntry) => PackageState,
): CatalogEntry[] {
  if (filterCount(f) === 0) return [...entries];
  return entries.filter((e) => {
    const state = stateOf(e);
    const src = sourceKeyOf(e);
    if (f.installed && state !== "installed" && state !== "update") return false;
    if (f.uninstalled && state !== "install") return false;
    if (f.update && state !== "update") return false;
    if (f.official && src !== "official") return false;
    if (f.third && src !== "third") return false;
    if (f.local && src !== "local") return false;
    return true;
  });
}

/* ═══ 搜索（名 / ID / 标签；蓝图 v3.24） ═══ */

export function searchEntries(entries: readonly CatalogEntry[], query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter((e) => {
    const hay = `${e.name}${e.id}${(e.categories ?? []).join("")}`.toLowerCase();
    return hay.includes(q);
  });
}

/* ═══ 排序（含分组排序：同组挨一起、组间 A→Z） ═══ */

export type CatSort = "dl" | "upd" | "az" | "author" | "repo";

export type OrderedNode =
  | { kind: "group"; label: string; count: number }
  | { kind: "entry"; entry: CatalogEntry };

const byName = (a: CatalogEntry, b: CatalogEntry) => a.name.localeCompare(b.name, "zh");

function byDl(dlOf: (e: CatalogEntry) => number | undefined) {
  return (a: CatalogEntry, b: CatalogEntry) => {
    const da = dlOf(a);
    const db = dlOf(b);
    if (da === undefined && db === undefined) return byName(a, b);
    if (da === undefined) return 1; // 无计数排后（诚实：拿不到就不参与名次）
    if (db === undefined) return -1;
    return db - da || byName(a, b);
  };
}

/**
 * 排序 + 分组（纯函数）。
 * - `dl`：下载数降序（无计数排后、同名次按名）；`upd`：publishedAt 降序；
 * - `az`：名称（zh collation）；`author`/`repo`：**分组排序**（组间 A→Z、组内下载降序），
 *   返回带 `{kind:"group"}` 标记的扁平序列（渲染器只按序出组头/卡）。
 */
export function orderEntries(
  entries: readonly CatalogEntry[],
  sort: CatSort,
  dlOf: (e: CatalogEntry) => number | undefined,
): OrderedNode[] {
  const list = [...entries];
  if (sort === "az") return list.sort(byName).map((entry) => ({ kind: "entry", entry }));
  if (sort === "upd") {
    list.sort(
      (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || byDl(dlOf)(a, b),
    );
    return list.map((entry) => ({ kind: "entry", entry }));
  }
  if (sort === "author" || sort === "repo") {
    const keyOf = sort === "author" ? authorOf : repoLabelOf;
    const groups = new Map<string, CatalogEntry[]>();
    for (const entry of list) {
      const key = keyOf(entry);
      const arr = groups.get(key);
      if (arr) arr.push(entry);
      else groups.set(key, [entry]);
    }
    const out: OrderedNode[] = [];
    for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b, "zh"))) {
      const group = groups.get(key)!;
      out.push({ kind: "group", label: key, count: group.length });
      for (const entry of group.sort(byDl(dlOf))) out.push({ kind: "entry", entry });
    }
    return out;
  }
  return list.sort(byDl(dlOf)).map((entry) => ({ kind: "entry", entry }));
}

/* ═══ 榜单（计算位：全源合并；来源随行） ═══ */

/** 按下载数排序取前 N（无计数排后；`all` = 完整榜单） */
export function rankEntries(
  entries: readonly CatalogEntry[],
  dlOf: (e: CatalogEntry) => number | undefined,
  top?: number,
): CatalogEntry[] {
  const list = [...entries].sort(byDl(dlOf));
  return typeof top === "number" ? list.slice(0, top) : list;
}

/* ═══ 分类归桶的再导出（视图只从这里拿，⛔ 各自 import 底层两份） ═══ */
export { primaryCategoryOf };
