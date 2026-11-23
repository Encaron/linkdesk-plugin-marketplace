/**
 * parse — marketplace.json 文本 → 内存对象（最小结构校验 + 逐条白名单归一 + 声明警告）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketCatalog.ts` 原样搬出，零行为变更。
 *
 * Marketplace-Store v2（R4-2.1）：根级 `sources[]` / `collections[]` / `categoryRail` 进解析面
 * （06 §二·3——全部可选，旧目录天然合法）；条目白名单外的**声明问题**不再静默（06 §三：
 * 未知分类 / 视频项越位各记一条警告，`ParseResult.warnings` 交来源页展示）。
 */

import { isKnownPrimaryCategory, validateEntryCategories } from "./categories";
import { parseLocales } from "../i18nText";
import { pluginRepoUrl } from "./sourceUrl";
import type {
  CatalogEntry,
  CatalogScreenshot,
  CatalogWarning,
  CategoryRailDecl,
  CollectionDecl,
  ParseResult,
  SourceLink,
} from "./types";

/** parse marketplace.json 文本——最小结构校验（plugins 数组存在 + 元素有 id） */
export function parseCatalog(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  if (typeof json !== "object" || json === null) return { ok: false, reason: "not-object" };
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj.plugins)) return { ok: false, reason: "no-plugins-array" };

  const warnings: CatalogWarning[] = [];
  const plugins = obj.plugins
    .map((raw) => normalizeEntry(raw, warnings))
    .filter((p): p is CatalogEntry => p !== null);
  const categoryRail = parseCategoryRail(obj.categoryRail);
  if (categoryRail) warnings.push(...railWarningsOf(categoryRail));
  const { collections, collectionRefs } = parseCollections(obj.collections, warnings);

  return {
    ok: true,
    catalog: {
      version: typeof obj.version === "string" ? obj.version : undefined,
      updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : undefined,
      plugins,
      sources: parseSourceLinks(obj.sources, warnings),
      collections,
      collectionRefs,
      categoryRail,
    },
    warnings,
  };
}

/** 单条归一——补 author/iconSource 形态缺省；无 id/name/version 者丢弃（不崩其余） */
function normalizeEntry(raw: unknown, warnings: CatalogWarning[]): CatalogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as CatalogEntry;
  if (typeof r.id !== "string" || !r.id || typeof r.name !== "string" || typeof r.version !== "string") {
    return null;
  }
  // 封闭名单体检（04 §5.1）——名单外记警告、原值照留（归桶由 categories.primaryCategoryOf 兜）
  warnings.push(...validateEntryCategories(r));
  const normalized: CatalogEntry = {
    id: r.id,
    name: r.name,
    locales: parseLocales((r as { locales?: unknown }).locales),
    version: r.version,
    description: r.description,
    author: r.author,
    icon: r.icon,
    iconSource: r.iconSource,
    // E6#106：身份图（Type-2）——漏了这两行 = 目录带着身份图进来、被白名单静默丢掉，
    // 市场行退回 icon（图标栏插件 = Type-1 剪影），「同一插件两张脸」原样复发
    marketIcon: r.marketIcon,
    marketIconSource: r.marketIconSource,
    category: r.category,
    categories: Array.isArray(r.categories)
      ? r.categories.filter((c): c is string => typeof c === "string")
      : undefined,
    // Marketplace-Store v2（R4-0.2/0.4）：作者聚合键＋定价声明进白名单——漏行 = 目录带着键进来被静默丢
    // （E6#106/E6#77 乙同类坑）；三方对账腿②（catalogV2Reconcile.test.ts）钉住本白名单 ↔ SDK schema
    authorId: r.authorId,
    pricing: r.pricing,
    downloadUrl: r.downloadUrl,
    size: r.size,
    publishedAt: r.publishedAt,
    minAppVersion: r.minAppVersion,
    versions: Array.isArray(r.versions) ? r.versions : undefined,
    readmeUrl: r.readmeUrl,
    readmeLocales: r.readmeLocales && typeof r.readmeLocales === "object" && !Array.isArray(r.readmeLocales)
      ? Object.fromEntries(Object.entries(r.readmeLocales).filter(([, v]) => typeof v === "string" && v))
      : undefined,
    screenshots: normalizeScreenshots(r.screenshots, r.id, warnings),
    cover: normalizeMediaUrl(r.cover, "cover", r.id, warnings),
    license: r.license,
    repository: r.repository, // E6#77 乙：作者声明的插件主页（本 whitelist 漏字段 = 静默丢，务必同步）
    sourceName: undefined, // 合并注入——parse 阶段不填
    official: undefined, // 同上：来源身份是合并时语义
  };
  /* R4-3.18（05 §02 抓取/派生型「网络源必有」）——缺 = 目录缺字段，详情页不画行、来源页记声明提示 */
  warnings.push(...missingFetchedFieldWarnings(normalized));
  return normalized;
}

/** 抓取/派生型字段体检（05 §02）——只查目录里判得出的三类：
 *  - `publishedAt`（首次发布/更新时间的数据源，versions[] 里任一有也算有）；
 *  - `author`（作者行；两种形态 string / {name}）；
 *  - `repo`（仓库/问题两行的 URL 是否推得出，判据复用 `pluginRepoUrl`）。
 *  ⛔ 「下载」是运行时 GitHub 计数（downloadCounts），不在目录里，缺不算目录缺陷。 */
function missingFetchedFieldWarnings(e: CatalogEntry): CatalogWarning[] {
  const out: CatalogWarning[] = [];
  const hasPublished =
    (typeof e.publishedAt === "string" && e.publishedAt.trim().length > 0) ||
    (e.versions?.some((v) => typeof v?.publishedAt === "string" && v.publishedAt.trim().length > 0) ?? false);
  if (!hasPublished) out.push({ code: "missing-entry-field", entryId: e.id, detail: "publishedAt" });
  const authorName = typeof e.author === "string" ? e.author : e.author?.name;
  if (!authorName || !authorName.trim()) {
    out.push({ code: "missing-entry-field", entryId: e.id, detail: "author" });
  }
  if (!pluginRepoUrl(e)) out.push({ code: "missing-entry-field", entryId: e.id, detail: "repo" });
  return out;
}

/** 画廊媒体归一（06 §二·2 契约）：string = 图片；视频对象**至多 1 段且必须排第一**（封面视频）。
 *  多段/越位的视频项**丢弃并记警告**（⛔ 不静默降级成图）；字符串原样留（旧数据可读）。
 *  R4 媒体丰富度（A6）：非 https 绝对 URL 原样保留但记声明警告——旧目录可读、渲染层丢帧兜底。 */
function normalizeScreenshots(
  raw: unknown,
  entryId: string,
  warnings: CatalogWarning[],
): CatalogScreenshot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CatalogScreenshot[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item === "string") {
      warnInvalidMediaUrl(item, `screenshots[${i}]`, entryId, warnings);
      out.push(item);
      continue;
    }
    const video = item as { type?: unknown; url?: unknown; poster?: unknown } | null;
    const isVideo = !!video && video.type === "video" && typeof video.url === "string";
    if (!isVideo) continue;
    if (i !== 0) {
      warnings.push({ code: "screenshot-video-restricted", entryId, detail: `video@${i}` });
      continue;
    }
    warnInvalidMediaUrl(video.url as string, `screenshots[0].url`, entryId, warnings);
    if (typeof video.poster === "string") {
      warnInvalidMediaUrl(video.poster, `screenshots[0].poster`, entryId, warnings);
    }
    out.push({
      type: "video",
      url: video.url as string,
      poster: typeof video.poster === "string" ? video.poster : undefined,
    });
  }
  return out;
}

/** 媒体 URL 必须是 https 绝对地址（与 publish 校验同一期望；相对路径未装用户必 404） */
const HTTPS_MEDIA_URL = /^https:\/\/[^\s]+$/i;

function warnInvalidMediaUrl(
  value: string,
  field: string,
  entryId: string,
  warnings: CatalogWarning[],
): void {
  const v = value.trim();
  if (!v || HTTPS_MEDIA_URL.test(v)) return;
  warnings.push({ code: "screenshot-url-invalid", entryId, detail: `${field} = ${value}` });
}

/** 条目级封面（cover）——同一媒体 URL 纪律；非字符串直接丢（schema 在作者侧拦） */
function normalizeMediaUrl(
  raw: unknown,
  field: string,
  entryId: string,
  warnings: CatalogWarning[],
): string | undefined {
  if (typeof raw !== "string") return undefined;
  warnInvalidMediaUrl(raw, field, entryId, warnings);
  return raw;
}

/** 根级已审核源清单（schema 要求 url/authorId/addedAt；不合形的一行跳过并记警告） */
function parseSourceLinks(raw: unknown, warnings: CatalogWarning[]): SourceLink[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SourceLink[] = [];
  for (const item of raw) {
    const r = item as Partial<SourceLink> | null;
    if (!r || typeof r.url !== "string" || typeof r.authorId !== "string" || typeof r.addedAt !== "string") {
      warnings.push({ code: "invalid-source-link", detail: JSON.stringify(item)?.slice(0, 120) });
      continue;
    }
    out.push({ url: r.url, authorId: r.authorId, addedAt: r.addedAt });
  }
  return out;
}

/** 单条合集声明解析（R4-4.5 抽出——inline 数组与 collections/<id>.json 文件两处共用，⛔ 不开第二份实现）。
 *  id/title/items 三者齐才收；`layout` 封闭枚举外丢弃字段；形状不合格 → null（警告由调用方记）。 */
export function parseCollectionDecl(raw: unknown): CollectionDecl | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<CollectionDecl> | null;
  if (!r || typeof r.id !== "string" || typeof r.title !== "string" || !Array.isArray(r.items)) return null;
  const layouts = new Set(["banner", "strip", "duo", "grid", "mega", "small", "split", "wall"]);
  return {
    id: r.id,
    title: r.title,
    locales: parseLocales((r as { locales?: unknown }).locales),
    subtitle: typeof r.subtitle === "string" ? r.subtitle : undefined,
    hint: typeof r.hint === "string" ? r.hint : undefined,
    // 08 §三·v3.57 U4 / 09 §二：合集级 glow 与 more 两处都认（白名单漏行 = 目录带着声明进来被静默丢）
    glow: r.glow === false ? false : undefined,
    more: normalizeMoreLink(r.more),
    cover: typeof r.cover === "string" ? r.cover : undefined,
    layout: typeof r.layout === "string" && layouts.has(r.layout) ? r.layout : undefined,
    items: r.items.filter((id): id is string => typeof id === "string"),
    order: typeof r.order === "number" ? r.order : undefined,
  };
}

/** 根级合集声明（06 §二·3）——R4-4.5 两读：对象 = inline 声明；字符串 = 文件夹引用（进 collectionRefs） */
function parseCollections(
  raw: unknown,
  warnings: CatalogWarning[],
): { collections: CollectionDecl[] | undefined; collectionRefs: string[] | undefined } {
  if (!Array.isArray(raw)) return { collections: undefined, collectionRefs: undefined };
  const decls: CollectionDecl[] = [];
  const refs: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      if (/^[a-z][a-z0-9-]*$/.test(item)) refs.push(item);
      else warnings.push({ code: "invalid-collection", detail: item });
      continue;
    }
    const decl = parseCollectionDecl(item);
    if (!decl) {
      warnings.push({ code: "invalid-collection", detail: typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : undefined });
      continue;
    }
    decls.push(decl);
  }
  return {
    collections: decls.length > 0 ? decls : undefined,
    collectionRefs: refs.length > 0 ? refs : undefined,
  };
}

/** 合集级跳转字（09 §二）——label/target 都是字符串才收；target 封闭集合在渲染期校验 */
function normalizeMoreLink(raw: unknown): { label?: string; target?: string } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as { label?: unknown; target?: unknown };
  const label = typeof r.label === "string" && r.label.trim() ? r.label : undefined;
  const target = typeof r.target === "string" && r.target.trim() ? r.target : undefined;
  return label || target ? { ...(label ? { label } : {}), ...(target ? { target } : {}) } : undefined;
}

/** 根级 rail 顺序声明（06 §二·3）——形状守卫；名单校验在 railWarningsOf */
function parseCategoryRail(raw: unknown): CategoryRailDecl | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as { order?: unknown; icons?: unknown };
  if (!Array.isArray(r.order)) return undefined;
  const order: string[] = [];
  for (const slug of r.order) {
    if (typeof slug !== "string") continue;
    const s = slug.trim();
    if (s) order.push(s);
  }
  const icons: Record<string, string> = {};
  if (typeof r.icons === "object" && r.icons !== null) {
    for (const [k, v] of Object.entries(r.icons as Record<string, unknown>)) {
      if (typeof v === "string") icons[k] = v;
    }
  }
  return { order, icons: Object.keys(icons).length > 0 ? icons : undefined };
}

/** rail 声明里未注册 slug 的警告（04 §5.1：⛔ 静默吞；`other` 是兜底桶不是声明值，不警告） */
function railWarningsOf(decl: CategoryRailDecl): CatalogWarning[] {
  const out: CatalogWarning[] = [];
  for (const slug of decl.order) {
    if (slug !== "other" && !isKnownPrimaryCategory(slug)) {
      out.push({ code: "unknown-rail-category", detail: slug });
    }
  }
  return out;
}
