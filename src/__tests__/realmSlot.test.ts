/**
 * realmSlot 单测——跨表面共享状态的地基（2026-09-30 多表面塌缩修复）。
 *
 * 契约四条：
 *   ① 同 key 重复取 = **同一对象**，`init` 只跑一次；
 *   ② 跨模块实例共享（`vi.resetModules()` 换实例后，槽里还是那一份）——这正是修复的要害；
 *   ③ 不同 key 互不干扰；
 *   ④ `__resetRealmSlots()` 清空命名空间（测试隔离的兑现），清后 `init` 重跑。
 */

import { describe, it, expect, vi } from "vitest";
import { realmSlot, __resetRealmSlots } from "../services/realmSlot";

const NAMESPACE = "__linkdesk_pluginSlots__marketplace";

describe("realmSlot（跨表面共享槽）", () => {
  it("① 同 key 重复取 = 同一对象，init 只跑一次", () => {
    const init = vi.fn(() => ({ n: 0 }));
    const a = realmSlot("demoA/v1", init);
    a.n = 7;
    const b = realmSlot("demoA/v1", init);

    expect(b).toBe(a);
    expect(b.n).toBe(7);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("② 跨模块实例共享：resetModules 换实例后仍是同一份（修复的要害）", async () => {
    vi.resetModules();
    const m1 = await import("../services/realmSlot");
    const first = m1.realmSlot("demoB/v1", () => ({ tag: "first" }));
    first.tag = "mutated";

    vi.resetModules();
    const m2 = await import("../services/realmSlot");
    const second = m2.realmSlot("demoB/v1", () => ({ tag: "second" }));

    expect(m2).not.toBe(m1); // 确实是两个模块实例
    expect(second).toBe(first); // 但槽只有一份
    expect(second.tag).toBe("mutated"); // init 没有再跑，第二份工厂没生效
  });

  it("③ 不同 key 互不干扰，且命名空间带插件前缀（同 realm 里别的插件不撞）", () => {
    realmSlot("demoC/v1", () => ({ v: 1 }));
    realmSlot("demoD/v1", () => ({ v: 2 }));

    expect(realmSlot("demoC/v1", () => ({ v: 99 })).v).toBe(1);
    expect(realmSlot("demoD/v1", () => ({ v: 99 })).v).toBe(2);
    expect((globalThis as unknown as Record<string, unknown>)[NAMESPACE]).toBeTruthy();
  });

  it("④ __resetRealmSlots 清空命名空间，清后 init 重跑", () => {
    const init = vi.fn(() => ({ n: 1 }));
    realmSlot("demoE/v1", init);
    expect(init).toHaveBeenCalledTimes(1);

    __resetRealmSlots();

    expect((globalThis as unknown as Record<string, unknown>)[NAMESPACE]).toBeUndefined();
    realmSlot("demoE/v1", init);
    expect(init).toHaveBeenCalledTimes(2);
  });
});
