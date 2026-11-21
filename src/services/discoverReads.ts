/**
 * discoverReads —— 发现型已读标记的**数据面唯一属主**（06 §八·补，R4-2.5 `marketplace.markAllRead`）。
 *
 * 存储（正典 06 §八·补）：`pluginState("marketplace", "discoverReads")` →
 * `{ sources: 已读来源键[], cats: 已读分类 slug[], until: 最后全读时间戳, hashes?: 逐键内容签名 }`。
 *
 * 本文件负责五件事（棒 6/7 的「进入即已读」是同一域的下游写入，⛔ 另起一份）：
 *   ① 读/写归一（坏值折默认，不崩）；
 *   ② `markSeen(kind, key)`——进入分类/作者店时持久清除该键（棒 6/7 调用）；
 *   ③ `markAllRead(kind)`——「全部已读」：把**当前目录里还没读过的键**并入集合并推进 `until`，
 *      回执 `{ cleared }` = 本次实际清掉的键数（⛔ 不碰任务型更新数字——updates 真相源独立）；
 *   ④ `unreadDiscoverKeys()`——**增量点集**（R4-5.6/#12）：键 ∉ 已读集 ∪（已读但内容签名变了——
 *      `catalogKeySignature` 逐键比对，「同一分类又上新」重开点；hashes 缺省的存量记录视为未变，
 *      升级首日不给老用户整屏刷点）；
 *   ⑤ 写入通知（`onDiscoverReadsChange`）——UI 订阅刷新（authors.ts notify 同款模式）。
 */

import { catalogKeySignature, primaryCategoryOf, type CatalogEntry } from "./marketCatalog";
import { getCatalogResult } from "./marketplaceShared/catalogStore";

export type DiscoverReadKind = "category" | "author" | "all";

/** 逐键内容签名（读时的桶内容 hash）——「又上新」重开点的判据（06 §八·补 R4-5.6 增补字段） */
export interface DiscoverHashes {
  cats?: Record<string, string>;
  sources?: Record<string, string>;
}

export interface DiscoverReads {
  sources: string[];
  cats: string[];
  /** 最后一次「全部已读」时刻（ms）；0 = 从未全读 */
  until: number;
  /** 读时的逐键内容签名（可选——存量记录无此字段 = 视为未变） */
  hashes?: DiscoverHashes;
}

export const EMPTY_DISCOVER_READS: DiscoverReads = { sources: [], cats: [], until: 0 };

interface ReadsStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const OWNER = "marketplace";
const KEY = "discoverReads";

let _store: ReadsStore | null = null;
/** 测试注入 store；传 null 恢复默认（`window.linkdesk.pluginState`，owner "marketplace"） */
export function __setDiscoverReadsStore(store: ReadsStore | null): void {
  _store = store;
}

function store(): ReadsStore | null {
  if (_store !== null) return _store;
  const ps = window.linkdesk?.pluginState;
  if (!ps) return null;
  return {
    get: (k) => ps.get(OWNER, k),
    set: (k, v) => ps.set(OWNER, k, v),
  };
}

function stringSet(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

/** 读侧归一（坏值/缺字段一律折默认——已读只是提示状态，不值得为坏行报错） */
export function normalizeDiscoverReads(raw: unknown): DiscoverReads {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_DISCOVER_READS };
  const r = raw as Partial<DiscoverReads>;
  const hashes = normalizeHashes(r.hashes);
  return {
    sources: stringSet(r.sources),
    cats: stringSet(r.cats),
    until: typeof r.until === "number" && r.until > 0 ? r.until : 0,
    ...(hashes ? { hashes } : {}),
  };
}

function hashMap(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const out: Record<string, string> = {};
  let any = false;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v && k) {
      out[k] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

function normalizeHashes(raw: unknown): DiscoverHashes | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Partial<DiscoverHashes>;
  const cats = hashMap(r.cats);
  const sources = hashMap(r.sources);
  if (!cats && !sources) return undefined;
  return { ...(cats ? { cats } : {}), ...(sources ? { sources } : {}) };
}

export async function readDiscoverReads(): Promise<DiscoverReads> {
  const s = store();
  if (!s) return { ...EMPTY_DISCOVER_READS };
  try {
    return normalizeDiscoverReads(await s.get(KEY));
  } catch {
    return { ...EMPTY_DISCOVER_READS };
  }
}

/** 当前目录里的「分类键 / 作者键」——已读点挂在分类项与作者项上（08 §三·95）。
 *  纯函数（目录作参）——UI 层与 markAllRead 共用；模块内快捷口 catalogKeys() 读 store。 */
export function catalogKeysOf(entries: readonly CatalogEntry[]): { cats: string[]; sources: string[] } {
  const cats = new Set<string>();
  const sources = new Set<string>();
  for (const entry of entries) {
    cats.add(primaryCategoryOf(entry));
    // 作者项身份：authorId 优先（v2 聚合键）；旧条目无 authorId 时退回来源仓库名
    const authorKey = entry.authorId?.trim() || entry.sourceName?.trim();
    if (authorKey) sources.add(authorKey);
  }
  return { cats: [...cats], sources: [...sources] };
}

function catalogKeys(): { cats: string[]; sources: string[] } {
  return catalogKeysOf(getCatalogResult().entries);
}

/** 逐键内容签名（catalogKeySignature 逐桶/逐作者算——与全目录比对同一哈希域，⛔ 两套哈希）。
 *  供 UI 层增量点集比对（unreadDiscoverKeys）与 markSeen/markAllRead 的 hash 记录共用。 */
export function computeKeyHashes(entries: readonly CatalogEntry[]): DiscoverHashes {
  const cats: Record<string, string> = {};
  const sources: Record<string, string> = {};
  const buckets = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const cat = primaryCategoryOf(entry);
    const bucket = buckets.get(cat);
    if (bucket) bucket.push(entry);
    else buckets.set(cat, [entry]);
    // 作者项身份：authorId 优先（v2 聚合键）；旧条目无 authorId 时退回来源仓库名
    const authorKey = entry.authorId?.trim() || entry.sourceName?.trim();
    if (authorKey) {
      const ab = buckets.get(`a:${authorKey}`);
      if (ab) ab.push(entry);
      else buckets.set(`a:${authorKey}`, [entry]);
    }
  }
  for (const [key, bucket] of buckets) {
    const h = catalogKeySignature(bucket);
    if (key.startsWith("a:")) sources[key.slice(2)] = h;
    else cats[key] = h;
  }
  return { cats, sources };
}

/** 增量点集（纯函数）：键 ∉ 已读集 ∪（已读但内容签名变了——hashes 缺省的存量记录视为未变，
 *  升级首日不给老用户整屏刷点）。UI 以 `computeKeyHashes(现挂目录)` 的输出作 current 传入。 */
export function unreadDiscoverKeys(
  reads: DiscoverReads,
  keys: { cats: readonly string[]; sources: readonly string[] },
  current: DiscoverHashes,
): { cats: string[]; sources: string[] } {
  const unreadOf = (
    all: readonly string[],
    readSet: readonly string[],
    stored: Record<string, string> | undefined,
    cur: Record<string, string> | undefined,
  ): string[] =>
    all.filter((k) => {
      if (!readSet.includes(k)) return true;
      const s = stored?.[k];
      return s !== undefined && cur?.[k] !== s; // 已读但内容变了 → 点重开；存量无签名 = 未变
    });
  return {
    cats: unreadOf(keys.cats, reads.cats, reads.hashes?.cats, current.cats),
    sources: unreadOf(keys.sources, reads.sources, reads.hashes?.sources, current.sources),
  };
}

/** 纯差集：keys 里「还没读」的那些（保序、去重由上游 Set 负责） */
export function unreadKeysOf(keys: readonly string[], read: readonly string[]): string[] {
  const seen = new Set(read);
  return keys.filter((k) => !seen.has(k));
}

/** 持久写入（失败静默——提示状态丢失不影响任何业务事实）；写入后通知 UI 订阅者刷新 */
async function writeReads(next: DiscoverReads): Promise<void> {
  const s = store();
  if (!s) return;
  try {
    await s.set(KEY, next);
  } catch {
    /* 写失败非致命 */
  }
  for (const fn of listeners) fn();
}

const listeners = new Set<() => void>();
/** 订阅已读集变化（UI 挂载期订阅刷新；返回退订函数——authors.ts notify 同款模式） */
export function onDiscoverReadsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 进入分类/作者店 = 该键写入集合并记录当下内容签名（「又上新」重开点的基准，R4-5.6） */
export async function markSeen(kind: "category" | "author", key: string): Promise<void> {
  const k = key.trim();
  if (!k) return;
  const reads = await readDiscoverReads();
  const hashes = computeKeyHashes(getCatalogResult().entries);
  const hash = (kind === "category" ? hashes.cats : hashes.sources)?.[k] ?? "";
  if (kind === "category") {
    if (reads.cats.includes(k) && reads.hashes?.cats?.[k] === hash) return;
    await writeReads({
      ...reads,
      cats: reads.cats.includes(k) ? reads.cats : [...reads.cats, k],
      hashes: { ...reads.hashes, cats: { ...reads.hashes?.cats, [k]: hash } },
    });
  } else {
    if (reads.sources.includes(k) && reads.hashes?.sources?.[k] === hash) return;
    await writeReads({
      ...reads,
      sources: reads.sources.includes(k) ? reads.sources : [...reads.sources, k],
      hashes: { ...reads.hashes, sources: { ...reads.hashes?.sources, [k]: hash } },
    });
  }
}

/**
 * 全部已读（仅清发现型——⛔ 不碰 updates 数字）。
 * @returns `{ cleared }` = 本次实际清掉的发现点数量（已读集合里已有的不重复计）
 */
export async function markAllRead(kind: DiscoverReadKind): Promise<{ cleared: number }> {
  const reads = await readDiscoverReads();
  const keys = catalogKeys();
  const hashes = computeKeyHashes(getCatalogResult().entries);
  const pickCats = kind === "category" || kind === "all";
  const pickSources = kind === "author" || kind === "all";

  const newCats = pickCats ? unreadKeysOf(keys.cats, reads.cats) : [];
  const newSources = pickSources ? unreadKeysOf(keys.sources, reads.sources) : [];

  const next: DiscoverReads = {
    cats: newCats.length > 0 ? [...reads.cats, ...newCats] : reads.cats,
    sources: newSources.length > 0 ? [...reads.sources, ...newSources] : reads.sources,
    // 「全部」才推进全局时间锚；单类清点不动 until（否则会连带清掉另一类的点）
    until: kind === "all" ? Date.now() : reads.until,
    // 当前全量键的签名落基准——此后内容签名不变则不再有点（R4-5.6）
    hashes: pickCats && pickSources ? { ...hashes } : {
      cats: pickCats ? hashes.cats : reads.hashes?.cats,
      sources: pickSources ? hashes.sources : reads.hashes?.sources,
    },
  };
  const changed =
    next.cats !== reads.cats || next.sources !== reads.sources || next.until !== reads.until;
  if (changed) await writeReads(next);
  return { cleared: newCats.length + newSources.length };
}
