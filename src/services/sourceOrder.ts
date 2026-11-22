/**
 * sourceOrder — 市场源的**唯一顺序模型**（19 §四；2026-11-22 拍板 D4）。
 *
 * 唯一真相源 = `marketplace.marketplaceSources` **数组顺序**（真机键）：
 *   - 作者组顺序 = 该作者在数组里首次出现的相对位置（本地记录不参与）；
 *   - 组内仓库顺序 = 该作者各源在数组里的相对顺序；
 *   - 官方核心仓锁官方组第 0 位；本地组固定末尾、不可拖。
 *
 * 为什么要有「虚拟官方核心」：官方源历史上**不入册**（`readSourceRecords` 滤掉官方残留、
 * `getSourceUrls` 恒定前置）⇒ 现有用户的数组里没有官方记录。顺序模型把它当**虚拟第 0 条**，
 * 只有用户把官方组拖到别处时才**物化**成一条显式记录（url = 官方源、authorId = official）——
 * 这样旧数组零迁移、拖动语义又和原型（HTML7 `SOURCES` 里官方本来就在册）完全一致。
 *
 * 纪律：
 *   - 本文件只做**纯决策**（归一 / 建序 / swap）；读写配置在 `sourceAdmin`（写路径单点）。
 *   - 交换语义（⛔ 插入线）：作者容器 ↔ 作者容器；仓只在**同一作者内**交换；跨作者/官方核心 = 拒绝。
 *   - 写回只搬目标块，其余记录**原样保留**（⛔ 归一化重写——用户粘的主页 URL 不能被改写）。
 */

import { urlSourceKey } from "@linkdesk/ui";
import {
  OFFICIAL_SOURCE_URL,
  normalizeSourceUrl,
  sourceNameOfUrl,
} from "./marketCatalog";
import { LOCAL_AUTHOR_ID, normalizeSourceRecord } from "./marketSources";
import type { SourceRecord } from "./marketSources";
import {
  OFFICIAL_AUTHOR_ID,
  OFFICIAL_CORE_REPO_ID,
  isOfficialCoreRepo,
  isOfficialSourceUrl,
} from "./officialRepo";

export { OFFICIAL_CORE_REPO_ID, isOfficialCoreRepo, isOfficialSourceUrl } from "./officialRepo";

/** 目录条目的「sourceName → 声明 authorId」映射（身份正典 = 条目 authorId；09 §二） */
export function declaredAuthorMapOf(
  entries: ReadonlyArray<{ sourceName?: string; authorId?: string }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) {
    if (e.sourceName && e.authorId) out.set(e.sourceName, e.authorId);
  }
  return out;
}

export interface OrderedRecord {
  /** 原始配置数组下标；-1 = 虚拟官方核心记录（不在磁盘上） */
  index: number;
  authorId: string;
  repoId: string;
  kind: "remote" | "local";
  /** 官方核心仓（锁组内第一、不可删/停用） */
  core: boolean;
  url?: string;
  path?: string;
  enabled: boolean;
}

export interface SourceOrder {
  /** 远程记录（数组序，含虚拟官方核心在首位） */
  remote: OrderedRecord[];
  /** 本地记录（数组序；固定末尾、不进作者顺序） */
  locals: OrderedRecord[];
  /** 作者容器顺序（不含本地组；官方恒在——虚拟或显式） */
  authorOrder: string[];
  /** 作者 → 仓顺序（官方组核心恒第一） */
  repoOrder: Record<string, string[]>;
  /** 磁盘上是否已有显式官方核心记录（决定 swap 时要不要物化） */
  officialExplicit: boolean;
}

export interface BuildOrderOptions {
  /** 条目声明的 authorId（sourceName → authorId）；缺省 = 记录自身的 GitHub owner */
  declaredAuthorBySource?: ReadonlyMap<string, string>;
  /** 作者声明的仓库 id（sourceUrl 身份 → repos[].id）；缺省 = 记录自身的 GitHub repo 名。
   *  19 §4.1：作者块 `repos[].id` 是仓卡/交换的唯一 id，源记录的 repoId 只是拉取身份。 */
  declaredRepoBySourceUrl?: ReadonlyMap<string, string>;
  /** 是否把官方作者身份计入顺序（默认 true；官方目录没有条目时也可显式关掉） */
  includeOfficial?: boolean;
}

/** 作者域 → `sourceUrl 身份 → repos[].id` 映射（供顺序模型把源记录对到作者声明的仓 id） */
export function declaredRepoMapOf(
  domains: ReadonlyArray<{ repos: ReadonlyArray<{ id: string; sourceUrl?: string }> }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const domain of domains) {
    for (const repo of domain.repos) {
      if (!repo.sourceUrl) continue;
      const norm = normalizeSourceUrl(repo.sourceUrl) ?? repo.sourceUrl;
      const key = urlSourceKey(norm);
      if (key) out.set(key, repo.id);
    }
  }
  return out;
}

function canonicalAuthorIdOf(
  rec: SourceRecord,
  declared: ReadonlyMap<string, string> | undefined,
): string {
  if (rec.kind === "local") return LOCAL_AUTHOR_ID;
  const url = rec.url ? normalizeSourceUrl(rec.url) ?? rec.url : undefined;
  const sourceName = url ? sourceNameOfUrl(url) : undefined;
  const declaredId = sourceName ? declared?.get(sourceName) : undefined;
  return (declaredId ?? rec.authorId ?? "").trim();
}

function toOrderedRecord(
  item: unknown,
  index: number,
  opts: BuildOrderOptions,
): OrderedRecord | null {
  const rec = normalizeSourceRecord(item);
  if (!rec) return null;
  const authorId = canonicalAuthorIdOf(rec, opts.declaredAuthorBySource);
  if (!authorId) return null;
  const core = rec.kind === "remote" && isOfficialSourceUrl(rec.url);
  const normUrl = rec.url ? normalizeSourceUrl(rec.url) ?? rec.url : undefined;
  const urlKey = normUrl ? urlSourceKey(normUrl) : null;
  const declaredRepoId = urlKey ? opts.declaredRepoBySourceUrl?.get(urlKey) : undefined;
  const repoId = core ? OFFICIAL_CORE_REPO_ID : declaredRepoId ?? rec.repoId;
  return {
    index,
    authorId: core ? OFFICIAL_AUTHOR_ID : authorId,
    repoId,
    kind: rec.kind,
    core,
    ...(rec.url ? { url: rec.url } : {}),
    ...(rec.path ? { path: rec.path } : {}),
    enabled: rec.enabled,
  };
}

/** 数组 → 顺序模型（纯函数；坏记录静默跳过，⛔ 不崩整份配置） */
export function buildSourceOrder(
  items: readonly unknown[],
  opts: BuildOrderOptions = {},
): SourceOrder {
  const records: OrderedRecord[] = [];
  const seenRemote = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const rec = toOrderedRecord(items[i], i, opts);
    if (!rec) continue;
    if (rec.kind === "remote") {
      const key = urlSourceKey(rec.url ?? "") ?? `${rec.authorId.toLowerCase()}:${rec.repoId}`;
      if (seenRemote.has(key)) continue;
      seenRemote.add(key);
    }
    records.push(rec);
  }

  const officialExplicit = records.some((r) => r.core);
  const includeOfficial = opts.includeOfficial !== false;
  const remote: OrderedRecord[] = [];
  if (!officialExplicit && includeOfficial) {
    remote.push({
      index: -1,
      authorId: OFFICIAL_AUTHOR_ID,
      repoId: OFFICIAL_CORE_REPO_ID,
      kind: "remote",
      core: true,
      enabled: true,
    });
  }
  for (const rec of records) if (rec.kind === "remote") remote.push(rec);
  const locals = records.filter((r) => r.kind === "local");

  const authorOrder: string[] = [];
  for (const rec of remote) {
    if (!authorOrder.some((id) => id.toLowerCase() === rec.authorId.toLowerCase())) {
      authorOrder.push(rec.authorId);
    }
  }

  const repoOrder: Record<string, string[]> = {};
  for (const authorId of authorOrder) {
    const ids: string[] = [];
    for (const rec of remote) {
      if (rec.authorId.toLowerCase() !== authorId.toLowerCase()) continue;
      if (!ids.includes(rec.repoId)) ids.push(rec.repoId);
    }
    // D4：官方核心仓锁官方组第一（磁盘顺序被手改也不翻车）
    if (authorId.toLowerCase() === OFFICIAL_AUTHOR_ID) {
      const at = ids.indexOf(OFFICIAL_CORE_REPO_ID);
      if (at > 0) {
        ids.splice(at, 1);
        ids.unshift(OFFICIAL_CORE_REPO_ID);
      }
    }
    repoOrder[authorId] = ids;
  }

  return { remote, locals, authorOrder, repoOrder, officialExplicit };
}

/** 读顺序的命令面形状（`marketplace.getOrder` 回执 / `getState` 字段） */
export function orderSnapshot(model: SourceOrder): {
  authorOrder: string[];
  repoOrder: Record<string, string[]>;
} {
  return { authorOrder: [...model.authorOrder], repoOrder: { ...model.repoOrder } };
}

export type SwapReason = "bad-arg" | "not-found" | "same" | "cross-author" | "locked" | "official";

export type SwapDecision =
  | { ok: true; next: unknown[]; order: { authorOrder: string[]; repoOrder: Record<string, string[]> } }
  | { ok: false; reason: SwapReason };

/** 物化的官方核心记录（只在用户把官方组拖离首位时才写入磁盘） */
function officialCoreRecord(): SourceRecord {
  return {
    kind: "remote",
    url: OFFICIAL_SOURCE_URL,
    authorId: OFFICIAL_AUTHOR_ID,
    repoId: OFFICIAL_CORE_REPO_ID,
    enabled: true,
    status: "ok",
  };
}

/**
 * 作者容器交换（D4）：目标必须是另一个作者容器；两者整块换位，块内仓顺序不动。
 * 本地记录恒排末尾（不参与作者顺序，原地保留在数组尾部）。
 */
export function swapAuthorsRaw(
  items: readonly unknown[],
  authorIdA: string,
  authorIdB: string,
  opts: BuildOrderOptions = {},
): SwapDecision {
  const model = buildSourceOrder(items, opts);
  const a = model.authorOrder.find((id) => id.toLowerCase() === authorIdA.trim().toLowerCase());
  const b = model.authorOrder.find((id) => id.toLowerCase() === authorIdB.trim().toLowerCase());
  if (!a || !b) return { ok: false, reason: "not-found" };
  if (a === b) return { ok: false, reason: "same" };

  const order = [...model.authorOrder];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  [order[ia], order[ib]] = [order[ib], order[ia]];

  const byAuthor = new Map<string, number[]>();
  const unknown: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const rec = toOrderedRecord(items[i], i, opts);
    if (!rec) {
      unknown.push(i);
      continue;
    }
    if (rec.kind === "local") continue; // 本地记录统一补到末尾
    const id = model.authorOrder.find((x) => x.toLowerCase() === rec.authorId.toLowerCase()) ?? rec.authorId;
    const list = byAuthor.get(id);
    if (list) list.push(i);
    else byAuthor.set(id, [i]);
  }

  const next: unknown[] = [];
  for (const id of order) {
    const indices = byAuthor.get(id) ?? [];
    if (indices.length === 0) {
      // 虚拟官方核心被拖到非首位 ⇒ 物化一条显式记录，让「官方在这里」可被磁盘表达
      if (id.toLowerCase() === OFFICIAL_AUTHOR_ID) next.push(officialCoreRecord());
      continue;
    }
    for (const i of indices) next.push(items[i]);
  }
  for (const i of unknown) next.push(items[i]);
  for (let i = 0; i < items.length; i++) {
    const rec = toOrderedRecord(items[i], i, opts);
    if (rec?.kind === "local") next.push(items[i]);
  }

  const nextModel = buildSourceOrder(next, opts);
  return { ok: true, next, order: orderSnapshot(nextModel) };
}

/**
 * 仓卡 / 源行交换（D4）：**只在本作者内**；官方核心仓不参与（锁组内第一）。
 * 原地换该作者占用的槽位，⛔ 不动其他作者的位置。
 */
export function swapReposRaw(
  items: readonly unknown[],
  authorId: string,
  repoIdA: string,
  repoIdB: string,
  opts: BuildOrderOptions = {},
): SwapDecision {
  const model = buildSourceOrder(items, opts);
  const author = model.authorOrder.find((id) => id.toLowerCase() === authorId.trim().toLowerCase());
  if (!author) return { ok: false, reason: "not-found" };
  const order = model.repoOrder[author] ?? [];
  const ra = order.indexOf(repoIdA.trim());
  const rb = order.indexOf(repoIdB.trim());
  if (ra < 0 || rb < 0) return { ok: false, reason: "not-found" };
  if (ra === rb) return { ok: false, reason: "same" };
  if (isOfficialCoreRepo(author, order[ra]) || isOfficialCoreRepo(author, order[rb])) {
    return { ok: false, reason: "locked" };
  }

  // 该作者占用的数组槽位（按原序）与逐仓记录列表
  const slots: number[] = [];
  const byRepo = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const rec = toOrderedRecord(items[i], i, opts);
    if (!rec || rec.kind === "local" || rec.authorId.toLowerCase() !== author.toLowerCase()) continue;
    slots.push(i);
    const list = byRepo.get(rec.repoId);
    if (list) list.push(i);
    else byRepo.set(rec.repoId, [i]);
  }
  if (slots.length === 0) return { ok: false, reason: "not-found" };

  const swapped = [...order];
  [swapped[ra], swapped[rb]] = [swapped[rb], swapped[ra]];
  const reordered: unknown[] = [];
  for (const repoId of swapped) {
    for (const i of byRepo.get(repoId) ?? []) reordered.push(items[i]);
  }
  if (reordered.length !== slots.length) return { ok: false, reason: "bad-arg" };

  const next = [...items];
  slots.forEach((slot, k) => {
    next[slot] = reordered[k];
  });

  const nextModel = buildSourceOrder(next, opts);
  return { ok: true, next, order: orderSnapshot(nextModel) };
}
