/**
 * searchState 单测——跨表面搜索状态（E6#149/#151 补；此前零测试）。
 *
 * 状态自 2026-09-30 起住 `realmSlot` 全局槽（多表面塌缩修复；见 `services/realmSlot.ts`），
 * **不随模块实例走**——每例前由 `vitest.setup.ts` 清槽（等价于「拿一份干净实例」）。
 * `vi.resetModules()` ＋ 动态 `import()` 仍留着：本文件只测「一份实例内的行为」，不引 RTL。
 * ⚠️ 「resetModules 不可与 renderHook 同用」的旧记（会话二）2026-09-30 复核已不成立：
 *   `crossSurfaceSharedState.test.ts` 里两者同用、全绿（vitest 4.1.11）。
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
