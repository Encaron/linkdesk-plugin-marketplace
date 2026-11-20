/**
 * discoverReads —— 发现型已读标记（06 §八·补 · R4-2.5 `marketplace.markAllRead`）。
 *
 * 钉：① 存储形状归一 ② markSeen 持久清除 ③ markAllRead 三类范围 + cleared 计数
 * ④ **单类清点不推进 until**（否则会连带清掉另一类的点）⑤ 幂等（第二遍 cleared=0）。
 */

import { describe, it, expect, afterEach, vi } from "vitest";

/* 目录投影由 catalogStore 唯一属主提供——本域只读它的快照（测试注入条目） */
const catalogBox = vi.hoisted(() => ({ result: { entries: [] as unknown[] } }));
vi.mock("../services/marketplaceShared/catalogStore", () => ({
  getCatalogResult: () => catalogBox.result,
}));

import {
  __setDiscoverReadsStore,
  markAllRead,
  markSeen,
  normalizeDiscoverReads,
  readDiscoverReads,
  unreadKeysOf,
} from "../services/discoverReads";

function makeStore(initial?: unknown) {
  let stored = initial;
  const get = vi.fn(async () => stored);
  const set = vi.fn(async (_key: string, v: unknown) => {
    stored = v;
  });
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
  it("分类/作者各写各的集合，重复写不产生重复项", async () => {
    const s = makeStore(undefined);
    __setDiscoverReadsStore(s);
    await markSeen("category", "development");
    await markSeen("category", "development");
    await markSeen("author", "owner-two");
    expect(await readDiscoverReads()).toEqual({
      sources: ["owner-two"],
      cats: ["development"],
      until: 0,
    });
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
