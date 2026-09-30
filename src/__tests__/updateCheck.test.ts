/**
 * updateCheck 单测——手动「检查更新」的唯一动作（05「插件市场·检查更新」）。
 *
 * 替身口径照兄弟文件：目录 IO 走 `marketSources.__setCatalogIO`，记账走 `installedUpdateMeta.__setMetaStore`，
 * 壳面（pluginManager / notifications / configuration）桩 `window.linkdesk`。fixture 全虚构（硬约束 21）。
 * ⚠️ 本文件**不 mock 本仓模块**（不 `vi.mock`）——`vi.resetModules()` 对 mock 过的模块不给新实例，
 *    而目录 store 与发现腿都是**模块单例**，串味后会读到上一条用例留下的投影（实测踩过）。判据一律取
 *    **可观测的下场**（网络调用次数 / 共享投影的内容），不取「某函数被调过」这类内部信号。
 *
 * 钉住六件事：
 *  ① **一次网络**（本设计的核心判据）：先发现（force 强拉并写缓存）后重投影（命中同一份 fresh 缓存）
 *     ——注入 fetcher 数调用次数，多一次即红；
 *  ② 一台没装插件的早退形态也是 1 次网络；
 *  ③ 目录真为空 = 结论（ok/0），不是失败；
 *  ④ 目录拉不到（发现腿 `null`）⇒ failed，且**没走重投影**（走了就会多一趟拉取 ⇒ 2 次即红）；
 *  ⑤ 读盘不可信（IPC 失败）⇒ failed，且**目录一趟都不拉**——「读不到」不许冒充「已是最新」；
 *  ⑥ 用户可见的下场：目录里来了新版本，点一次 ⇒ 共享 store 的**投影当场翻新**（行内徽标读的就是它）。
 * 另有「本函数不抛」的契约用例（扎在上游唯一没被 try 包住的属性访问上），见最后一节。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { PluginListEntry } from "@linkdesk/contracts";
import type { FetchFn, StorageLike } from "../services/marketSources";
import type { MetaStore } from "../services/installedUpdateMeta";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

let fetchCalls: string[];

/** 注入 fetcher——契约是**直接返回目录文本**；`ok:false` 时**抛**（reason=network ⇒ 目录 offline ⇒ 发现腿判不了） */
function injectFetch(body: () => string, ok: boolean): FetchFn {
  return (async (url: string) => {
    fetchCalls.push(url);
    if (!ok) throw new Error("demo-offline");
    return body();
  }) as unknown as FetchFn;
}

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

function metaStore(): MetaStore {
  const map = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return map.get(key) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    },
  };
}

/** 已装插件（manifest 形状照 pluginManager.list 的载荷） */
function enabled(id: string, version: string): PluginListEntry {
  return { pluginId: id, manifest: { name: `Demo ${id}`, version, core: false }, updatable: true } as PluginListEntry;
}

function catalogText(plugins: Array<{ id: string; name: string; version: string }>): string {
  return JSON.stringify({
    version: "1",
    updatedAt: "2026-09-01T00:00:00Z",
    plugins: plugins.map((p) => ({ ...p, downloadUrl: `https://example.invalid/releases/${p.id}.linkdesk-plugin` })),
  });
}

/** 桩壳面（替掉整个 window.linkdesk——发现腿与目录腿都读它） */
function stubShell(o: { list?: () => Promise<PluginListEntry[]>; show?: boolean } = {}) {
  Object.defineProperty(window, "linkdesk", {
    value: {
      pluginManager: { list: o.list ?? (async () => []), getDisabled: async () => [] },
      notifications: o.show === false ? undefined : { show: vi.fn(async () => undefined) },
      configuration: { get: async () => null },
    },
    configurable: true,
  });
}

/** 每例取全新模块实例（目录 store / 发现腿的**共享槽**由 `vitest.setup.ts` 每例前清，2026-09-30 起） */
async function boot(o: { installed?: PluginListEntry[]; text?: () => string; ok?: boolean } = {}) {
  vi.resetModules();
  fetchCalls = [];
  stubShell({ list: async () => o.installed ?? [] });
  const ms = await import("../services/marketSources");
  ms.__setCatalogIO(
    injectFetch(o.text ?? (() => catalogText([{ id: "demo-alpha", name: "Demo Alpha", version: "1.2.0" }])), o.ok ?? true),
    fakeStorage(),
  );
  (await import("../services/installedUpdateMeta")).__setMetaStore(metaStore());
  return {
    store: await import("../services/marketplaceShared/catalogStore"),
    svc: await import("../services/updateCheck"),
  };
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

describe("① 一次网络（顺序不可对调：先发现，后重投影）", () => {
  it("有可更新 ⇒ ok + 计数；全程**只有 1 次网络**（发现腿强拉写缓存，重投影命中它）", async () => {
    const { svc } = await boot({ installed: [enabled("demo-alpha", "1.0.0")] });

    const r = await svc.checkForPluginUpdates();

    expect(r.state).toBe("ok");
    expect(r.updatableCount).toBe(1);
    expect(fetchCalls).toHaveLength(1);
    expect(typeof r.checkedAt).toBe("number");
  });

  it("② 一台没装插件（发现腿在拉目录前早退）⇒ ok/0，网络仍只 1 次（重投影那趟）", async () => {
    const { svc } = await boot({ installed: [] });

    const r = await svc.checkForPluginUpdates();

    expect(r).toMatchObject({ state: "ok", updatableCount: 0 });
    expect(fetchCalls).toHaveLength(1);
  });

  it("③ 目录真为空（源连上、目录合法空态）⇒ 结论「没有可更新」，不是失败", async () => {
    const { svc } = await boot({ installed: [enabled("demo-alpha", "1.0.0")], text: () => catalogText([]) });

    const r = await svc.checkForPluginUpdates();

    expect(r).toMatchObject({ state: "ok", updatableCount: 0 });
  });
});

describe("④⑤ 失败路径——判不了就是判不了，且不重投影", () => {
  it("④ 目录拉不到（发现腿 null）⇒ failed；只拉过发现腿那一趟（重投影若跑会再加一趟）", async () => {
    const { svc } = await boot({ installed: [enabled("demo-alpha", "1.0.0")], ok: false });

    const r = await svc.checkForPluginUpdates();

    expect(r).toMatchObject({ state: "failed", updatableCount: 0 });
    expect(fetchCalls).toHaveLength(1);
  });

  it("⑤ 读盘不可信（list 拒绝）⇒ failed，且**目录一趟都不拉**——「读不到」不冒充「已是最新」", async () => {
    const { svc } = await boot({ installed: [] });
    stubShell({
      list: async () => {
        throw new Error("demo-ipc-down");
      },
    });

    const r = await svc.checkForPluginUpdates();

    expect(r).toMatchObject({ state: "failed", updatableCount: 0 });
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("⑥ 用户可见的下场：点一次 ⇒ 共享投影当场翻新（行内「可更新」徽标读的就是它）", () => {
  it("目录里来了新版本 → 检查一次 → store 投影换新（订阅方跟着翻新）", async () => {
    let version = "1.0.0";
    const { svc, store } = await boot({
      installed: [enabled("demo-alpha", "1.0.0")],
      text: () => catalogText([{ id: "demo-alpha", name: "Demo Alpha", version }]),
    });
    const { result } = renderHook(() => store.useCatalogEntryById());
    await flush();
    expect(result.current.get("demo-alpha")?.version).toBe("1.0.0"); // 首拉：目录还是旧的

    version = "1.2.0"; // 作者刚发布（5min 缓存里还没有）
    let r: Awaited<ReturnType<typeof svc.checkForPluginUpdates>> | null = null;
    await act(async () => {
      r = await svc.checkForPluginUpdates();
    });

    expect(r).toMatchObject({ state: "ok", updatableCount: 1 });
    expect(result.current.get("demo-alpha")?.version).toBe("1.2.0"); // 投影翻新 ⇒ 徽标当场出现
    expect(fetchCalls).toHaveLength(2); // 首拉 1 趟 ＋ 检查内部 1 趟（不是 2 趟）
  });
});

describe("契约：本函数不抛（按钮⛔ 不许卡在「检查中」）", () => {
  it("上游抛错 ⇒ 折成 failed；故意扎在**没被上游 try 包住**的那处（readInstalledSnapshot 的 pm()?.list）", async () => {
    const { svc } = await boot({ installed: [enabled("demo-alpha", "1.0.0")] });
    const pm: Record<string, unknown> = { getDisabled: async () => [] };
    Object.defineProperty(pm, "list", {
      get() {
        throw new Error("demo-boom");
      },
      configurable: true,
    });
    Object.defineProperty(window, "linkdesk", {
      value: { pluginManager: pm, notifications: { show: vi.fn() }, configuration: { get: async () => null } },
      configurable: true,
    });

    await expect(svc.checkForPluginUpdates()).resolves.toMatchObject({ state: "failed" });
  });
});
