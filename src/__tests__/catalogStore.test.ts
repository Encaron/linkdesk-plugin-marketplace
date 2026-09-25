/**
 * catalogStore 单测——市场目录共享 store（E6#152 必做②；此前零测试）。
 *
 * 替身口径：目录 IO 走兄弟模块的既有注入点 `marketSources.__setCatalogIO(fetchFn, storage)`
 * （本仓惯例，不新造替身面）；壳面只桩 `configuration.{get,onChange}` 与 `events`。
 * 假目录文本用虚构条目（硬约束 21）。
 *
 * 🔴 本文件每个用例取全新模块实例（`vi.resetModules()` + 动态 import）——本 store 是模块单例：
 *   `_catalogPromise`（防并发）/ `_catalogResolvedOnce`（加载中 vs 真离线）/ `_catalogResult`
 *   / `_catalogListeners` / `_configWatchStarted`（模块级常驻订阅守卫）。不重置会跨例串味。
 *
 * 钉住的三件事：
 *   ① 加载态迁移与「resolved 后即便 offline 也是真实空态」（ExploreView 据此防闪一帧「无法加载」）；
 *   ② 源配置变更 → 模块级常驻订阅只注册一次、触发即强拉 + 通知全部订阅方；
 *   ③ 失败 toast 的显示名走 `pluginDisplayNameOf`——不在目录 = **裸 pluginId 诚实显示**。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { FetchFn, StorageLike } from "../services/marketSources";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

let onChangeFn: ReturnType<typeof vi.fn>;
let unsubConfigs: { n: number };
let fetchCalls: string[];

function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** marketplace.json 文本（虚构条目） */
function catalogText(ids: Array<{ id: string; name: string; version?: string }>): string {
  return JSON.stringify({
    version: "1",
    updatedAt: "2026-09-01T00:00:00Z",
    plugins: ids.map((i) => ({
      id: i.id,
      name: i.name,
      version: i.version ?? "1.0.0",
      downloadUrl: `https://example.invalid/releases/${i.id}.linkdesk-plugin`,
    })),
  });
}

/** 可换文本的注入 fetcher——`FetchFn` 契约是 **直接返回目录文本**（`fetchText` 里 `injected(url)` 即返回值）；
 *  每次调用记一笔（断言「拉了几趟」）。失败态必须**抛**（reason=network ⇒ 主状态 offline；
 *  返回坏文本会被判 reason=parse ⇒ corrupt，那是另一回事）。 */
function injectFetch(body: () => string, ok = true) {
  const fn = (async (url: string) => {
    fetchCalls.push(url);
    if (!ok) throw new Error("demo-offline");
    return body();
  }) as unknown as FetchFn;
  return fn;
}

async function boot(o: { text?: () => string; ok?: boolean } = {}) {
  vi.resetModules();
  fetchCalls = [];
  unsubConfigs = { n: 0 };
  onChangeFn = vi.fn(() => () => {
    unsubConfigs.n += 1;
  });
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    configuration: { get: async () => null, onChange: onChangeFn },
    events: { on: () => () => {}, emit: () => {} },
  };
  const ms = await import("../services/marketSources");
  ms.__setCatalogIO(
    injectFetch(o.text ?? (() => catalogText([{ id: "demo-alpha", name: "Demo Alpha" }])), o.ok ?? true),
    fakeStorage(),
  );
  const store = await import("../services/marketplaceShared/catalogStore");
  return { store, ms };
}

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
  vi.restoreAllMocks();
});

describe("加载态迁移（loading 的判据是「有没有 resolved 过」，不是「有没有条目」）", () => {
  it("首挂：loading=true → 目录到了 loading=false 且 entries/state 就位", async () => {
    const { store } = await boot();
    const { result } = renderHook(() => store.useMarketplaceCatalog());
    expect(result.current.loading).toBe(true);

    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.state).toBe("ok");
    expect(result.current.entries.map((e) => e.id)).toEqual(["demo-alpha"]);
    expect(fetchCalls).toHaveLength(1);
  });

  it("🔴 resolved 后即便 offline 也是真实空态（loading=false）——ExploreView 据此不闪「无法加载」", async () => {
    const { store } = await boot({ ok: false, text: () => "" });
    const { result } = renderHook(() => store.useMarketplaceCatalog());
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.state).toBe("offline");
    expect(result.current.entries).toEqual([]);
  });

  it("多个消费者同时挂载 → 只拉一趟（_catalogPromise 防并发）", async () => {
    const { store } = await boot();
    const a = renderHook(() => store.useMarketplaceCatalog());
    const b = renderHook(() => store.useMarketplaceCatalog());
    await flush();

    expect(fetchCalls).toHaveLength(1);
    expect(a.result.current.entries.map((e) => e.id)).toEqual(["demo-alpha"]);
    expect(b.result.current.entries.map((e) => e.id)).toEqual(["demo-alpha"]);
  });
});

describe("refresh（强拉全源——跳过 5min fresh 缓存）", () => {
  it("refresh() 走 forceRefreshCatalog：绕过缓存再拉一趟，新条目进 result", async () => {
    let ids = [{ id: "demo-alpha", name: "Demo Alpha" }];
    const { store } = await boot({ text: () => catalogText(ids) });
    const { result } = renderHook(() => store.useMarketplaceCatalog());
    await flush();
    expect(fetchCalls).toHaveLength(1);

    ids = [
      { id: "demo-alpha", name: "Demo Alpha" },
      { id: "demo-beta", name: "Demo Beta" },
    ];
    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchCalls).toHaveLength(2); // 真重拉（不是读缓存）
    expect(result.current.entries.map((e) => e.id)).toEqual(["demo-alpha", "demo-beta"]);
  });

  it("refresh 把结果推给全部订阅方（两个 hook 都翻新）", async () => {
    let ids = [{ id: "demo-alpha", name: "Demo Alpha" }];
    const { store } = await boot({ text: () => catalogText(ids) });
    const a = renderHook(() => store.useMarketplaceCatalog());
    const b = renderHook(() => store.useMarketplaceCatalog());
    await flush();

    ids = [{ id: "demo-beta", name: "Demo Beta" }];
    await act(async () => {
      await a.result.current.refresh();
    });

    expect(a.result.current.entries.map((e) => e.id)).toEqual(["demo-beta"]);
    expect(b.result.current.entries.map((e) => e.id)).toEqual(["demo-beta"]);
  });
});

describe("源配置变更 → 目录自动刷新（模块级常驻订阅，单一注册守卫）", () => {
  it("挂首个消费者即注册 watch：以 marketplace.marketplaceSources 为键", async () => {
    const { store } = await boot();
    renderHook(() => store.useMarketplaceCatalog());
    await flush();

    expect(onChangeFn).toHaveBeenCalledTimes(1);
    expect(onChangeFn.mock.calls[0][0]).toBe("marketplace.marketplaceSources");
  });

  it("🔴 第二次 mount 不再重复注册（模块级单例——订阅随模块活，不随组件卸载）", async () => {
    const { store } = await boot();
    const a = renderHook(() => store.useMarketplaceCatalog());
    await flush();
    a.unmount();
    renderHook(() => store.useMarketplaceCatalog());
    await flush();

    expect(onChangeFn).toHaveBeenCalledTimes(1);
  });

  it("🔴 watch 触发 → 强拉全部当前源 ＋ 通知订阅方（免等 5min 缓存/免手动）", async () => {
    let ids = [{ id: "demo-alpha", name: "Demo Alpha" }];
    const { store } = await boot({ text: () => catalogText(ids) });
    const { result } = renderHook(() => store.useMarketplaceCatalog());
    await flush();
    expect(fetchCalls).toHaveLength(1);

    ids = [
      { id: "demo-alpha", name: "Demo Alpha" },
      { id: "demo-gamma", name: "Demo Gamma" },
    ];
    const cb = onChangeFn.mock.calls[0][1] as () => void;
    await act(async () => {
      cb();
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });

    expect(fetchCalls).toHaveLength(2);
    expect(result.current.entries.map((e) => e.id)).toEqual(["demo-alpha", "demo-gamma"]);
  });

  it("预览环境无 onChange 面 → 不置守卫位（下次 mount 再试），不崩", async () => {
    const { store } = await boot();
    (window as unknown as { linkdesk: { configuration: { onChange?: unknown } } }).linkdesk.configuration.onChange =
      undefined;
    const { result } = renderHook(() => store.useMarketplaceCatalog());
    await flush();
    expect(result.current.loading).toBe(false);
  });
});

describe("pluginDisplayNameOf（失败 toast 的显示名——不在目录 = 裸 pluginId 诚实显示）", () => {
  it("目录命中 → 用条目显示名", async () => {
    const { store } = await boot();
    renderHook(() => store.useMarketplaceCatalog());
    await flush();
    expect(store.pluginDisplayNameOf("demo-alpha")).toBe("Demo Alpha");
  });

  it("🔴 不在目录 → 裸 pluginId（不编名字）", async () => {
    const { store } = await boot();
    renderHook(() => store.useMarketplaceCatalog());
    await flush();
    expect(store.pluginDisplayNameOf("demo-unknown")).toBe("demo-unknown");
  });

  it("目录从未加载 → 仍是裸 pluginId（初始占位空目录不当数据用）", async () => {
    const { store } = await boot();
    expect(store.pluginDisplayNameOf("demo-alpha")).toBe("demo-alpha");
  });
});

describe("useCatalogEntryById（已装/内置/禁用行「可更新」判定的共用索引）", () => {
  it("按 id 建索引；目录重拉后索引跟着翻新（徽标自动翻新的机制面）", async () => {
    let ids = [{ id: "demo-alpha", name: "Demo Alpha", version: "1.0.0" }];
    const { store } = await boot({ text: () => catalogText(ids) });
    const { result } = renderHook(() => store.useCatalogEntryById());
    await flush();
    expect(result.current.size).toBe(1);
    expect(result.current.get("demo-alpha")?.version).toBe("1.0.0");

    ids = [
      { id: "demo-alpha", name: "Demo Alpha", version: "2.0.0" },
      { id: "demo-beta", name: "Demo Beta" },
    ];
    const cb = onChangeFn.mock.calls[0][1] as () => void;
    await act(async () => {
      cb();
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });

    expect(result.current.size).toBe(2);
    expect(result.current.get("demo-alpha")?.version).toBe("2.0.0");
  });
});
