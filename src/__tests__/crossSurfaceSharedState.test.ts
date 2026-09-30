/**
 * crossSurfaceSharedState — **多表面共享状态**回归（2026-09-30 立案：多表面模块单例塌缩）。
 *
 * 钉子：SDK 多表面打包把每个 `contributes.views[].render` 编成**独立自包含 bundle**，同一服务模块在
 *   表面之间各有一份模块实例（ESM 身份 = URL）。故本仓的跨表面状态必须住 `realmSlot` 全局槽——
 *   本文件用「同一 realm 里两个模块实例」模拟两个表面，钉住四件事：
 *   ① 搜索词：A 面设的词，B 面读得到，且 B 面注册的监听也收得到通知；
 *   ② 目录投影：A 面「检查更新」重投影后，B 面（新实例）当场读到新目录、且不额外发网络；
 *   ③ 已装列表：A 面拉过一趟，B 面首个消费者**不再重复 IPC**（跨表面只拉一趟）；
 *   ④ 安装 job 镜像：A、B 两面各挂消费方，**只有一条**壳事件订阅（引用计数跨表面计数）。
 *
 * 手法：`vi.resetModules()` ＋ 动态 `import()` 取第二个模块实例（**不 `vi.mock` 本仓模块**——槽共享
 *   正是被测对象）。每例前由 `vitest.setup.ts` 清槽（`__resetRealmSlots`）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { FetchFn, StorageLike } from "../services/marketSources";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

let fetchCalls: string[];
let listCalls: number;
let eventsOnCalls: number;
let emitInstallJobs: ((payload: { jobs: unknown[] }) => void) | null;

function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function catalogText(): string {
  return JSON.stringify({
    version: "1",
    updatedAt: "2026-09-30T00:00:00Z",
    plugins: [
      { id: "demo-alpha", name: "Demo Alpha", version: "2.0.0", downloadUrl: "https://example.invalid/a.linkdesk-plugin" },
    ],
  });
}

/** 桩壳面：足够目录腿（configuration）+ 已装列表（pluginManager）+ job 广播（events.on）跑起来 */
function stubShell(): void {
  Object.defineProperty(window, "linkdesk", {
    value: {
      pluginManager: {
        list: async () => {
          listCalls += 1;
          return [{ pluginId: "demo-alpha", manifest: { name: "Demo Alpha", version: "1.0.0", core: false }, updatable: true }];
        },
        getDisabled: async () => [],
      },
      notifications: { show: vi.fn(async () => undefined) },
      configuration: { get: async () => null },
      events: {
        on: (_channel: string, handler: (payload: { jobs: unknown[] }) => void) => {
          eventsOnCalls += 1;
          emitInstallJobs = handler;
          return () => {
            emitInstallJobs = null;
          };
        },
        emit: () => undefined,
      },
    },
    configurable: true,
  });
}

beforeEach(() => {
  fetchCalls = [];
  listCalls = 0;
  eventsOnCalls = 0;
  emitInstallJobs = null;
  stubShell();
});

afterEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  vi.restoreAllMocks();
});

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

describe("① 搜索词跨表面（SearchView 面设词 → 列表那些面同步过滤）", () => {
  it("A 面 setMarketplaceSearch ⇒ B 面（另一实例）读到；B 面注册的监听也收到通知", async () => {
    vi.resetModules();
    const a = await import("../services/marketplaceShared/searchState");
    vi.resetModules();
    const b = await import("../services/marketplaceShared/searchState");

    const heardInB = vi.fn();
    b.onMarketplaceSearchChange(heardInB);

    a.setMarketplaceSearch("demo");

    expect(b.getMarketplaceSearch()).toBe("demo"); // 旧病：B 面读自己那份 ""（列表不过滤）
    expect(heardInB).toHaveBeenCalledTimes(1);
  });
});

describe("② 目录投影跨表面（侧栏点检查更新 → 详情面读到新目录）", () => {
  it("A 面 reprojectCatalog ⇒ B 面（新实例）当场读到新条目，且全程只 1 次网络", async () => {
    vi.resetModules();
    const ms = await import("../services/marketSources");
    ms.__setCatalogIO(
      (async (url: string) => {
        fetchCalls.push(url);
        return catalogText();
      }) as unknown as FetchFn,
      fakeStorage(),
    );
    const a = await import("../services/marketplaceShared/catalogStore");
    await a.reprojectCatalog();

    vi.resetModules();
    const b = await import("../services/marketplaceShared/catalogStore");

    expect(b.pluginDisplayNameOf("demo-alpha")).toBe("Demo Alpha"); // 旧病：B 面读自己那份空投影 ⇒ 裸 id
    expect(fetchCalls).toHaveLength(1);
  });
});

describe("③ 已装列表跨表面（只拉一趟 IPC，数据全体共用）", () => {
  it("A 面挂载拉过 ⇒ B 面（另一实例）首个消费者直接吃同一份数据，不再重复 IPC", async () => {
    vi.resetModules();
    const a = await import("../services/marketplaceShared/pluginsStore");
    const ha = renderHook(() => a.useMarketplacePlugins());
    await flush();
    expect(listCalls).toBe(1);
    expect(ha.result.current.all).toHaveLength(1);

    vi.resetModules();
    const b = await import("../services/marketplaceShared/pluginsStore");
    const hb = renderHook(() => b.useMarketplacePlugins());
    await flush();

    expect(listCalls).toBe(1); // 旧病：B 面自己那份 loadingPromise 为 null ⇒ 再拉一趟（两面各存各的）
    expect(hb.result.current.all.map((p) => p.pluginId)).toEqual(["demo-alpha"]);
    expect(hb.result.current.installed).toHaveLength(1);
  });
});

describe("④ 安装 job 镜像跨表面（一条壳事件订阅，两面读同一张表）", () => {
  it("A、B 两面各挂消费方 ⇒ 只订阅一次；广播一来两面都读到", async () => {
    vi.resetModules();
    const a = await import("../services/installJobs");
    vi.resetModules();
    const b = await import("../services/installJobs");

    const ha = renderHook(() => a.useInstallJob("demo-alpha"));
    const hb = renderHook(() => b.useInstallJob("demo-alpha"));

    expect(eventsOnCalls).toBe(1); // 旧病：两面各订一条 IPC 监听

    await act(async () => {
      emitInstallJobs?.({ jobs: [{ jobId: "j1", pluginId: "demo-alpha", origin: "user", displayName: "Demo Alpha", state: "running", stage: "downloading", percent: 42 }] });
    });

    expect(ha.result.current?.jobId).toBe("j1");
    expect(hb.result.current?.jobId).toBe("j1");
  });
});
