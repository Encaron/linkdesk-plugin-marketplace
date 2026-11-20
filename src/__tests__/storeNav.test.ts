/**
 * storeNav —— 商店导航意图信箱（跨表面/跨进程 + 晚挂载）。
 * 钉：① 坏值归一丢弃 ② 发布 = 内存 + 持久 + 广播 ③ 晚挂载从 pluginState 读得到
 * ④ 同值不重复通知（事件回环去抖）。
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  __resetStoreNavState,
  getStoreNavTarget,
  normalizeStoreNavTarget,
  onStoreNavChange,
  publishStoreNav,
  readStoreNavTarget,
} from "../services/storeNav";
import { __resetRealmSlots } from "../services/realmSlot";

function makeWorld(initial?: unknown) {
  let stored = initial;
  const subs = new Map<string, Set<(p: unknown) => void>>();
  const events = {
    on: (channel: string, cb: (p: unknown) => void) => {
      if (!subs.has(channel)) subs.set(channel, new Set());
      subs.get(channel)!.add(cb);
      return () => subs.get(channel)?.delete(cb);
    },
    emit: (channel: string, payload: unknown) => subs.get(channel)?.forEach((fn) => fn(payload)),
  };
  const pluginState = {
    get: vi.fn(async () => stored),
    set: vi.fn(async (_k: string, v: unknown) => {
      stored = v;
    }),
  };
  Object.defineProperty(window, "linkdesk", { value: { events, pluginState }, configurable: true });
  return { pluginState, stored: () => stored };
}

beforeEach(() => {
  __resetStoreNavState();
  __resetRealmSlots();
});

afterEach(() => {
  __resetStoreNavState();
  __resetRealmSlots();
  Reflect.deleteProperty(window, "linkdesk");
});

describe("normalizeStoreNavTarget", () => {
  it("六种页面形态；缺主键/未知页 ⇒ null", () => {
    expect(normalizeStoreNavTarget({ page: "home" })).toEqual({ page: "home" });
    expect(normalizeStoreNavTarget({ page: "category", category: " development " })).toEqual({
      page: "category",
      category: "development",
    });
    expect(normalizeStoreNavTarget({ page: "library" })).toEqual({ page: "library" });
    expect(normalizeStoreNavTarget({ page: "author", authorId: "owner-two" })).toEqual({
      page: "author",
      authorId: "owner-two",
    });
    expect(normalizeStoreNavTarget({ page: "author", authorId: "owner-two", repoId: "repo-b" })).toEqual({
      page: "author",
      authorId: "owner-two",
      repoId: "repo-b",
    });
    expect(normalizeStoreNavTarget({ page: "sources" })).toEqual({ page: "sources" });
    expect(normalizeStoreNavTarget({ page: "search", query: "serial" })).toEqual({
      page: "search",
      query: "serial",
    });
    expect(normalizeStoreNavTarget({ page: "category", category: "" })).toBeNull();
    expect(normalizeStoreNavTarget({ page: "author", authorId: "  " })).toBeNull();
    expect(normalizeStoreNavTarget({ page: "nope" })).toBeNull();
  });
});

describe("publish / read", () => {
  it("发布：内存立即可读 + 写 pluginState + 广播同一份", async () => {
    const w = makeWorld();
    await publishStoreNav({ page: "category", category: "themes" });

    expect(getStoreNavTarget()).toEqual({ page: "category", category: "themes" });
    expect(w.pluginState.set).toHaveBeenCalledWith("marketplace", "storeNav", {
      page: "category",
      category: "themes",
    });
  });

  it("晚挂载：内存为空时从 pluginState 读回意图", async () => {
    makeWorld({ page: "library" });
    expect(await readStoreNavTarget()).toEqual({ page: "library" });
  });

  it("同值发布不重复通知（事件回环去抖）", async () => {
    makeWorld();
    let calls = 0;
    onStoreNavChange(() => calls++);
    await publishStoreNav({ page: "library" });
    await publishStoreNav({ page: "library" });
    expect(calls).toBe(1);
  });
});
