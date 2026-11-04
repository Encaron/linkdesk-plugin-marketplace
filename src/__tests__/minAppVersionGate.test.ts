/**
 * minAppVersionGate 单测（2026-11-05 拍板②：装前版本门共享单点）——纯函数 minAppVerdict 直测。
 * 判据源 = 壳仓 docs/05-插件更新/插件市场-minAppVersion版本门槛/ §三：四入口全走同一道门；
 * 诚实口径 = E6#30.8c（壳版本读失败 = 放行不拦——判不了 ≠ 判不满足）。
 */
import { describe, expect, it } from "vitest";
import { minAppVerdict } from "../services/minAppVersionGate";

describe("minAppVerdict（装前版本门共享单点）", () => {
  it("无声明 = 无门（恒放行）", () => {
    expect(minAppVerdict(undefined, "0.2.20")).toEqual({ ok: true });
  });

  it("壳版本读不到 = 放行不拦（诚实不缺省拦装）", () => {
    expect(minAppVerdict("99.0.0", undefined)).toEqual({ ok: true });
  });

  it("壳低于要求 = 拦，need 带要求版本", () => {
    expect(minAppVerdict("0.2.52", "0.2.50")).toEqual({ ok: false, need: "0.2.52" });
  });

  it("壳等于/高于要求 = 放行（等值不拦——同版可装）", () => {
    expect(minAppVerdict("0.2.50", "0.2.50").ok).toBe(true);
    expect(minAppVerdict("0.2.20", "0.2.50").ok).toBe(true);
  });

  it("v 前缀/缺位补 0 走 compareVersions 同规（0.2.5 < 0.2.50）", () => {
    expect(minAppVerdict("v0.2.5", "0.2.50").ok).toBe(true);
    expect(minAppVerdict("0.2.50", "v0.2.5").ok).toBe(false);
  });
});
