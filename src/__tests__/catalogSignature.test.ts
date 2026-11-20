/**
 * catalogSignature —— 目录内容签名（R4-2.5 `marketplace.refreshCatalog` 的 changed 判据）。
 * 钉：同内容恒等、条目/合集/rail 任一变化即变、**顺序敏感**（换序也是内容变化）。
 */

import { describe, it, expect } from "vitest";
import { catalogSignature } from "../services/marketCatalog/signature";

const A = { id: "demo-alpha", name: "Demo Alpha", version: "1.0.0", category: "tool" };
const B = { id: "demo-beta", name: "Demo Beta", version: "2.0.0", category: "theme" };

describe("catalogSignature", () => {
  it("同内容恒等", () => {
    expect(catalogSignature([A, B], [], ["tool", "theme"])).toBe(catalogSignature([{ ...A }, { ...B }], [], ["tool", "theme"]));
  });

  it("版本变化 ⇒ 变", () => {
    expect(catalogSignature([A])).not.toBe(catalogSignature([{ ...A, version: "1.0.1" }]));
  });

  it("条目顺序变化 ⇒ 变（合集/榜单换序是真实内容变化）", () => {
    expect(catalogSignature([A, B])).not.toBe(catalogSignature([B, A]));
  });

  it("合集 / rail 声明变化 ⇒ 变", () => {
    const base = catalogSignature([A], [], []);
    expect(catalogSignature([A], [{ id: "c1", title: "精选", items: ["demo-alpha"] }], [])).not.toBe(base);
    expect(catalogSignature([A], [], ["tool"])).not.toBe(base);
  });
});
