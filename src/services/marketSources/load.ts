/**
 * load — **主编排**：拉全部源 → 三源合并 → 定主状态（ok / corrupt / offline）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketSources.ts` 原样搬出，零行为变更。
 *
 * Marketplace-Store v2（R4-2.1/2.2）：
 *   ① 三源合并序 = **官方 → 收录（官方目录根 `sources[]`）→ 用户配置**；同 id semver 高者胜、
 *      平手先到者胜（数组序即优先级）——收录源只读一层（⛔ 不递归，收录是官方审核，不是链式转发）。
 *   ② `vendors.json`（官方目录仓根）参与「官方 ✓」判定链：authorId 命中 ⇒ 条目带 `vendorId`，
 *      UI 零再判（09 §一·补2）。
 *   ③ 根级 `collections[]` / `categoryRail` 随目录交付（06 §七：旧目录无声明 ⇒ 空数组/规范序）。
 *   ④ K5 回落链：非官方源拉不到有效目录 → 同目录 `plugin.json` 合成 1 条 → 都没有 = 该源失败
 *      （`missing-manifest`，UI 给模板链接）。
 *   ⑤ 声明警告（未知分类/视频越位/坏来源行…）随结果交付，⛔ 不静默吞。
 */

import {
  OFFICIAL_SOURCE_URL,
  buildCategoryRailOrder,
  catalogSiblingUrl,
  mergeCatalogsWithReceipt,
  normalizeSourceUrl,
  parseCatalog,
  parseVendors,
  sourceNameOfUrl,
  synthesizeEntryFromManifest,
  vendorIdSetOf,
  withVendorIds,
} from "../marketCatalog";
import type {
  CatalogEntry,
  CatalogWarning,
  CollectionDecl,
  MarketplaceCatalog,
  SourceLink,
} from "../marketCatalog";
import { urlSourceKey } from "@linkdesk/ui";
import { fetchOne, fetchSidecar } from "./fetch";
import { removeCache } from "./io";
import { getSourceUrls } from "./sourceConfig";
import type { CatalogLoadResult, CatalogLoadState } from "./types";

/** 一个已交付的源（含解析出的根级声明） */
interface Delivered {
  sourceName: string;
  sourceUrl: string;
  official: boolean;
  entries: CatalogEntry[];
  catalog: MarketplaceCatalog;
  warnings: CatalogWarning[];
  /** 该源走了 stale 缓存兜底（K5 合成路径不算——它没有「旧目录」概念） */
  staleFallback: boolean;
}

/** 拉取全部源并合并——force=true 跳过 5min fresh 缓存（手动刷新用） */
export async function loadCatalog(force = false): Promise<CatalogLoadResult> {
  const urls = await getSourceUrls(); // [官方, ...用户源]（官方恒在下标 0）
  const firstWave = await Promise.all(urls.map((url) => fetchOne(url, force)));

  // 收录源（官方目录根 sources[]）——只有官方源的声明可信；官方不可达 = 本趟不收录（不猜）
  const officialParsed = !("reason" in firstWave[0]) ? parseCatalog(firstWave[0].text) : null;
  const collectedUrls = officialParsed?.ok ? collectSourceUrls(officialParsed.catalog.sources, urls) : [];

  const collectedFetched = await Promise.all(collectedUrls.map((url) => fetchOne(url, force)));

  // 拉取结果按「官方 → 收录 → 用户」装槽（合并序 = 数组序；下标同时保 errors 输出稳定）
  const attempts: Array<{ url: string; official: boolean; result: (typeof firstWave)[number] }> = [
    ...urls.map((url, i) => ({ url, official: i === 0, result: firstWave[i] })),
    ...collectedUrls.map((url, i) => ({ url, official: false, result: collectedFetched[i] })),
  ];

  const delivered = await Promise.all(attempts.map((a) => deliverOne(a.url, a.official, a.result, force)));

  let usedStale = false;
  const errors: Array<{ sourceName: string; reason: string }> = [];
  for (let i = 0; i < attempts.length; i++) {
    const d = delivered[i];
    if ("reason" in d) {
      errors.push({ sourceName: attempts[i].result.sourceName, reason: d.reason });
      continue;
    }
    usedStale = usedStale || d.staleFallback;
  }

  // 合并序：官方（urls[0]）→ 收录 → 用户（urls[1..]）
  const ordered: Delivered[] = [
    delivered[0],
    ...delivered.slice(urls.length),
    ...delivered.slice(1, urls.length),
  ]
    .filter((d): d is Delivered => !("reason" in d));
  const { entries: merged, deduped } = mergeCatalogsWithReceipt(
    ordered.map((d) => ({ sourceName: d.sourceName, sourceUrl: d.sourceUrl, official: d.official, entries: d.entries })),
  );
  // vendors.json 只在**有条目声明 authorId**时才拉（无 authorId ⇒ 任何条目都不可能命中注册表；
  // v1 旧目录天然零请求——双向兼容纪律的落地，不是省一次请求的小聪明）
  const vendorsUrl = merged.some((e) => !!e.authorId) ? catalogSiblingUrl(OFFICIAL_SOURCE_URL, "vendors.json") : null;
  const vendorsRes = vendorsUrl ? await fetchSidecar(vendorsUrl, force) : null;
  const vendorIds = vendorsRes?.ok ? vendorIdSetOf(parseVendors(vendorsRes.text)) : new Set<string>();
  const entries = withVendorIds(merged, vendorIds);

  let state: CatalogLoadState = "ok";
  if (ordered.length === 0) {
    // 全源零交付（无一源 parse 通过/有缓存可兜）：#30f 判空态——有 parse 失败（源可达但在传坏数据）→
    // corrupt；否则不可达 → offline。判据 = 交付源数非合并条数：源连上但目录为空（如官方仓库建好未上架）
    // 是合法 ok 空态，不能因 entries 空就误降级成 offline（实证 bug：探索页把「连上但空」显示成「无法加载」）
    const hasParse = errors.some((e) => e.reason === "parse");
    state = hasParse ? "corrupt" : "offline";
  }

  const attemptedUrls = [...urls.slice(0, 1), ...collectedUrls, ...urls.slice(1)];
  return {
    entries,
    state,
    errors,
    sourceNames: attemptedUrls.map(sourceNameOfUrl),
    usedStale,
    fetchedAt: Date.now(),
    railOrder: buildCategoryRailOrder(firstWithRail(ordered)?.catalog.categoryRail),
    collections: mergeCollections(ordered),
    warnings: ordered.flatMap((d) => d.warnings.map((w) => ({ ...w, source: d.sourceName }))),
    deduped,
  };
}

/** 手动刷新目录——清缓存 + 强制重拉全部源 */
export async function forceRefreshCatalog(): Promise<CatalogLoadResult> {
  for (const url of await getSourceUrls()) removeCache(url);
  return loadCatalog(true);
}

/** 单源交付判定：目录 parse 通过 ⇒ 交付；否则走 K5 回落链（plugin.json 合成 1 条）。
 *  失败原因：无可回落的清单 = `missing-manifest`（UI 给模板链接）；其余保留原 network/parse。 */
async function deliverOne(
  url: string,
  official: boolean,
  result: Awaited<ReturnType<typeof fetchOne>>,
  force: boolean,
): Promise<Delivered | { reason: string; staleFallback?: boolean }> {
  const sourceName = sourceNameOfUrl(url);
  if (!("reason" in result)) {
    const parsed = parseCatalog(result.text);
    if (parsed.ok) {
      return {
        sourceName,
        sourceUrl: url,
        official,
        entries: parsed.catalog.plugins,
        catalog: parsed.catalog,
        warnings: parsed.warnings,
        staleFallback: result.staleFallback,
      };
    }
  }
  // K5：仓库根无有效目录 → 同目录 plugin.json 合成 1 条。
  // 🔴 只对**非官方源**生效：官方默认源是目录仓（不是插件仓），其失败语义就是 offline/corrupt
  //    ——拿它的 plugin.json 兜底会把「目录挂了」误报成「这不是市场源」，措辞更差。
  if (!official) {
    const fallback = await fallbackFromManifest(url, force);
    if (fallback && "entries" in fallback) {
      return {
        sourceName,
        sourceUrl: url,
        official,
        entries: fallback.entries,
        catalog: { plugins: fallback.entries },
        warnings: [],
        staleFallback: false,
      };
    }
    if (fallback && "reason" in fallback) return { reason: fallback.reason };
  }
  return { reason: "reason" in result ? result.reason : "parse" };
}

/** K5 回落链：同目录 plugin.json（只读一次；坏清单 = 回落失败，交原失败原因） */
async function fallbackFromManifest(
  url: string,
  force: boolean,
): Promise<{ entries: CatalogEntry[] } | { reason: "missing-manifest" } | null> {
  const manifestUrl = catalogSiblingUrl(url, "plugin.json");
  if (!manifestUrl) return null;
  const res = await fetchSidecar(manifestUrl, force);
  if (!res.ok) return res.reason === "missing" ? { reason: "missing-manifest" } : null;
  const entry = synthesizeEntryFromManifest(res.text, url);
  return entry ? { entries: [entry] } : null;
}

/** 收录源 URL 归一 + 与已拉源按身份去重（官方自引用/用户重复添加都不二次拉取） */
function collectSourceUrls(links: SourceLink[] | undefined, existingUrls: string[]): string[] {
  if (!links || links.length === 0) return [];
  const seen = new Set<string>();
  for (const url of existingUrls) {
    const key = urlSourceKey(url);
    if (key) seen.add(key);
  }
  const out: string[] = [];
  for (const link of links) {
    const norm = normalizeSourceUrl(link.url);
    const key = norm ? urlSourceKey(norm) : null;
    if (!norm || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

/** 合集声明合并——同 id 先到者胜（官方 → 收录 → 用户）；无声明 = 空数组 */
function mergeCollections(sources: Delivered[]): CollectionDecl[] {
  const byId = new Map<string, CollectionDecl>();
  for (const d of sources) {
    for (const c of d.catalog.collections ?? []) if (!byId.has(c.id)) byId.set(c.id, c);
  }
  return [...byId.values()];
}

/** rail 声明取第一个声明了它的源（官方优先——合并序已保证） */
function firstWithRail(sources: Delivered[]): Delivered | undefined {
  return sources.find((d) => !!d.catalog.categoryRail);
}
