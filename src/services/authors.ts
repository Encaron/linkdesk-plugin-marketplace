/**
 * authors — 作者域的数据面（R4-3.8–3.11）：`authors/<authorId>.json` 的**白名单解析**＋
 * **authorId 聚合**＋声明警告＋懒加载缓存（09 §二/§三 `services/authors.ts`）。
 *
 * 为什么按 authorId 懒加载（09 §十）：目录格式 v2 **没有作者索引文件**——作者块住各源根
 * 同目录的 `authors/<id>.json`，只有「谁需要这张作者卡/这家店」时才知道要拉哪个 id。
 * 候选源 = 官方源 ＋ 配置里 authorId 命中该作者的启用 remote 源（多仓作者每仓可放同一份；
 * 同 id 跨源聚合 repos，⛔ 无中心注册）。
 *
 * 纪律：
 *   - **白名单归一**（06 §三）：白名单外字段静默丢弃；坏 JSON / 缺 authorId = 整块跳过（不崩）；
 *   - **声明问题不静默吞**（09 §二）：重复大屏 / 未知板块 / 引用不存在的合集 → `warnings[]`
 *     （来源页作者行「N 条声明提示」的数据源）；
 *   - **只消费统一池**（09 §三）：插件集合永远来自 catalog entries（按 sourceName 归仓），
 *     ⛔ 作者块里不认 plugins[]（那是服务端不可信数据）；
 *   - 侧车拉取复用 `marketSources/fetch.fetchSidecar`（5min 缓存/stale 兜底与目录同寿）；
 *   - 纯解析/聚合与 IO 分离：本文件导出的 normalize/aggregate 是纯函数（vitest 直测），
 *     拉取只在 `loadAuthorDomains` 里。
 */

import { useCallback, useEffect, useState } from "react";
import { urlSourceKey } from "@linkdesk/ui";
import {
  OFFICIAL_SOURCE_URL,
  catalogSiblingUrl,
  normalizeSourceUrl,
  sourceNameOfUrl,
  type CatalogEntry,
  type CollectionDecl,
} from "./marketCatalog";
import { fetchSidecar } from "./marketSources/fetch";
import { readSourceRecords, type SourceRecord } from "./marketSources";
import { getCatalogResult } from "./marketplaceShared/catalogStore";
import { realmSlot } from "./realmSlot";

/* ═══ 作者块 schema（09 §二；键名与 09 逐字一致） ═══ */

export type AuthorSectionType = "hero" | "collection" | "grid" | "rank";

export interface AuthorHeroSlide {
  plugin?: string;
  tag?: string;
}

/** 板块跳转字——label 作者自定；target 是封闭集合（视图侧校验，⛔ 任意 URL） */
export interface AuthorMoreDecl {
  label?: string;
  target?: string;
}

export interface AuthorSectionDecl {
  type: AuthorSectionType;
  title?: string;
  hint?: string;
  /** 板块辉光开关：缺省开；false = 整块回落中性阴影（⛔ 自定色） */
  glow?: boolean;
  slides?: AuthorHeroSlide[];
  /** 旧单张大屏形态兼容（slides 缺省时退它） */
  plugin?: string;
  tag?: string;
  collection?: string;
  /** 板块级卡片原型（09 schema homepageSection.layout：small/mega/duo——整块统一，⛔ 卡级混排） */
  layout?: "small" | "mega" | "duo";
  more?: AuthorMoreDecl;
  top?: number;
  /** 榜单作用域：缺省全源合并，"self" = 只算店主自己的插件 */
  scope?: "self";
}

export interface AuthorHomepageDecl {
  storeTitle?: string;
  sections: AuthorSectionDecl[];
}

export interface AuthorRepoDecl {
  id: string;
  name: string;
  intro?: string;
  image?: string;
  sourceUrl?: string;
  storeTitle?: string;
  homepage?: AuthorHomepageDecl;
}

export interface AuthorBlock {
  authorId: string;
  name?: string;
  avatar?: string;
  introImage?: string;
  intro?: string;
  storeTitle?: string;
  publicKey?: string;
  repos: AuthorRepoDecl[];
  /** 块级 homepage（09 schema）；仓级缺省时回落它 */
  homepage?: AuthorHomepageDecl;
}

export type AuthorWarningCode = "duplicate-hero" | "unknown-section" | "missing-collection";

export interface AuthorWarning {
  code: AuthorWarningCode;
  repoId?: string;
  detail?: string;
}

/* ═══ 解析（纯函数） ═══ */

const SECTION_TYPES: ReadonlySet<string> = new Set(["hero", "collection", "grid", "rank"]);

function str(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
}

function parseSlides(raw: unknown): AuthorHeroSlide[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: AuthorHeroSlide[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const plugin = str(r.plugin);
    const tag = str(r.tag);
    if (!plugin && !tag) continue;
    out.push({ ...(plugin ? { plugin } : {}), ...(tag ? { tag } : {}) });
  }
  return out;
}

function parseMore(raw: unknown): AuthorMoreDecl | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const label = str(r.label);
  const target = str(r.target);
  if (!label && !target) return undefined;
  return { ...(label ? { label } : {}), ...(target ? { target } : {}) };
}

function parseSections(
  raw: unknown,
  repoId: string | undefined,
  warnings: AuthorWarning[],
): AuthorSectionDecl[] {
  if (!Array.isArray(raw)) return [];
  const out: AuthorSectionDecl[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const type = str(r.type);
    if (!type || !SECTION_TYPES.has(type)) {
      warnings.push({ code: "unknown-section", repoId, detail: type ?? "" });
      continue;
    }
    const section: AuthorSectionDecl = { type: type as AuthorSectionType };
    const title = str(r.title);
    const hint = str(r.hint);
    if (title) section.title = title;
    if (hint) section.hint = hint;
    if (r.glow === false) section.glow = false;
    if (type === "hero") {
      const slides = parseSlides(r.slides);
      if (slides?.length) section.slides = slides;
      const plugin = str(r.plugin);
      const tag = str(r.tag);
      if (plugin) section.plugin = plugin;
      if (tag) section.tag = tag;
    }
    if (type === "collection") {
      const collection = str(r.collection);
      if (!collection) {
        // 缺合集键 = 这条板块无从渲染（真「引用不存在的合集」在聚合期按全局合集表再判一次）
        warnings.push({ code: "missing-collection", repoId, detail: "" });
        continue;
      }
      section.collection = collection;
    }
    if (r.layout === "small" || r.layout === "mega" || r.layout === "duo") {
      section.layout = r.layout;
    }
    if (type === "rank") {
      if (typeof r.top === "number" && Number.isFinite(r.top) && r.top > 0) {
        section.top = Math.floor(r.top);
      }
      if (r.scope === "self") section.scope = "self";
    }
    const more = parseMore(r.more);
    if (more) section.more = more;
    out.push(section);
  }
  return out;
}

function parseHomepage(
  raw: unknown,
  repoId: string | undefined,
  warnings: AuthorWarning[],
): AuthorHomepageDecl | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.sections)) return undefined;
  const sections = parseSections(r.sections, repoId, warnings);
  const storeTitle = str(r.storeTitle);
  return { ...(storeTitle ? { storeTitle } : {}), sections };
}

function parseRepo(raw: unknown, warnings: AuthorWarning[]): AuthorRepoDecl | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const name = str(r.name);
  if (!id || !name) return null;
  const repo: AuthorRepoDecl = { id, name };
  const intro = str(r.intro);
  const image = str(r.image);
  const sourceUrl = str(r.sourceUrl);
  const storeTitle = str(r.storeTitle);
  if (intro) repo.intro = intro;
  if (image) repo.image = image;
  if (sourceUrl) repo.sourceUrl = sourceUrl;
  if (storeTitle) repo.storeTitle = storeTitle;
  const homepage = parseHomepage(r.homepage, id, warnings);
  if (homepage) repo.homepage = homepage;
  return repo;
}

export type AuthorParseResult =
  | { ok: true; block: AuthorBlock; warnings: AuthorWarning[] }
  | { ok: false; reason: "invalid-json" | "not-object" | "no-author-id" };

/** 作者块文本 → 内存对象（白名单归一；坏块整块跳过，⛔ 不崩其余） */
export function parseAuthorBlock(text: string): AuthorParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, reason: "not-object" };
  }
  const r = json as Record<string, unknown>;
  const authorId = str(r.authorId);
  if (!authorId) return { ok: false, reason: "no-author-id" };

  const warnings: AuthorWarning[] = [];
  const block: AuthorBlock = { authorId, repos: [] };
  const name = str(r.name);
  const avatar = str(r.avatar);
  const introImage = str(r.introImage);
  const intro = str(r.intro);
  const storeTitle = str(r.storeTitle);
  const publicKey = str(r.publicKey);
  if (name) block.name = name;
  if (avatar) block.avatar = avatar;
  if (introImage) block.introImage = introImage;
  if (intro) block.intro = intro;
  if (storeTitle) block.storeTitle = storeTitle;
  if (publicKey) block.publicKey = publicKey;

  if (Array.isArray(r.repos)) {
    for (const rawRepo of r.repos) {
      const repo = parseRepo(rawRepo, warnings);
      if (repo) block.repos.push(repo);
    }
  }
  const homepage = parseHomepage(r.homepage, undefined, warnings);
  if (homepage) block.homepage = homepage;
  return { ok: true, block, warnings };
}

/* ═══ 聚合（纯函数） ═══ */

export interface AuthorRepoView extends AuthorRepoDecl {
  /** 该仓的插件（来自统一池，按 sourceName 归仓；⛔ 作者块里的 plugins[] 不认） */
  plugins: CatalogEntry[];
  /** 生效的 homepage（仓级 → 块级；都没有 = undefined ⇒ 渲染器走缺省骨架） */
  homepage?: AuthorHomepageDecl;
  /** 生效的店名（仓级 → 仓 homepage → 块级） */
  storeTitle?: string;
}

export interface AuthorDomain {
  authorId: string;
  name: string;
  avatar?: string;
  intro?: string;
  introImage?: string;
  storeTitle?: string;
  repos: AuthorRepoView[];
  warnings: AuthorWarning[];
  /** 发布者认证：该作者名下任一条目 vendorId 命中（vendors.json 注册表，09 §一·补2） */
  official: boolean;
}

/** 声明警告：重复大屏 / 引用不存在的合集（未知板块与缺 collection 键在解析期就记了） */
export function collectAuthorWarnings(
  sections: readonly AuthorSectionDecl[],
  repoId: string | undefined,
  collectionIds: ReadonlySet<string>,
): AuthorWarning[] {
  const out: AuthorWarning[] = [];
  const heroes = sections.filter((s) => s.type === "hero").length;
  if (heroes > 1) out.push({ code: "duplicate-hero", repoId, detail: String(heroes) });
  for (const s of sections) {
    if (s.type === "collection" && s.collection && !collectionIds.has(s.collection)) {
      out.push({ code: "missing-collection", repoId, detail: s.collection });
    }
  }
  return out;
}

/** 仓的插件归属：sourceName（owner/repo）由合并期注入——同源链路，⛔ 视图重判 */
function sourceNameOfRecord(rec: SourceRecord): string | undefined {
  if (rec.kind !== "remote" || !rec.url) return undefined;
  const norm = normalizeSourceUrl(rec.url) ?? rec.url;
  return sourceNameOfUrl(norm);
}

function matchesRepo(rec: SourceRecord, repo: AuthorRepoDecl, authorId: string): boolean {
  if (rec.kind !== "remote") return false;
  // ① 仓声明了 sourceUrl：按 URL 身份认（作者声明优先——owner 与 authorId 可以不同名）
  if (repo.sourceUrl) {
    const want = urlSourceKey(normalizeSourceUrl(repo.sourceUrl) ?? repo.sourceUrl);
    const have = rec.url ? urlSourceKey(normalizeSourceUrl(rec.url) ?? rec.url) : null;
    if (want !== null && have !== null) return want === have;
  }
  // ② 退「同作者 + 同仓 id」
  return rec.authorId.toLowerCase() === authorId.toLowerCase() && rec.repoId === repo.id;
}

/** 源记录是否「属于」该作者：记录 authorId 命中，**或**该源的目录条目声明了该作者的 authorId
 *  （record.authorId 由 GitHub owner 推出，作者身份键可以不同名——09 §二 authorId 是正典） */
function recordDeclaresAuthor(
  rec: SourceRecord,
  authorId: string,
  entries: readonly CatalogEntry[],
): boolean {
  if (rec.authorId.toLowerCase() === authorId.toLowerCase()) return true;
  const sourceName = sourceNameOfRecord(rec);
  return (
    !!sourceName &&
    entries.some(
      (e) => e.authorId?.toLowerCase() === authorId.toLowerCase() && e.sourceName === sourceName,
    )
  );
}

function pluginsForRepo(
  repo: AuthorRepoDecl,
  authorId: string,
  records: readonly SourceRecord[],
  entries: readonly CatalogEntry[],
  officialBlock: boolean,
): CatalogEntry[] {
  const rec = records.find((r) => matchesRepo(r, repo, authorId));
  if (rec) {
    const sourceName = sourceNameOfRecord(rec);
    if (sourceName) return entries.filter((e) => e.sourceName === sourceName);
    return [];
  }
  if (!officialBlock) return [];
  const mine = entries.filter(
    (e) => e.official && e.authorId?.toLowerCase() === authorId.toLowerCase(),
  );
  // 官方厂商块：单仓 = 全部；多仓按 repo.id 与条目 sourceName 的仓库段对位（对不上不硬塞）
  if (mine.length === 0) return [];
  const reposOfAuthor = new Set<string>();
  for (const e of mine) if (e.sourceName) reposOfAuthor.add(e.sourceName.toLowerCase());
  if (reposOfAuthor.size <= 1) return mine;
  return mine.filter((e) => (e.sourceName ?? "").toLowerCase().endsWith(`/${repo.id.toLowerCase()}`));
}

/**
 * 多块聚合 → 单作者域（纯函数）。
 * @param blocks 同一 authorId 从各候选源拉到的块（顺序 = 官方 → 用户源，先到者字段优先）
 * @param records 源记录（仓 ↔ 条目归属）
 * @param entries 统一池（目录条目）
 * @param collections 全局合集声明（缺集合判定的真相源）
 * @param officialSource 该块是否来自官方目录源（厂商整店：无 sourceName 记录时按 authorId 归）
 */
export function aggregateAuthorDomain(
  authorId: string,
  blocks: readonly AuthorBlock[],
  records: readonly SourceRecord[],
  entries: readonly CatalogEntry[],
  collections: readonly CollectionDecl[],
  officialSource: boolean,
): AuthorDomain | null {
  if (blocks.length === 0) return null;
  const first = blocks[0];
  const name = first.name ?? authorId;
  const collectionIds = new Set(collections.map((c) => c.id));
  const warnings: AuthorWarning[] = [];
  const seen = new Set<string>();
  const pushWarnings = (ws: readonly AuthorWarning[]) => {
    for (const w of ws) {
      const key = `${w.code}:${w.repoId ?? ""}:${w.detail ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push(w);
    }
  };

  /* 仓合并：同 id 先到者字段优先（多仓作者每仓可放同一份块，重复声明不翻倍） */
  const repoOrder: string[] = [];
  const repoById = new Map<string, AuthorRepoDecl>();
  // 块级 homepage/storeTitle 是仓级缺省（09 schema 的块级形态；蓝图演示是仓级——两处都认）
  const blockHomepage = blocks.find((b) => !!b.homepage)?.homepage;
  const blockStoreTitle = blocks.find((b) => !!b.storeTitle)?.storeTitle;
  for (const block of blocks) {
    pushWarnings(collectAuthorWarnings(block.homepage?.sections ?? [], undefined, collectionIds));
    for (const repo of block.repos) {
      if (!repoById.has(repo.id)) {
        repoById.set(repo.id, repo);
        repoOrder.push(repo.id);
      }
    }
  }

  const repos: AuthorRepoView[] = repoOrder.map((id) => {
    const decl = repoById.get(id)!;
    const homepage = decl.homepage ?? blockHomepage;
    if (decl.homepage) pushWarnings(collectAuthorWarnings(decl.homepage.sections, id, collectionIds));
    const storeTitle = decl.storeTitle ?? decl.homepage?.storeTitle ?? blockStoreTitle;
    return {
      ...decl,
      plugins: pluginsForRepo(decl, authorId, records, entries, officialSource),
      ...(homepage ? { homepage } : {}),
      ...(storeTitle ? { storeTitle } : {}),
    };
  });

  return {
    authorId,
    name,
    ...(first.avatar ? { avatar: first.avatar } : {}),
    ...(first.intro ? { intro: first.intro } : {}),
    ...(first.introImage ? { introImage: first.introImage } : {}),
    ...(blockStoreTitle ? { storeTitle: blockStoreTitle } : {}),
    repos,
    warnings,
    official: entries.some(
      (e) => !!e.vendorId && e.authorId?.toLowerCase() === authorId.toLowerCase(),
    ),
  };
}

/* ═══ 懒加载 store（realmSlot：多表面一份） ═══ */

interface AuthorsState {
  byId: Map<string, AuthorDomain | null>;
  pending: Set<string>;
  listeners: Set<() => void>;
}

const state = realmSlot<AuthorsState>("authorsStore/v1", () => ({
  byId: new Map<string, AuthorDomain | null>(),
  pending: new Set<string>(),
  listeners: new Set<() => void>(),
}));

function notify(): void {
  state.listeners.forEach((fn) => fn());
}

/** 当前已知作者 id：源记录（启用 remote）＋目录条目 authorId（厂商整店可能没有用户源） */
export async function knownAuthorIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const rec of await readSourceRecords()) {
    if (rec.kind === "remote" && rec.enabled && rec.authorId) ids.add(rec.authorId);
  }
  for (const entry of getCatalogResult().entries) {
    const id = entry.authorId?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

/** 该作者的候选源：官方源恒试 ＋ authorId 命中的启用 remote 源（仓库主页/直链都归一） */
async function candidateUrls(authorId: string): Promise<string[]> {
  const out: string[] = [OFFICIAL_SOURCE_URL];
  const seen = new Set<string>();
  const officialKey = urlSourceKey(OFFICIAL_SOURCE_URL);
  if (officialKey) seen.add(officialKey);
  const entries = getCatalogResult().entries;
  for (const rec of await readSourceRecords()) {
    if (rec.kind !== "remote" || !rec.enabled || !rec.url) continue;
    if (!recordDeclaresAuthor(rec, authorId, entries)) continue;
    const norm = normalizeSourceUrl(rec.url) ?? rec.url;
    const key = urlSourceKey(norm);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

/** 单 id 构建：逐候选源拉 `authors/<id>.json`（404/坏块跳过），聚合多块 */
async function buildAuthorDomain(authorId: string): Promise<AuthorDomain | null> {
  const [records, urls] = await Promise.all([readSourceRecords(), candidateUrls(authorId)]);
  const blocks: AuthorBlock[] = [];
  let officialBlock = false;
  let parseWarnings: AuthorWarning[] = [];
  const sidecars = await Promise.all(
    urls.map(async (url) => {
      const fileName = `authors/${encodeURIComponent(authorId)}.json`;
      const sibling = catalogSiblingUrl(url, fileName);
      if (!sibling) return null;
      const res = await fetchSidecar(sibling, false);
      return res.ok ? { text: res.text, official: url === OFFICIAL_SOURCE_URL } : null;
    }),
  );
  for (const side of sidecars) {
    if (!side) continue;
    const parsed = parseAuthorBlock(side.text);
    if (!parsed.ok) continue;
    // 身份正典：块内 authorId 必须与请求 id 一致（大小写不敏感）——防同源放错的作者块串店
    if (parsed.block.authorId.toLowerCase() !== authorId.toLowerCase()) continue;
    blocks.push(parsed.block);
    parseWarnings = parseWarnings.concat(parsed.warnings);
    if (side.official) officialBlock = true;
  }
  if (blocks.length === 0) return null;

  const catalog = getCatalogResult();
  const domain = aggregateAuthorDomain(
    authorId,
    blocks,
    records,
    catalog.entries,
    catalog.collections,
    officialBlock,
  );
  if (!domain) return null;
  // 解析期警告（未知板块 / 缺 collection 键）与聚合期警告（重复大屏 / 缺合集）同源交付
  const seen = new Set<string>();
  const merged: AuthorWarning[] = [];
  for (const w of [...parseWarnings, ...domain.warnings]) {
    const key = `${w.code}:${w.repoId ?? ""}:${w.detail ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(w);
  }
  return { ...domain, warnings: merged };
}

/** 确保若干作者已加载（不传 = 全部已知 id）；同一 id 只拉一次，失败结果也缓存（null） */
export async function ensureAuthorDomains(ids?: readonly string[]): Promise<void> {
  const target = ids?.length ? [...ids] : await knownAuthorIds();
  const missing = target.filter((id) => id && !state.byId.has(id) && !state.pending.has(id));
  if (missing.length === 0) return;
  await Promise.all(
    missing.map(async (id) => {
      state.pending.add(id);
      try {
        const domain = await buildAuthorDomain(id);
        state.byId.set(id, domain);
      } catch {
        state.byId.set(id, null); // 失败也落表：同一会话不反复拉同一坏源
      } finally {
        state.pending.delete(id);
      }
    }),
  );
  notify();
}

export function getCachedAuthorDomain(id: string): AuthorDomain | null | undefined {
  return state.byId.get(id);
}

/** 来源增删/停用后强制刷新作者域（清缓存 → 重载全部已知作者；调用方 = 来源页/加源弹窗） */
export async function refreshAuthorDomains(): Promise<void> {
  state.byId.clear();
  notify();
  await ensureAuthorDomains();
}

/** 同步快照（已加载的作者域；渲染方应按 id 排序或按来源序自行排） */
export function getLoadedAuthorDomains(): AuthorDomain[] {
  return [...state.byId.values()].filter((d): d is AuthorDomain => !!d);
}

/** 测试/内容刷新用：清空缓存（产线只在显式刷新时调） */
export function __resetAuthorsState(): void {
  state.byId.clear();
  state.pending.clear();
  state.listeners.clear();
}

/* ═══ React 绑定（消费方唯一读口；⛔ 视图各自发起 fetch） ═══ */

/** 全部已加载作者域（作者列表/首页作者栏）——`refreshKey` 变化时补载新 id（内容刷新/新加源） */
export function useAuthorDomains(refreshKey?: unknown): { domains: AuthorDomain[]; loading: boolean } {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    state.listeners.add(rerender);
    void ensureAuthorDomains().then(() => {
      if (alive) rerender();
    });
    return () => {
      alive = false;
      state.listeners.delete(rerender);
    };
  }, [rerender, refreshKey]);
  return { domains: getLoadedAuthorDomains(), loading: state.pending.size > 0 };
}

/** 单作者域（作者店/命令打开）——缺失 = 该作者没有作者块（v1 源/块坏了），调用方给诚实空态 */
export function useAuthorDomain(
  authorId: string,
  refreshKey?: unknown,
): { domain: AuthorDomain | undefined; loading: boolean } {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!authorId) return;
    let alive = true;
    state.listeners.add(rerender);
    void ensureAuthorDomains([authorId]).then(() => {
      if (alive) rerender();
    });
    return () => {
      alive = false;
      state.listeners.delete(rerender);
    };
  }, [authorId, rerender, refreshKey]);
  const cached = authorId ? state.byId.get(authorId) : null;
  return {
    domain: cached ?? undefined,
    loading: !!authorId && !state.byId.has(authorId),
  };
}
