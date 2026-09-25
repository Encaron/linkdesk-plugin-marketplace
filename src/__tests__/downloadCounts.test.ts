/**
 * downloadCounts 单测——GitHub Releases 资产级下载数（E6#152 补；此前零测试）。
 *
 * 本模块**不碰 `window.linkdesk`**（头注：「IO 经 localStorage/fetch 全局」）——裁决表里它出现在
 * 35 行名单上的原因是 `grep -rl` 命中了**注释里的那句「无 window.linkdesk 依赖」**，是机械读数的假阳。
 * 故本文件的替身只有两样全局：`localStorage`（缓存）与 `fetch`（GitHub API）。
 *
 * 有牙的三条（都是「诚实不造假」的直接体现）：
 *   ① 非 github releases/download 形态 → 解析 null ⇒ hidden（gitee/自定义直链不给下载数）；
 *   ② 拉取失败（非 2xx / 坏 JSON / 抛错 / 6s 超时）→ **hidden，绝不落 0**（无数据不造空位）；
 *   ③ 过期缓存**不显示 stale**（头注：「视为无」——拉到新值前不显示，避免误导）。
 * 外加单飞去重（StrictMode 重入防双 fetch）与 10min TTL 两处机制。
 *
 * fixture 全虚构（硬约束 21）：demo-owner/demo-repo/demo-alpha。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { parseGithubReleaseDownloadUrl, useDownloadCount } from "../services/downloadCounts";

const URL_OK = "https://github.com/demo-owner/demo-repo/releases/download/v1.0.0/demo-alpha.linkdesk-plugin";
const CACHE_KEY = `ldk-market-dl:v1:demo-owner/demo-repo/v1.0.0/demo-alpha.linkdesk-plugin`;
const TTL_MS = 10 * 60 * 1000;

function fakeStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

/** GitHub releases API 响应壳——只带 doFetchAsset 真正读到的面 */
function apiRes(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 404, json: async () => body };
}

function assetsBody(name = "demo-alpha.linkdesk-plugin", count = 42) {
  return { assets: [{ name, download_count: count }] };
}

let storage: ReturnType<typeof fakeStorage>;

/** 把缓存写成「已存在 fetchedAt 毫秒」——免假定时器也能测 TTL 两侧 */
function seedCache(fetchedAt: number, count = 7) {
  storage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt, count }));
}

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("parseGithubReleaseDownloadUrl（形态闸——非 github releases 直链一律 null）", () => {
  it("github.com/{owner}/{repo}/releases/download/{tag}/{file} → 四段坐标", () => {
    expect(parseGithubReleaseDownloadUrl(URL_OK)).toEqual({
      owner: "demo-owner",
      repo: "demo-repo",
      tag: "v1.0.0",
      filename: "demo-alpha.linkdesk-plugin",
    });
  });

  it("前后空白被 trim（目录里的 URL 常带缩进换行）", () => {
    expect(parseGithubReleaseDownloadUrl(`  ${URL_OK}\n`)?.filename).toBe("demo-alpha.linkdesk-plugin");
  });

  it("🔴 非 github 形态（gitee / 自有 CDN / 直链）→ null（不显示下载数）", () => {
    expect(parseGithubReleaseDownloadUrl("https://gitee.com/demo-owner/demo-repo/releases/download/v1/x.zip")).toBeNull();
    expect(parseGithubReleaseDownloadUrl("https://example.invalid/files/demo-alpha.linkdesk-plugin")).toBeNull();
  });

  it("github 但不是发布资产形态（仓库主页 / archive / 带查询串）→ null", () => {
    expect(parseGithubReleaseDownloadUrl("https://github.com/demo-owner/demo-repo")).toBeNull();
    expect(parseGithubReleaseDownloadUrl("https://github.com/demo-owner/demo-repo/archive/refs/tags/v1.zip")).toBeNull();
    expect(parseGithubReleaseDownloadUrl(`${URL_OK}?token=demo`)).toBeNull();
  });

  it("空值 → null（本地插件无 marketEntry 时调用方不传）", () => {
    expect(parseGithubReleaseDownloadUrl(undefined)).toBeNull();
    expect(parseGithubReleaseDownloadUrl("")).toBeNull();
  });
});

describe("useDownloadCount（就绪 / 不适用 / 拉取失败三态）", () => {
  it("无 downloadUrl → hidden（不适用，无空位）", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useDownloadCount(undefined));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "hidden" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("非 github 形态 → hidden，且一次网络都不发", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useDownloadCount("https://example.invalid/x.linkdesk-plugin"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "hidden" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("命中同名资产 → ready(count)；请求形 = Accept 头 + no-store + 带 signal", async () => {
    const fetchSpy = vi.fn(async () => apiRes(assetsBody("demo-alpha.linkdesk-plugin", 1234)));
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useDownloadCount(URL_OK));
    expect(result.current).toEqual({ status: "loading" }); // 瞬态：详情页不发空位
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "ready", count: 1234 });

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/demo-owner/demo-repo/releases/tags/v1.0.0");
    expect(init.headers).toEqual({ Accept: "application/vnd.github+json" });
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeDefined();
  });

  it("🔴 同名资产不存在（tag 下换了文件名）→ hidden——不落 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => apiRes(assetsBody("demo-other.linkdesk-plugin", 99))));
    const { result } = renderHook(() => useDownloadCount(URL_OK));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "hidden" });
  });

  it("🔴 非 2xx（未认证 60/hr 超限 / 断网代理）→ hidden——不落 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => apiRes({}, false)));
    const { result } = renderHook(() => useDownloadCount(URL_OK));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "hidden" });
  });

  it("🔴 响应体坏（json 抛 / assets 非数组 / download_count 非数）→ hidden——不落 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("bad json");
        },
      })),
    );
    const { result } = renderHook(() => useDownloadCount(URL_OK));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "hidden" });

    vi.stubGlobal("fetch", vi.fn(async () => apiRes({ assets: "nope" })));
    const r2 = renderHook(() => useDownloadCount(URL_OK));
    await act(async () => {
      await Promise.resolve();
    });
    expect(r2.result.current).toEqual({ status: "hidden" });
  });

  it("fetch 直接 reject（断网）→ hidden，不把异常逃出去", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { result } = renderHook(() => useDownloadCount(URL_OK));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "hidden" });
  });

  it("🔴 6s 超时 → AbortController 掐断 ⇒ hidden（不是永远 loading）", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    );

    const { result } = renderHook(() => useDownloadCount(URL_OK));
    expect(result.current).toEqual({ status: "loading" });

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "hidden" });
  });
});

describe("useDownloadCount（缓存：10min TTL ＋ 过期不显示 stale）", () => {
  it("新鲜缓存命中 → 直接 ready，且**不发**网络请求", async () => {
    seedCache(Date.now(), 55);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useDownloadCount(URL_OK));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "ready", count: 55 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("🔴 过期缓存（>10min）→ 视为无：重拉新值，不显示旧值", async () => {
    seedCache(Date.now() - TTL_MS - 1, 55);
    const fetchSpy = vi.fn(async () => apiRes(assetsBody("demo-alpha.linkdesk-plugin", 66)));
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useDownloadCount(URL_OK));
    expect(result.current).toEqual({ status: "loading" }); // 不是 ready(55)——stale 不给看
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "ready", count: 66 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("坏缓存（缺字段 / 非 JSON）→ 当作没有，正常重拉", async () => {
    storage.setItem(CACHE_KEY, "{ not json");
    const fetchSpy = vi.fn(async () => apiRes(assetsBody("demo-alpha.linkdesk-plugin", 8)));
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useDownloadCount(URL_OK));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "ready", count: 8 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("拉取成功后落盘缓存（下次同资产命中）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => apiRes(assetsBody("demo-alpha.linkdesk-plugin", 12))));
    const { result } = renderHook(() => useDownloadCount(URL_OK));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ status: "ready", count: 12 });

    const raw = JSON.parse(storage.getItem(CACHE_KEY) as string) as { fetchedAt: number; count: number };
    expect(raw.count).toBe(12);
    expect(typeof raw.fetchedAt).toBe("number");
  });
});

describe("单飞去重（StrictMode 重入 / 多消费者防双 fetch）", () => {
  it("同资产两个实例同时挂载 → 只发一次 GitHub 请求", async () => {
    const fetchSpy = vi.fn(async () => apiRes(assetsBody("demo-alpha.linkdesk-plugin", 3)));
    vi.stubGlobal("fetch", fetchSpy);

    const a = renderHook(() => useDownloadCount(URL_OK));
    const b = renderHook(() => useDownloadCount(URL_OK));
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(a.result.current).toEqual({ status: "ready", count: 3 });
    expect(b.result.current).toEqual({ status: "ready", count: 3 });
  });
});
