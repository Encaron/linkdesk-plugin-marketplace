/**
 * warningSummary 单测（F5）——来源页「声明提示」按码聚合的可读短标。
 * 钉：按码归并计数、按数量降序、最多两类＋「+N 类」、未知码原样保留（不吞）。
 */

import { describe, it, expect } from "vitest";
import { summarizeWarnings } from "../views/store/sources/warningSummary";

const t = (k: string, o?: Record<string, unknown>) =>
  o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k;

describe("summarizeWarnings", () => {
  it("同码归并计数并按数量降序；两类以内不折叠", () => {
    const r = summarizeWarnings(t, [
      { code: "missing-entry-field" },
      { code: "missing-entry-field" },
      { code: "missing-entry-field" },
      { code: "duplicate-hero" },
    ]);
    expect(r.groups).toEqual([
      { name: "缺抓取字段", count: 3 },
      { name: "重复大屏", count: 1 },
    ]);
    expect(r.label).toBe("缺抓取字段 ×3 · 重复大屏 ×1");
  });

  it("超过两类 ⇒ 尾部折叠「+N 类」", () => {
    const r = summarizeWarnings(t, [
      { code: "missing-entry-field" },
      { code: "duplicate-hero" },
      { code: "unknown-section" },
    ]);
    expect(r.label).toBe("缺抓取字段 ×1 · 重复大屏 ×1 · +1 类");
  });

  it("未知码原样显示（不吞、不猜）", () => {
    const r = summarizeWarnings(t, [{ code: "future-code" }]);
    expect(r.label).toBe("future-code ×1");
  });

  it("空集 ⇒ 空标、groups 空", () => {
    expect(summarizeWarnings(t, [])).toEqual({ label: "", groups: [] });
  });
});
