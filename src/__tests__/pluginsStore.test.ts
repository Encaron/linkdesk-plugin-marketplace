/**
 * pluginsStore 单测——已装/内置/已禁用列表 store（E6#152 必做①；此前零测试，且它是**全仓 UI 的数据源**）。
 *
 * 替身口径：只桩 `window.linkdesk.pluginManager.{list,getDisabled}` 与 `events.{on,emit}`——
 * 假清单用**本仓契约形状**（`@linkdesk/contracts` 的 PluginListEntry / PluginInfoEntry），
 * 不用真插件名（硬约束 21）。
 *
 * 🔴 本文件每个用例取**全新模块实例**（`vi.resetModules()` + 动态 import）：本仓 store 是模块单例
 *   （`_loadingPromise` / `_allPlugins` / `_disabledPlugins` / `_dataListeners` / `_refreshQueued`），
 *   不重置会跨例串味。这是本层「模块级 store 要重置」纪律的落点。
 *
 * 钉住的四件事：
 *   ① `_loadingPromise` 盾——多个视图同时 mount 只发一趟 IPC（对标 loader 的 #59c Bug 1 教训）；
 *   ② 分组口径——installed = 非 core、builtin = core、disabled 来自 getDisabled（list 排除禁用）；
 *   ③ badge 广播——三个 viewId 各一条，`explore` **不发**（橱窗不是计数列表）；
 *   ④ 生命周期三通道订阅 ＋ 卸载全撤（铁律 19）＋ burst 合并（一次装卸连发多条只重拉一次）
 *      ——🔴 E6#152 修：修前三条订阅注册在 async `init()` 内、「卸载全撤」只对 viewContainer 那条成立，
 *      本文件当时**故意不写断言**（不把待裁决缺陷固化成正典）；修后四条全撤已成契约，断言就位。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { PluginListEntry, PluginInfoEntry } from "@linkdesk/contracts";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

type Handler = (payload?: unknown) => void;
type Emitted = { event: string; payload: { viewId?: string; count?: number; event?: string } };

let listFn: ReturnType<typeof vi.fn>;
let disabledFn: ReturnType<typeof vi.fn>;
let handlers: Map<string, Handler>;
let unsubs: { n: number };
let emitted: Emitted[];

/** 已装（启用）清单条目——契约形状 */
function enabled(pluginId: string, core: boolean): PluginListEntry {
  return { pluginId, manifest: { name: `Demo ${pluginId}`, description: `Demo ${pluginId} desc`, version: "1.0.0", core } };
}

/** 禁用清单条目——契约形状（getDisabled 子集，带 core 旗标） */
function disabled(pluginId: string, core = false): PluginInfoEntry {
  return { pluginId, name: `Demo ${pluginId}`, description: `Demo ${pluginId} desc`, version: "1.0.0", core };
}

/** 每个用例一份全新模块实例 + 全新壳面 */
async function boot(o: { plugins?: PluginListEntry[]; disabledList?: PluginInfoEntry[] } = {}) {
  vi.resetModules();
  listFn = vi.fn(async () => o.plugins ?? []);
  disabledFn = vi.fn(async () => o.disabledList ?? []);
  handlers = new Map();
  unsubs = { n: 0 };
  emitted = [];
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    pluginManager: { list: listFn, getDisabled: disabledFn },
    events: {
      on: (ev: string, cb: Handler) => {
        handlers.set(ev, cb);
        return () => {
          unsubs.n += 1;
          handlers.delete(ev);
        };
      },
      emit: (event: string, payload: unknown) => {
        emitted.push({ event, payload: payload as Emitted["payload"] });
      },
    },
  };
  const store = await import("../services/marketplaceShared/pluginsStore");
  const search = await import("../services/marketplaceShared/searchState");
  return { store, search };
}

/** 冲干净 scheduleDataRefresh 的 microtask 链（refreshData 是 async，之后才 notify） */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = {};
});

afterEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
});

describe("装载与分组（installed / builtin / disabled 三组口径）", () => {
  it("一次装载：核心旗标分组——installed = 非 core、builtin = core；all 为未过滤全量", async () => {
    const { store } = await boot({
      plugins: [enabled("demo-alpha", false), enabled("demo-core-one", true)],
      disabledList: [disabled("demo-beta")],
    });
    const { result } = renderHook(() => store.useMarketplacePlugins());
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.installed.map((p) => p.pluginId)).toEqual(["demo-alpha"]);
    expect(result.current.builtin.map((p) => p.pluginId)).toEqual(["demo-core-one"]);
    expect(result.current.disabled.map((p) => p.pluginId)).toEqual(["demo-beta"]);
    expect(result.current.all).toHaveLength(2);
    expect(listFn).toHaveBeenCalledTimes(1);
    expect(disabledFn).toHaveBeenCalledTimes(1);
  });

  it("🔴 `_loadingPromise` 盾：两个视图同时 mount → 只发一趟 IPC", async () => {
    const { store } = await boot({ plugins: [enabled("demo-alpha", false)] });
    const a = renderHook(() => store.useMarketplacePlugins());
    const b = renderHook(() => store.useMarketplacePlugins());
    await flush();

    expect(listFn).toHaveBeenCalledTimes(1);
    expect(disabledFn).toHaveBeenCalledTimes(1);
    expect(a.result.current.installed.map((p) => p.pluginId)).toEqual(["demo-alpha"]);
    expect(b.result.current.installed.map((p) => p.pluginId)).toEqual(["demo-alpha"]);
  });

  it("IPC 失败 → 不崩，列表退化为空（数据可能为空，界面自己走空态）", async () => {
    const { store } = await boot();
    listFn.mockRejectedValueOnce(new Error("IPC 挂了"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => store.useMarketplacePlugins());
    await flush();
    spy.mockRestore();

    expect(result.current.all).toEqual([]);
    expect(result.current.installed).toEqual([]);
  });
});

describe("badge 广播（壳侧 ViewContainerService 的计数来源）", () => {
  it("三个 viewId 各一条：installed / builtin / disabled 计数；`explore` 不发", async () => {
    const { store } = await boot({
      plugins: [enabled("demo-alpha", false), enabled("demo-gamma", false), enabled("demo-core-one", true)],
      disabledList: [disabled("demo-beta")],
    });
    renderHook(() => store.useMarketplacePlugins());
    await flush();

    const badges = emitted.filter((e) => e.event === "marketplace:updateBadge");
    expect(badges.map((b) => [b.payload.viewId, b.payload.count])).toEqual([
      ["installed", 2],
      ["builtin", 1],
      ["disabled", 1],
    ]);
    // 面板身份随行（插件自持身份——壳侧零硬编码，硬约束 10）
    for (const b of badges) {
      expect((b.payload as { pluginId?: string }).pluginId).toBe("marketplace");
      expect((b.payload as { containerId?: string }).containerId).toBe("marketplace");
    }
    expect(badges.some((b) => b.payload.viewId === "explore")).toBe(false);
  });

  it("数据未到时不空跑 badge（先 await IPC 再 emit）", async () => {
    const { store } = await boot();
    renderHook(() => store.useMarketplacePlugins());
    // 同步段：IPC 还没 resolve
    expect(emitted.filter((e) => e.event === "marketplace:updateBadge")).toHaveLength(0);
    await flush();
    expect(emitted.filter((e) => e.event === "marketplace:updateBadge")).toHaveLength(3);
  });
});

describe("生命周期订阅（装卸/启停 ⇒ 自动重拉 ＋ badge 翻新）", () => {
  it("四条订阅都订上：三条生命周期通道 ＋ viewContainer:changed 兜底", async () => {
    const { store } = await boot();
    renderHook(() => store.useMarketplacePlugins());
    await flush();
    expect([...handlers.keys()].sort()).toEqual([
      "plugin-lifecycle:changed",
      "plugin:installed",
      "plugin:uninstalled",
      "viewContainer:changed",
    ]);
  });

  it("plugin:installed 触发 → 重拉已装列表 ＋ badge 重发（新插件立刻进计数）", async () => {
    const { store } = await boot({ plugins: [enabled("demo-alpha", false)] });
    renderHook(() => store.useMarketplacePlugins());
    await flush();
    expect(listFn).toHaveBeenCalledTimes(1);

    listFn.mockResolvedValue([enabled("demo-alpha", false), enabled("demo-delta", false)]);
    handlers.get("plugin:installed")?.({ pluginId: "demo-delta" });
    await flush();

    expect(listFn).toHaveBeenCalledTimes(2);
    const badges = emitted.filter((e) => e.event === "marketplace:updateBadge");
    expect(badges[badges.length - 3].payload.count).toBe(2); // 最后三条里的 installed = 2
  });

  it("🔴 burst 合并：一次装卸连发多条广播 → microtask 内只重拉一次（实机 4 条）", async () => {
    const { store } = await boot();
    renderHook(() => store.useMarketplacePlugins());
    await flush();
    expect(listFn).toHaveBeenCalledTimes(1);

    const onInstalled = handlers.get("plugin:installed");
    onInstalled?.({ pluginId: "demo-alpha" });
    onInstalled?.({ pluginId: "demo-beta" });
    onInstalled?.({ pluginId: "demo-gamma" });
    onInstalled?.({ pluginId: "demo-delta" });
    await flush();

    expect(listFn).toHaveBeenCalledTimes(2); // 不是 5
  });

  it("🔴 卸载即撤订阅：四条通道全部脱钩（铁律 19）", async () => {
    const { store } = await boot();
    const { unmount } = renderHook(() => store.useMarketplacePlugins());
    await flush();
    expect(handlers.size).toBe(4);

    unmount();
    // E6#152 修后：三条生命周期订阅也撤了（修前它们注册在 async `init()` 内部、清理函数交给了 init 的
    // promise ⇒ 卸载后仍在册，壳侧一条广播触发 N 次重拉、已卸载组件的 setTick 仍被调用；同一 hook 里
    // viewContainer:changed 那条却「卸载即撤」——对照即证据）
    expect([...handlers.keys()]).toEqual([]);
    expect(unsubs.n).toBe(4);
  });

  it("🔴 卸载后再来生命周期广播 → 无人接（订阅真脱钩，不是「撤了还留着」）", async () => {
    const { store } = await boot();
    const { unmount } = renderHook(() => store.useMarketplacePlugins());
    await flush();
    expect(listFn).toHaveBeenCalledTimes(1);

    unmount();
    // 通道已从 handlers 移除 ⇒ 连触发都触发不到（修前这里仍取得到回调、并再拉一趟）
    handlers.get("plugin:installed")?.({ pluginId: "demo-alpha" });
    await flush();
    expect(handlers.get("plugin:installed")).toBeUndefined();
    expect(listFn).toHaveBeenCalledTimes(1);
  });

  it("viewContainer:changed 只认本容器的 id（别家容器变动不白跑 badge）", async () => {
    const { store } = await boot();
    renderHook(() => store.useMarketplacePlugins());
    await flush();
    const before = emitted.filter((e) => e.event === "marketplace:updateBadge").length;

    handlers.get("viewContainer:changed")?.({ containerId: "demo-other" });
    await flush();
    expect(emitted.filter((e) => e.event === "marketplace:updateBadge")).toHaveLength(before);

    handlers.get("viewContainer:changed")?.({ containerId: "marketplace" });
    await flush();
    expect(emitted.filter((e) => e.event === "marketplace:updateBadge")).toHaveLength(before + 3);
  });
});

describe("搜索过滤（列表按搜索词过滤；disabledRaw 不受串扰）", () => {
  it("搜索词命中 name / pluginId / description 三者任一即保留", async () => {
    const { store, search } = await boot({
      plugins: [enabled("demo-alpha", false), enabled("demo-beta", false)],
      disabledList: [disabled("demo-gamma")],
    });
    const { result } = renderHook(() => store.useMarketplacePlugins());
    await flush();
    expect(result.current.installed).toHaveLength(2);

    act(() => search.setMarketplaceSearch("beta"));
    expect(result.current.installed.map((p) => p.pluginId)).toEqual(["demo-beta"]);

    act(() => search.setMarketplaceSearch("DEMO-GAMMA")); // 大小写不敏感
    expect(result.current.disabled.map((p) => p.pluginId)).toEqual(["demo-gamma"]);
  });

  it("🔴 disabledRaw 恒为未过滤原组——详情视图按 pluginId 精确判禁用，不能被搜索词带偏", async () => {
    const { store, search } = await boot({ disabledList: [disabled("demo-gamma"), disabled("demo-delta")] });
    const { result } = renderHook(() => store.useMarketplacePlugins());
    await flush();

    act(() => search.setMarketplaceSearch("gamma"));
    expect(result.current.disabled.map((p) => p.pluginId)).toEqual(["demo-gamma"]);
    expect(result.current.disabledRaw.map((p) => p.pluginId)).toEqual(["demo-gamma", "demo-delta"]);
  });

  it("搜索词清空 → 全量回来", async () => {
    const { store, search } = await boot({ plugins: [enabled("demo-alpha", false), enabled("demo-beta", false)] });
    const { result } = renderHook(() => store.useMarketplacePlugins());
    await flush();

    act(() => search.setMarketplaceSearch("alpha"));
    expect(result.current.installed).toHaveLength(1);
    act(() => search.setMarketplaceSearch(""));
    expect(result.current.installed).toHaveLength(2);
  });
});

describe("手动 refresh / scheduleDataRefresh", () => {
  it("refresh() 重拉两个读面并把结果推给订阅方", async () => {
    const { store } = await boot({ plugins: [enabled("demo-alpha", false)] });
    const { result } = renderHook(() => store.useMarketplacePlugins());
    await flush();

    listFn.mockResolvedValue([enabled("demo-alpha", false), enabled("demo-epsilon", false)]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(listFn).toHaveBeenCalledTimes(2);
    expect(result.current.installed.map((p) => p.pluginId)).toEqual(["demo-alpha", "demo-epsilon"]);
  });

  it("scheduleDataRefresh 是导出的非组件入口（toast [重试] 成功收敛用）——同样重拉并翻新 badge", async () => {
    const { store } = await boot();
    renderHook(() => store.useMarketplacePlugins());
    await flush();
    expect(listFn).toHaveBeenCalledTimes(1);

    store.scheduleDataRefresh();
    await flush();
    expect(listFn).toHaveBeenCalledTimes(2);
  });
});
