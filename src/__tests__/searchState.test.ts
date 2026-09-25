/**
 * searchState 单测——模块级搜索状态（E6#149/#151 补；此前零测试）。
 *
 * 为什么走 `vi.resetModules()` ＋ 动态 `import()`：状态是**模块级**的（`let _search` ＋ 模块级
 * 监听者 `Set`）——静态 import 会让全部用例共享同一份状态，跨例串味。每个用例先 resetModules
 * 再拿一份干净实例。
 * ⚠️ 会话二的坑：`vi.resetModules()` 不可与 `renderHook` 同用——本文件不引 RTL，只为取干净模块实例。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type SearchStateModule = typeof import("../services/marketplaceShared/searchState");
let m: SearchStateModule;

beforeEach(async () => {
  vi.resetModules();
  m = await import("../services/marketplaceShared/searchState");
});

describe("searchState（模块级搜索状态——侧栏搜索框的单一真相）", () => {
  it("初始为空串——冷启动不带搜索词", () => {
    expect(m.getMarketplaceSearch()).toBe("");
  });

  it("set 后同实例立刻可读；空串可回写", () => {
    m.setMarketplaceSearch("demo-alpha");
    expect(m.getMarketplaceSearch()).toBe("demo-alpha");
    m.setMarketplaceSearch("");
    expect(m.getMarketplaceSearch()).toBe("");
  });

  it("每次 set 派发一次；多个订阅者各自都收到", () => {
    const a = vi.fn();
    const b = vi.fn();
    m.onMarketplaceSearchChange(a);
    m.onMarketplaceSearchChange(b);
    m.setMarketplaceSearch("demo-alpha");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    m.setMarketplaceSearch("demo-beta");
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("派发不带参数（订阅者自己回读 getMarketplaceSearch）", () => {
    let seen: string | undefined;
    m.onMarketplaceSearchChange(() => {
      seen = m.getMarketplaceSearch();
    });
    m.setMarketplaceSearch("demo-gamma");
    expect(seen).toBe("demo-gamma");
  });

  it("退订后不再收到派发", () => {
    const fn = vi.fn();
    const off = m.onMarketplaceSearchChange(fn);
    m.setMarketplaceSearch("demo-alpha");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    m.setMarketplaceSearch("demo-beta");
    expect(fn).toHaveBeenCalledTimes(1); // 摘了就不再响
  });

  it("退订幂等——重复调用不抛、不牵连其他订阅者", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = m.onMarketplaceSearchChange(a);
    m.onMarketplaceSearchChange(b);
    offA();
    expect(() => offA()).not.toThrow();
    m.setMarketplaceSearch("demo-alpha");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("同值 set 照样派发——本模块不做去重（视图靠每次通知保持自我一致）", () => {
    const fn = vi.fn();
    m.onMarketplaceSearchChange(fn);
    m.setMarketplaceSearch("demo-alpha");
    m.setMarketplaceSearch("demo-alpha");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
