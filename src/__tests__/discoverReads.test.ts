/**
 * discoverReads —— 发现型已读标记（06 §八·补 · R4-2.5 `marketplace.markAllRead` ＋ R4-5.6 增量点集）。
 *
 * 钉：① 存储形状归一 ② markSeen 持久清除＋签名落基准 ③ markAllRead 三类范围 + cleared 计数
 * ④ **单类清点不推进 until**（否则会连带清掉另一类的点）⑤ 幂等（第二遍 cleared=0）
 * ⑥ unreadDiscoverKeys 增量点集（键 ∉ 读集 ∪「已读但签名变了」；存量无签名 = 未变）。
 */

import { describe, it, expect, afterEach, vi } from "vitest";

/* 目录投影由 catalogStore 唯一属主提供——本域只读它的快照（测试注入条目） */
const catalogBox = vi.hoisted(() => ({ result: { entries: [] as unknown[] } }));
vi.mock("../services/marketplaceShared/catalogStore", () => ({
  getCatalogResult: () => catalogBox.result,
}));

import type { CatalogEntry } from "../services/marketCatalog";
import {
  __setDiscoverReadsStore,
  computeKeyHashes,
  markAllRead,
  markSeen,
  normalizeDiscoverReads,
  readDiscoverReads,
  unreadDiscoverKeys,
  unreadKeysOf,
} from "../services/discoverReads";

function makeStore(initial?: unknown) {
  let stored = initial;
  const get = async <T = unknown>(_key: string): Promise<T | undefined> => stored as T | undefined;
  const set = async (_key: string, v: unknown): Promise<void> => {
    stored = v;
  };
  return { get, set, stored: () => stored };
}

const ENTRIES = [
  { id: "demo-a", name: "Demo A", version: "1.0.0", category: "development", authorId: "owner-two" },
  { id: "demo-b", name: "Demo B", version: "1.0.0", category: "themes", authorId: "owner-three" },
  { id: "demo-c", name: "Demo C", version: "1.0.0", categories: [] }, // 未声明 ⇒ other 桶 + 无作者键
];

afterEach(() => {
  __setDiscoverReadsStore(null);
  catalogBox.result = { entries: [] };
  Reflect.deleteProperty(window, "linkdesk");
});

describe("normalizeDiscoverReads", () => {
  it("空/坏值 ⇒ 默认空集", () => {
    expect(normalizeDiscoverReads(undefined)).toEqual({ sources: [], cats: [], until: 0 });
    expect(normalizeDiscoverReads("nope")).toEqual({ sources: [], cats: [], until: 0 });
  });

  it("只收非空字符串键；until 只收正数", () => {
    expect(
      normalizeDiscoverReads({ sources: ["a", "", 3], cats: ["development"], until: -5 }),
    ).toEqual({ sources: ["a"], cats: ["development"], until: 0 });
  });
});

describe("unreadKeysOf —— 纯差集", () => {
  it("已读集合里的键不算未读，保序", () => {
    expect(unreadKeysOf(["development", "themes", "other"], ["themes"])).toEqual(["development", "other"]);
  });
});

describe("markSeen —— 进入即已读的唯一写入口", () => {
  it("分类/作者各写各的集合（R4-5.6 起同笔落逐键签名），重复写不产生重复项", async () => {
    catalogBox.result = { entries: ENTRIES }; // 签名从目录桶算——空目录给不了基准
    const s = makeStore(undefined);
    __setDiscoverReadsStore(s);
    await markSeen("category", "development");
    await markSeen("category", "development");
    await markSeen("author", "owner-two");
    const r = await readDiscoverReads();
    expect(r.cats).toEqual(["development"]);
    expect(r.sources).toEqual(["owner-two"]);
    expect(r.until).toBe(0);
    // 签名落基准（「又上新」重开点的判据——catalogKeySignature 值非空即可）
    expect(r.hashes?.cats?.development).toBeTruthy();
    expect(r.hashes?.sources?.["owner-two"]).toBeTruthy();
  });
});

describe("markAllRead", () => {
  it("category：只清分类点（development/themes/other = 3），不推进 until", async () => {
    catalogBox.result = { entries: ENTRIES };
    const s = makeStore(undefined);
    __setDiscoverReadsStore(s);

    expect(await markAllRead("category")).toEqual({ cleared: 3 });
    const stored = s.stored() as { cats: string[]; sources: string[]; until: number };
    expect(stored.cats.sort()).toEqual(["development", "other", "themes"]);
    expect(stored.sources).toEqual([]);
    expect(stored.until).toBe(0);
  });

  it("author：只清作者点（owner-two / owner-three = 2；无 authorId 的条目不计）", async () => {
    catalogBox.result = { entries: ENTRIES };
    const s = makeStore(undefined);
    __setDiscoverReadsStore(s);

    expect(await markAllRead("author")).toEqual({ cleared: 2 });
    const stored = s.stored() as { sources: string[]; cats: string[]; until: number };
    expect(stored.sources.sort()).toEqual(["owner-three", "owner-two"]);
    expect(stored.cats).toEqual([]);
    expect(stored.until).toBe(0);
  });

  it("all：两类都清并推进 until；第二遍 cleared=0（幂等）", async () => {
    catalogBox.result = { entries: ENTRIES };
    const s = makeStore(undefined);
    __setDiscoverReadsStore(s);

    expect(await markAllRead("all")).toEqual({ cleared: 5 });
    const stored = s.stored() as { until: number };
    expect(stored.until).toBeGreaterThan(0);

    expect(await markAllRead("all")).toEqual({ cleared: 0 });
  });

  it("持久面无 pluginState ⇒ 不崩，回执 cleared 仍按目录算（状态丢弃）", async () => {
    catalogBox.result = { entries: ENTRIES };
    __setDiscoverReadsStore(null);
    Object.defineProperty(window, "linkdesk", { value: {}, configurable: true });
    expect(await markAllRead("all")).toEqual({ cleared: 5 });
  });
});

describe("unreadDiscoverKeys —— 增量点集（R4-5.6）", () => {
  const CURRENT = { cats: { development: "h1", themes: "h2" }, sources: { "owner-two": "h3" } };
  const KEYS = { cats: ["development", "themes"], sources: ["owner-two"] };

  it("未读键全算未读；已读键签名未变不重开", () => {
    const reads = { sources: ["owner-two"], cats: ["development"], until: 0, hashes: CURRENT };
    expect(unreadDiscoverKeys(reads, KEYS, CURRENT)).toEqual({ cats: ["themes"], sources: [] });
  });

  it("已读但签名变了（同一分类又上新）→ 点重开", () => {
    const reads = {
      sources: ["owner-two"],
      cats: ["development"],
      until: 0,
      hashes: { cats: { development: "old" }, sources: { "owner-two": "h3" } },
    };
    expect(unreadDiscoverKeys(reads, KEYS, CURRENT)).toEqual({ cats: ["development", "themes"], sources: [] });
  });

  it("存量记录无签名（升级前）→ 视为未变，不给老用户整屏刷点", () => {
    const reads = { sources: ["owner-two"], cats: ["development"], until: 0 };
    expect(unreadDiscoverKeys(reads, KEYS, CURRENT)).toEqual({ cats: ["themes"], sources: [] });
  });
});

describe("computeKeyHashes —— 逐桶/逐作者签名（与全目录同一哈希域）", () => {
  it("同内容恒等；桶内顺序变了签名变（顺序 = 合集/榜单的展示事实）", () => {
    const base: CatalogEntry[] = [
      { id: "demo-a", name: "Demo A", version: "1.0.0", category: "development", authorId: "owner-two" },
      { id: "demo-a2", name: "Demo A2", version: "1.0.0", category: "development", authorId: "owner-two" },
      { id: "demo-b", name: "Demo B", version: "1.0.0", category: "themes", authorId: "owner-three" },
    ];
    const h1 = computeKeyHashes(base);
    expect(h1).toEqual(computeKeyHashes(base));
    expect(h1.cats?.development).toBeTruthy();
    expect(h1.sources?.["owner-two"]).toBeTruthy();
    const reordered = [base[1], base[0], base[2]] as readonly CatalogEntry[]; // development 桶内换序
    const h3 = computeKeyHashes(reordered);
    expect(h3.cats?.development).not.toBe(h1.cats?.development);
  });
});
