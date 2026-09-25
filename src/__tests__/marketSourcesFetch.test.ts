/**
 * marketSources/fetch.ts 的**真 fetch 通路**单测（E6#151 补）。
 *
 * 🔴 为什么单列：立项读数里本单元判「已覆盖」，但实测**既有覆盖全走注入分支**——`marketSources.test.ts`
 * 一律 `__setCatalogIO(fetchFn, storage)`，即 `fetchOne` 开头 `const injected = injectedFetch(); if (injected)`
 * 那一支。而**生产里 `_fetchFn` 恒为 null**（注入点只在测试里用）⇒ 真正跑在用户机器上的
 * `fetchText()`（真实 `fetch` ＋ `res.ok` 判定 ＋ `res.text()` ＋ 10s 超时 AbortController）**零断言**。
 * 本文件只补这一段：不自建 Mock 替身走注入，而是 `vi.stubGlobal("fetch", …)` 假真 fetch，让生产通路整条跑。
 *
 * IO 注入面只给 storage（不给 fetcher）——目录缓存读写照 `marketSources.test.ts` 的 fakeStorage 口径。
 * fixture 全虚构（硬约束 21）：demo-* 插件、example.invalid 下载址。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadCatalog, __setCatalogIO, type StorageLike } from "../services/marketSources";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";

const CACHE_PREFIX = "ldk-market-catalog:v1:";

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

/** 目录文本（虚构条目） */
function catalogText(id = "demo-alpha", version = "1.0.0"): string {
  return JSON.stringify({
    version: "1",
    updatedAt: "2026-09-01T00:00:00Z",
    plugins: [{ id, name: `Demo ${id}`, version, downloadUrl: `https://example.invalid/releases/${id}-${version}.linkdesk-plugin` }],
  });
}

/** 假真 fetch 的响应壳——只带 fetchText 真正读到的三个面 */
function res(body: string, ok = true, status = 200) {
  return { ok, status, text: async () => body };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  // 只注入 storage：fetcher 留 null ⇒ fetchText 走真实 fetch（生产通路）
  __setCatalogIO(null, storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  __setCatalogIO(null, null);
});

describe("fetchOne 的真实 fetch 通路（生产唯一通路——注入分支之外的整段）", () => {
  it("2xx：以 (url, {signal, cache:'no-store'}) 发真请求，res.text() 交付目录并写缓存", async () => {
    const fetchMock = vi.fn(async () => res(catalogText()));
    vi.stubGlobal("fetch", fetchMock);

    const r = await loadCatalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OFFICIAL_SOURCE_URL);
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal); // 10s 超时用的就是它
    expect(r.state).toBe("ok");
    expect(r.entries.map((e) => e.id)).toEqual(["demo-alpha"]);

    // 缓存写入（下次 5min 内命中它，免二次 fetch）
    const key = CACHE_PREFIX + OFFICIAL_SOURCE_URL;
    expect(storage.map.has(key)).toBe(true);
    expect(JSON.parse(storage.map.get(key) as string).text).toBe(catalogText());
  });

  it("非 2xx（HTTP 404）→ 抛进 network 分支；无缓存 ⇒ offline 且**不写缓存**", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res("Not Found", false, 404)));

    const r = await loadCatalog();

    expect(r.state).toBe("offline");
    expect(r.errors).toEqual([{ sourceName: "encaron/linkdesk-marketplace", reason: "network" }]);
    expect(storage.map.size).toBe(0);
  });

  it("res.text() 自身抛（传输中断）→ 同样落 network（在同一个 try 里）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error("Connection lost");
        },
      })),
    );

    const r = await loadCatalog();

    expect(r.state).toBe("offline");
    expect(r.errors[0]?.reason).toBe("network");
  });

  it("拉到了不是目录的内容（坏 JSON）→ parse 失败 ⇒ corrupt（区别于不可达）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res("{ not json")));

    const r = await loadCatalog();

    expect(r.state).toBe("corrupt");
    expect(r.errors[0]?.reason).toBe("parse");
    expect(storage.map.size).toBe(0);
  });

  it("10s 超时 → AbortController 主动中断 ⇒ network（下载挂死不会永远转圈）", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("AbortError")));
          }),
      ),
    );

    const pending = loadCatalog();
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await pending;

    expect(r.state).toBe("offline");
    expect(r.errors[0]?.reason).toBe("network");
  });

  it("stale 缓存在场时，真 fetch 失败 → 缓存兜底交付（usedStale=true，不降级）", async () => {
    storage.map.set(
      CACHE_PREFIX + OFFICIAL_SOURCE_URL,
      JSON.stringify({ fetchedAt: Date.now() - 6 * 60 * 1000, text: catalogText("demo-stale", "0.9.0") }),
    );
    vi.stubGlobal("fetch", vi.fn(async () => res("Not Found", false, 404)));

    const r = await loadCatalog();

    expect(r.state).toBe("ok");
    expect(r.usedStale).toBe(true);
    expect(r.entries.map((e) => e.id)).toEqual(["demo-stale"]);
    expect(r.errors).toEqual([]);
  });
});
