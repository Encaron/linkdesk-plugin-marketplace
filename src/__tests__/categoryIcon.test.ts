/**
 * categoryIcon —— 分类 slug → 图标名（rail 与首页瓷片共用）。未知 slug 落「其他」点图标。
 */

import { describe, it, expect } from "vitest";
import { categoryIcon } from "../views/store/categoryIcon";

describe("categoryIcon", () => {
  it("七个现役桶各有专属图标", () => {
    expect(categoryIcon("development")).toBe("code");
    expect(categoryIcon("documents")).toBe("filetext");
    expect(categoryIcon("hardware")).toBe("plug");
    expect(categoryIcon("network")).toBe("network");
    expect(categoryIcon("productivity")).toBe("zap");
    expect(categoryIcon("themes")).toBe("palette");
    expect(categoryIcon("entertainment")).toBe("gamepad");
  });

  it("other 与未知 slug → dots（不崩、不空白）", () => {
    expect(categoryIcon("other")).toBe("dots");
    expect(categoryIcon("future-category")).toBe("dots");
    expect(categoryIcon("")).toBe("dots");
  });
});
