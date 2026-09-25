/**
 * `marketSources/io.ts` 的存储边界单测（E6#151 补）。
 *
 * 本单元的注入分支（`__setCatalogIO` 给的那份 fakeStorage）已被 `marketSources.test.ts` 全面穿过；
 * 本文件只钉**注入之外的两条边界**——它们是本文件头注写明的既有契约，此前无断言：
 *   ① **无 storage 可用 ⇒ 静默退化为零缓存**（不抛、不崩，读回 null、写/删 no-op）；
 *   ② **注入的 storage 优先于真 `localStorage`**（这条是「测试能注入」的前提，破了全仓目录测试都会静默
 *      去读写真存储、变成跨例串味的假绿）。
 * 另有 `storage()` 的 `catch` 分支——隐私模式下取 `localStorage` 就抛（用会抛的 getter 模拟）。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { readCache, writeCache, removeCache, __setCatalogIO } from "../services/marketSources/io";
import type { StorageLike } from "../services/marketSources";

const URL_A = "https://example.invalid/owner-one/repo-a/HEAD/marketplace.json";

function fakeStorage(map = new Map<string, string>()): StorageLike & { map: Map<string, string> } {
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

afterEach(() => {
  vi.unstubAllGlobals();
  __setCatalogIO(null, null);
});

describe("io 的存储边界（注入之外的两条）", () => {
  it("无 storage 可用（未注入 + 全局无 localStorage）⇒ 读空、写/删静默 no-op，不抛", () => {
    vi.stubGlobal("localStorage", undefined);
    __setCatalogIO(null, null);

    expect(readCache(URL_A)).toBeNull();
    expect(() => writeCache(URL_A, "{}")).not.toThrow();
    expect(() => removeCache(URL_A)).not.toThrow();
  });

  it("注入的 storage 优先于真 localStorage（真存储里同样的键读不到）", () => {
    const real = new Map<string, string>([[`ldk-market-catalog:v1:${URL_A}`, JSON.stringify({ fetchedAt: 1, text: "real" })]]);
    vi.stubGlobal("localStorage", fakeStorage(real));
    const injected = fakeStorage();
    __setCatalogIO(null, injected);

    expect(readCache(URL_A)).toBeNull(); // 读的是注入那份，不是真存储
    writeCache(URL_A, "injected");
    expect(injected.map.has(`ldk-market-catalog:v1:${URL_A}`)).toBe(true);
    expect(real.get(`ldk-market-catalog:v1:${URL_A}`)).toContain("real"); // 真存储一字未动
  });

  it("取 localStorage 本身就抛（隐私模式）⇒ 同样静默退化，不冒泡", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: access denied");
      },
    });
    __setCatalogIO(null, null);

    expect(readCache(URL_A)).toBeNull();
    expect(() => writeCache(URL_A, "{}")).not.toThrow();
  });

  it("注入的 storage 读写删三态闭环 + 坏值/缺字段读回 null（防御形状）", () => {
    const s = fakeStorage();
    __setCatalogIO(null, s);

    writeCache(URL_A, `{"plugins":[]}`);
    const hit = readCache(URL_A);
    expect(hit?.text).toBe(`{"plugins":[]}`);
    expect(typeof hit?.fetchedAt).toBe("number");

    s.map.set(`ldk-market-catalog:v1:${URL_A}`, "not json");
    expect(readCache(URL_A)).toBeNull();
    s.map.set(`ldk-market-catalog:v1:${URL_A}`, JSON.stringify({ text: "no-timestamp" }));
    expect(readCache(URL_A)).toBeNull();

    writeCache(URL_A, "again");
    removeCache(URL_A);
    expect(readCache(URL_A)).toBeNull();
  });
});
