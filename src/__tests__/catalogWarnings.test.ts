/**
 * catalogWarnings 单测（R4-3.18）——目录声明警告 → 来源页可读文案。
 * 钉两件：每个封闭 code 都有专门文案（⛔ 落到兜底「声明提示」）、missing-entry-field 带字段名。
 */

import { describe, it, expect } from "vitest";
import type { CatalogWarning } from "../services/marketCatalog";
import { catalogWarningLines, catalogWarningText } from "../views/store/sources/catalogWarnings";

const t = (k: string, o?: Record<string, unknown>) =>
  o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k;

const CODES: CatalogWarning["code"][] = [
  "unknown-category",
  "unknown-subcategory",
  "unknown-rail-category",
  "screenshot-video-restricted",
  "invalid-source-link",
  "invalid-collection",
  "missing-entry-field",
];

describe("catalogWarningText", () => {
  it("封闭集合每个 code 都有专门文案（兜底语只留给未知 code）", () => {
    for (const code of CODES) {
      const text = catalogWarningText(t, { code, entryId: "demo-a", detail: "x" });
      expect(text).not.toBe("demo-a：声明提示");
    }
  });

  it("missing-entry-field：条目 + 字段名都上屏（作者自查要看得到缺了什么）", () => {
    expect(catalogWarningText(t, { code: "missing-entry-field", entryId: "demo-a", detail: "publishedAt" })).toBe(
      "demo-a：目录缺抓取字段「publishedAt」——详情页对应行不显示",
    );
  });

  it("条目级前缀只对条目警告加；根级（rail/来源）不加", () => {
    expect(catalogWarningText(t, { code: "unknown-rail-category", detail: "made-up" })).toBe(
      "分类栏声明了未启用的分类「made-up」——已跳过",
    );
    expect(catalogWarningText(t, { code: "invalid-source-link" })).toBe("已审核源声明不合形——该行已跳过");
  });

  it("合集 detail 有无两种句式都在册", () => {
    expect(catalogWarningText(t, { code: "invalid-collection", detail: "bad" })).toBe(
      "合集声明不合形（bad）——该板块未渲染",
    );
    expect(catalogWarningText(t, { code: "invalid-collection" })).toBe("合集声明不合形——该板块未渲染");
  });

  it("catalogWarningLines 一行一条、顺序不变", () => {
    expect(
      catalogWarningLines(t, [
        { code: "missing-entry-field", entryId: "demo-a", detail: "author" },
        { code: "missing-entry-field", entryId: "demo-a", detail: "repo" },
      ]),
    ).toEqual([
      "demo-a：目录缺抓取字段「author」——详情页对应行不显示",
      "demo-a：目录缺抓取字段「repo」——详情页对应行不显示",
    ]);
  });
});
