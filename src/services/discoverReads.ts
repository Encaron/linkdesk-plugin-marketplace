/**
 * discoverReads —— 发现型已读标记的**数据面唯一属主**（06 §八·补，R4-2.5 `marketplace.markAllRead`）。
 *
 * 存储（正典 06 §八·补）：`pluginState("marketplace", "discoverReads")` →
 * `{ sources: 已读来源键[], cats: 已读分类 slug[], until: 最后全读时间戳 }`。
 *
 * 本文件负责三件事（棒 6/7 的「进入即已读」是同一域的下游写入，⛔ 另起一份）：
 *   ① 读/写归一（坏值折默认，不崩）；
 *   ② `markSeen(kind, key)`——进入分类/作者店时持久清除该键（棒 6/7 调用）；
 *   ③ `markAllRead(kind)`——「全部已读」：把**当前目录里还没读过的键**并入集合并推进 `until`，
 *      回执 `{ cleared }` = 本次实际清掉的键数（⛔ 不碰任务型更新数字——updates 真相源独立）。
 *
 * ⚠️ **「新内容」的增量判据（contentHash）属棒 15 #12/棒 6 消费面**：本棒只落存储 + 已读写入 +
 *   全清命令，`until` 先把时间锚留下；将来「同一分类又上新」靠 contentHash 变化重开点，
 *   届时改的是 unread 计算，不改存储形状。
 */

import { primaryCategoryOf } from "./marketCatalog";
import { getCatalogResult } from "./marketplaceShared/catalogStore";

export type DiscoverReadKind = "category" | "author" | "all";

export interface DiscoverReads {
  sources: string[];
  cats: string[];
  /** 最后一次「全部已读」时刻（ms）；0 = 从未全读 */
  until: number;
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
  return {
    sources: stringSet(r.sources),
    cats: stringSet(r.cats),
    until: typeof r.until === "number" && r.until > 0 ? r.until : 0,
  };
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

/** 当前目录里的「分类键 / 作者键」——已读点挂在分类项与作者项上（08 §三·95） */
function catalogKeys(): { cats: string[]; sources: string[] } {
  const result = getCatalogResult();
  const cats = new Set<string>();
  const sources = new Set<string>();
  for (const entry of result.entries) {
    cats.add(primaryCategoryOf(entry));
    // 作者项身份：authorId 优先（v2 聚合键）；旧条目无 authorId 时退回来源仓库名
    const authorKey = entry.authorId?.trim() || entry.sourceName?.trim();
    if (authorKey) sources.add(authorKey);
  }
  return { cats: [...cats], sources: [...sources] };
}

/** 纯差集：keys 里「还没读」的那些（保序、去重由上游 Set 负责） */
export function unreadKeysOf(keys: readonly string[], read: readonly string[]): string[] {
  const seen = new Set(read);
  return keys.filter((k) => !seen.has(k));
}

/** 持久写入（失败静默——提示状态丢失不影响任何业务事实） */
async function writeReads(next: DiscoverReads): Promise<void> {
  const s = store();
  if (!s) return;
  try {
    await s.set(KEY, next);
  } catch {
    /* 写失败非致命 */
  }
}

/** 进入分类/作者店 = 该键写入集合（棒 6/7 的唯一写入口） */
export async function markSeen(kind: "category" | "author", key: string): Promise<void> {
  const k = key.trim();
  if (!k) return;
  const reads = await readDiscoverReads();
  if (kind === "category") {
    if (reads.cats.includes(k)) return;
    await writeReads({ ...reads, cats: [...reads.cats, k] });
  } else {
    if (reads.sources.includes(k)) return;
    await writeReads({ ...reads, sources: [...reads.sources, k] });
  }
}

/**
 * 全部已读（仅清发现型——⛔ 不碰 updates 数字）。
 * @returns `{ cleared }` = 本次实际清掉的发现点数量（已读集合里已有的不重复计）
 */
export async function markAllRead(kind: DiscoverReadKind): Promise<{ cleared: number }> {
  const reads = await readDiscoverReads();
  const keys = catalogKeys();
  const pickCats = kind === "category" || kind === "all";
  const pickSources = kind === "author" || kind === "all";

  const newCats = pickCats ? unreadKeysOf(keys.cats, reads.cats) : [];
  const newSources = pickSources ? unreadKeysOf(keys.sources, reads.sources) : [];

  const next: DiscoverReads = {
    cats: newCats.length > 0 ? [...reads.cats, ...newCats] : reads.cats,
    sources: newSources.length > 0 ? [...reads.sources, ...newSources] : reads.sources,
    // 「全部」才推进全局时间锚；单类清点不动 until（否则会连带清掉另一类的点）
    until: kind === "all" ? Date.now() : reads.until,
  };
  const changed =
    next.cats !== reads.cats || next.sources !== reads.sources || next.until !== reads.until;
  if (changed) await writeReads(next);
  return { cleared: newCats.length + newSources.length };
}
