/**
 * sourceAdmin — 来源管理页的**写路径单点**（R4-3.14）：源级启停 / 同作者内排序 / 单源刷新。
 *
 * 纪律：
 *   - 配置真相源仍是 `marketplace.marketplaceSources`（与设置插件同键）；本文件**按原始数组改**，
 *     其余记录原样保留（⛔ 归一化重写——用户粘的主页 URL 不能被改成 HEAD 直链，R4-2.5 同款纪律）。
 *   - 形状升级是**加法式**：旧 `string` / `{url}` 记录在首次写时升成源记录（补 kind/authorId/repoId/
 *     enabled/status），不改键、不丢原值。
 *   - 排序只在**同作者内**（09 §二：数组顺序 = 作者卡顺序；⛔ 跨作者调序）；本地条目无源级启停。
 *   - 刷新单源 = 清该 URL 缓存后重投影（其余源命中 5min 缓存，不连带强刷）。
 */

import { urlSourceKey } from "@linkdesk/ui";
import {
  OFFICIAL_SOURCE_URL,
  catalogSiblingUrl,
  githubOwnerRepoOf,
  normalizeSourceUrl,
  parseCatalog,
  sourceNameOfUrl,
  synthesizeEntryFromManifest,
} from "./marketCatalog";
import {
  LOCAL_AUTHOR_ID,
  normalizeSourceRecord,
  readSourceRecords,
  type SourceRecord,
} from "./marketSources";
import { fetchSidecar } from "./marketSources/fetch";
import { removeCache } from "./marketSources/io";
import type { CatalogEntry } from "./marketCatalog";
import { getCatalogResult, reprojectCatalog } from "./marketplaceShared/catalogStore";
import { ensureAuthorDomains, getLoadedAuthorDomains } from "./authors";
import { scheduleDataRefresh } from "./marketplaceShared/pluginsStore";
import {
  buildSourceOrder,
  declaredAuthorMapOf,
  declaredRepoMapOf,
  orderSnapshot,
  swapAuthorsRaw,
  swapReposRaw,
  type BuildOrderOptions,
  type SwapDecision,
} from "./sourceOrder";

const CONFIG_KEY = "marketplace.marketplaceSources";

export type SourceAdminReason = "bad-arg" | "not-found" | "official" | "edge";

export type SourceAdminDecision =
  | { ok: true; next: unknown[] }
  | { ok: false; reason: SourceAdminReason };

export type SourceTarget = string | number | { url?: string; path?: string; index?: number };

function pathKey(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** 原始配置项的身份（URL 用 owner/repo；本地 path 归一；认不出 = 空） */
function identityOf(item: unknown): { url?: string; path?: string } {
  if (typeof item === "string") {
    const url = item.trim();
    return url ? { url } : {};
  }
  if (typeof item !== "object" || item === null) return {};
  const rec = item as { url?: unknown; path?: unknown };
  return {
    url: typeof rec.url === "string" && rec.url.trim() ? rec.url.trim() : undefined,
    path: typeof rec.path === "string" && rec.path.trim() ? rec.path.trim() : undefined,
  };
}

function isOfficialUrl(url: string): boolean {
  const a = urlSourceKey(url);
  const b = urlSourceKey(OFFICIAL_SOURCE_URL);
  return a !== null && a === b;
}

function indexOfTarget(items: readonly unknown[], target: SourceTarget): number {
  if (typeof target === "number") return Number.isInteger(target) ? target : -1;
  const obj = typeof target === "object" && target !== null ? target : {};
  if (typeof obj.index === "number") return Number.isInteger(obj.index) ? obj.index : -1;
  const url = typeof target === "string" ? target : (obj.url ?? "");
  const path = typeof obj === "object" && target !== null ? obj.path : undefined;
  if (url) {
    const want = urlSourceKey(url);
    if (want === null) return -1;
    return items.findIndex((item) => {
      const id = identityOf(item);
      return !!id.url && urlSourceKey(id.url) === want;
    });
  }
  if (path) {
    const want = pathKey(path);
    return items.findIndex((item) => {
      const id = identityOf(item);
      return !!id.path && pathKey(id.path) === want;
    });
  }
  return -1;
}

/** 旧形态 → 源记录（保留原字段与原始 URL 形态；只补声明字段） */
function upgradeRecord(item: unknown, enabled: boolean): unknown {
  const base = typeof item === "object" && item !== null && !Array.isArray(item) ? { ...item } : {};
  const identity = typeof item === "string" ? { url: item } : base;
  const rec = normalizeSourceRecord({ ...identity, enabled });
  if (!rec) return item;
  const out: Record<string, unknown> = { ...base, ...rec, enabled };
  // normalizeSourceRecord 会把「本地 path」的 repoId 推成末段、remote 推成 owner/repo——沿用
  if (rec.kind === "remote" && !out.url) out.url = rec.url;
  if (rec.kind === "local" && !out.path) out.path = rec.path;
  return out;
}

/**
 * 源级启停（enabled=false ⇒ 不拉取、不进商店；已装插件照常运行——09 §二）。
 * 本地条目不在本函数面（无源级启停，只有插件级启停）——调用方按 kind 分流。
 */
export function setSourceEnabledRaw(items: readonly unknown[], target: SourceTarget, enabled: boolean): SourceAdminDecision {
  const idx = indexOfTarget(items, target);
  if (idx < 0 || idx >= items.length) return { ok: false, reason: "bad-arg" };
  const id = identityOf(items[idx]);
  if (id.url && isOfficialUrl(id.url)) return { ok: false, reason: "official" };
  if (!id.url && !id.path) return { ok: false, reason: "not-found" };
  const next = items.map((item, i) => (i === idx ? upgradeRecord(item, enabled) : item));
  return { ok: true, next };
}

/**
 * 同作者内调序（↑↓）。目标必须是 remote 源；邻居 = 同 authorId 的 remote 源（本地条目跳过）。
 * 返回的 next 只交换这两个位置，其余记录原样（含本地条目）。
 */
export function moveSourceWithinAuthorRaw(
  items: readonly unknown[],
  target: SourceTarget,
  dir: -1 | 1,
): SourceAdminDecision {
  const index = indexOfTarget(items, target);
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    return { ok: false, reason: "bad-arg" };
  }
  const cur = normalizeSourceRecord(items[index]);
  if (!cur || cur.kind !== "remote" || !cur.authorId) return { ok: false, reason: "bad-arg" };
  const sameAuthor = (i: number): boolean => {
    const rec = normalizeSourceRecord(items[i]);
    return !!rec && rec.kind === "remote" && rec.authorId.toLowerCase() === cur.authorId.toLowerCase();
  };
  let j = -1;
  if (dir < 0) {
    for (let k = index - 1; k >= 0; k--) if (sameAuthor(k)) { j = k; break; }
  } else {
    for (let k = index + 1; k < items.length; k++) if (sameAuthor(k)) { j = k; break; }
  }
  if (j < 0) return { ok: false, reason: "edge" };
  const next = [...items];
  [next[index], next[j]] = [next[j], next[index]];
  return { ok: true, next };
}

/** 原始配置读/写（写失败大声抛——⛔ 假 ok） */
export async function readRawSourceConfig(): Promise<unknown[]> {
  try {
    const raw = await window.linkdesk?.configuration?.get<unknown>(CONFIG_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function writeRawSourceConfig(next: unknown[]): Promise<void> {
  const cfg = window.linkdesk?.configuration;
  if (!cfg?.set) throw new Error("配置写入面不可用（window.linkdesk.configuration.set）");
  await cfg.set(CONFIG_KEY, next);
}

/** 源级启停（IO 包装：读原始数组 → 纯决策 → 写回） */
export async function setSourceEnabled(target: SourceTarget, enabled: boolean): Promise<SourceAdminDecision> {
  const items = await readRawSourceConfig();
  const decision = setSourceEnabledRaw(items, target, enabled);
  if (!decision.ok) return decision;
  await writeRawSourceConfig(decision.next);
  return decision;
}

/** 同作者内调序（IO 包装；target 按 URL 身份认——本地条目与用户源可混排在同一数组） */
export async function moveSource(target: SourceTarget, dir: -1 | 1): Promise<SourceAdminDecision> {
  const items = await readRawSourceConfig();
  const decision = moveSourceWithinAuthorRaw(items, target, dir);
  if (!decision.ok) return decision;
  await writeRawSourceConfig(decision.next);
  return decision;
}

/** 单源刷新：清该源缓存 → 非强拉重投影（其余源命中 fresh 缓存，只有该源真发网络） */
export async function refreshSource(url: string): Promise<{ ok: boolean }> {
  const norm = normalizeSourceUrl(url) ?? url;
  removeCache(norm);
  try {
    await reprojectCatalog();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** 单源目录差异（纯函数）：新增/版本变化的条目数——「发现 N 个更新」的计数依据 */
export function diffSourceEntries(
  before: readonly CatalogEntry[],
  after: readonly CatalogEntry[],
): number {
  const prev = new Map(before.map((e) => [e.id, e.version]));
  let changed = 0;
  for (const entry of after) {
    const old = prev.get(entry.id);
    if (old === undefined || old !== entry.version) changed++;
  }
  return changed;
}

export interface SourceRefreshOutcome {
  ok: boolean;
  /** 新增/版本变化的插件数（ok=false 时为 0） */
  changed: number;
  reason?: string;
}

/**
 * 单仓刷新（含官方核心仓；19 §3.4/§8.5）——**结果化**回执：
 *   ok + changed>0 = 有更新；ok + 0 = 已是最新；ok=false = 失败（UI 提示「已用缓存」）。
 * 判失败用本趟 `sourceStatus`（该源彻底失败、无缓存可兜），⛔ 不拿「没抛异常」当成功。
 */
export async function refreshSourceDetailed(url: string): Promise<SourceRefreshOutcome> {
  const norm = normalizeSourceUrl(url) ?? url;
  const sourceName = sourceNameOfUrl(norm);
  const before = getCatalogResult().entries.filter((e) => e.sourceName === sourceName);
  removeCache(norm);
  try {
    const r = await reprojectCatalog();
    const key = urlSourceKey(norm);
    const status = r.sourceStatus?.find((s) => (urlSourceKey(s.url) ?? s.url) === (key ?? norm));
    if (status && !status.ok) {
      return { ok: false, changed: 0, reason: status.reason ?? "network" };
    }
    const after = r.entries.filter((e) => e.sourceName === sourceName);
    return { ok: true, changed: diffSourceEntries(before, after) };
  } catch {
    return { ok: false, changed: 0, reason: "io" };
  }
}

/* ═══ 顺序面（19 §四；唯一真相源 = marketplaceSources 数组） ═══
 * 纯决策在 `sourceOrder`；本处只负责「读原始数组 → 注入声明 authorId → 写回」。
 * 🔴 写回只搬目标块，其余记录原样（含旧 string / {url} 形态）——⛔ 归一化重写。
 * 目录声明映射来自当前目录投影（条目 authorId 是身份正典；GitHub owner 只是兜底）。 */

function orderOptions(): BuildOrderOptions {
  return {
    declaredAuthorBySource: declaredAuthorMapOf(getCatalogResult().entries),
    declaredRepoBySourceUrl: declaredRepoMapOf(getLoadedAuthorDomains()),
  };
}

/** 命令面可能不在已加载作者域的 realm 里——先确保域到位（仓 id 才能对到作者声明） */
async function ensureOrderContext(): Promise<void> {
  try {
    await ensureAuthorDomains();
  } catch {
    /* 拉不到作者域 ⇒ 顺序回落到源记录的 repoId（仍可交换，只是 id 以源为准） */
  }
}

/** 读当前作者/仓顺序（`marketplace.getOrder` 的落点；不写盘） */
export async function readSourceOrder(): Promise<{
  authorOrder: string[];
  repoOrder: Record<string, string[]>;
}> {
  await ensureOrderContext();
  const items = await readRawSourceConfig();
  return orderSnapshot(buildSourceOrder(items, orderOptions()));
}

/** 交换两个作者容器（D4；本地组不参与） */
export async function swapAuthors(authorIdA: string, authorIdB: string): Promise<SwapDecision> {
  await ensureOrderContext();
  const items = await readRawSourceConfig();
  const decision = swapAuthorsRaw(items, authorIdA, authorIdB, orderOptions());
  if (!decision.ok) return decision;
  await writeRawSourceConfig(decision.next);
  return decision;
}

/** 同一作者内交换两个仓（D4；官方核心仓锁第一，跨作者拒绝） */
export async function swapRepos(
  authorId: string,
  repoIdA: string,
  repoIdB: string,
): Promise<SwapDecision> {
  await ensureOrderContext();
  const items = await readRawSourceConfig();
  const decision = swapReposRaw(items, authorId, repoIdA, repoIdB, orderOptions());
  if (!decision.ok) return decision;
  await writeRawSourceConfig(decision.next);
  return decision;
}

export interface SourcePreview {
  ok: boolean;
  /** catalog = 仓库根有 marketplace.json；plugin = K5 回落（单插件仓）；missing = 两者都没有 */
  kind?: "catalog" | "plugin";
  /** 预览到的插件条数（plugin = 1） */
  count?: number;
  /** 预览到的第一个插件名（弹窗预览用） */
  name?: string;
  /** 将并入的已有作者 id（同 owner/authorId 命中时） */
  existingAuthorId?: string;
  reason?: "bad-url" | "official" | "duplicate" | "network" | "missing";
}

/** 加源预览（**先拉后入**）：只读拉取，不写配置；K5 回落链与载荷逐字同源（09 §三·补2）。 */
export async function previewRemoteSource(rawUrl: string): Promise<SourcePreview> {
  const norm = normalizeSourceUrl(rawUrl);
  if (!norm) return { ok: false, reason: "bad-url" };
  if (isOfficialUrl(norm)) return { ok: false, reason: "official" };
  const existing = await readRawSourceConfig();
  const ids = ownerRepoOf(norm);
  if (
    ids &&
    existing.some((item) => {
      const id = identityOf(item);
      return !!id.url && urlSourceKey(id.url) === urlSourceKey(norm);
    })
  ) {
    return { ok: false, reason: "duplicate" };
  }

  const dir = await fetchSidecar(norm, true);
  if (dir.ok) {
    const parsed = parseCatalog(dir.text);
    if (parsed.ok) {
      return {
        ok: true,
        kind: "catalog",
        count: parsed.catalog.plugins.length,
        name: parsed.catalog.plugins[0]?.name,
        existingAuthorId: await existingAuthorFor(ids?.owner, parsed.catalog.plugins[0]?.authorId),
      };
    }
  } else if (dir.reason === "network") {
    return { ok: false, reason: "network" };
  }

  // K5：仓库根无 marketplace.json → 同目录 plugin.json 合成 1 条
  const manifestUrl = catalogSiblingUrl(norm, "plugin.json");
  if (manifestUrl) {
    const side = await fetchSidecar(manifestUrl, false);
    if (side.ok) {
      const entry = synthesizeEntryFromManifest(side.text, norm);
      if (entry) {
        return {
          ok: true,
          kind: "plugin",
          count: 1,
          name: entry.name,
          existingAuthorId: await existingAuthorFor(ids?.owner, entry.authorId),
        };
      }
    }
  }
  return { ok: false, reason: "missing" };
}

/** 同作者判定：配置记录的 authorId 或目录条目的 authorId 命中 owner */
async function existingAuthorFor(owner: string | undefined, declaredAuthorId: string | undefined): Promise<string | undefined> {
  for (const rec of await readSourceRecords()) {
    if (rec.kind === "remote" && rec.authorId.toLowerCase() === (owner ?? "").toLowerCase()) {
      return rec.authorId;
    }
  }
  if (declaredAuthorId) {
    for (const rec of await readSourceRecords()) {
      if (rec.authorId.toLowerCase() === declaredAuthorId.toLowerCase()) return rec.authorId;
    }
  }
  return undefined;
}

/** 批量卸载（移除源时勾选「同时卸载」用）——逐条调壳卸载，成功后刷新本地列表 */
export async function uninstallPluginIds(ids: readonly string[]): Promise<number> {
  const pm = window.linkdesk?.pluginManager;
  if (!pm?.uninstall) return 0;
  let n = 0;
  for (const id of ids) {
    try {
      await pm.uninstall(id);
      n++;
    } catch {
      /* 单条失败不阻塞其余（回执只报成功数） */
    }
  }
  scheduleDataRefresh();
  return n;
}

/** 本地条目身份（来源页「本地安装」组用）：path 末段作 repoId；local 恒 `__local` 作者 */
export function localRecordOf(path: string): SourceRecord {
  const repoId = path.split(/[\\/]/).filter(Boolean).pop() ?? "";
  return {
    kind: "local",
    path,
    authorId: LOCAL_AUTHOR_ID,
    repoId,
    enabled: true,
    status: "ok",
  };
}

/** 从原始 URL 推 owner/repo（新加源预览/展示同用） */
export function ownerRepoOf(url: string): { owner: string; repo: string } | null {
  return githubOwnerRepoOf(normalizeSourceUrl(url) ?? url);
}
