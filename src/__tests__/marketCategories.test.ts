/**
 * marketCategories 分类显示纯函数域单测——E6#32b（英文 slug 分类值 + category.* 双值表）。
 * fixture 全虚构（硬约束 21）：分类 slug 用明显虚构值（zigzag/wobble），不指向真实插件/目录数据。
 */

import { describe, it, expect } from "vitest";
import { categoryListFromEntry, localizeCategory, categoryText } from "../services/marketCategories";

/** stub t——回放给定映射，未命中返回 key（= i18next parseMissingKeyHandler 语义） */
const mkT = (map: Record<string, string>) => (key: string) => map[key] ?? key;

describe("categoryListFromEntry（并集去重保序）", () => {
  it("仅 category 单值 → 单元素列表", () => {
    expect(categoryListFromEntry("zigzag")).toEqual(["zigzag"]);
  });

  it("仅 categories[] → 保序透传", () => {
    expect(categoryListFromEntry(undefined, ["wobble", "zigzag"])).toEqual(["wobble", "zigzag"]);
  });

  it("两形态并存 → category 在前、categories 续后去重", () => {
    expect(categoryListFromEntry("zigzag", ["zigzag", "wobble"])).toEqual(["zigzag", "wobble"]);
    expect(categoryListFromEntry("wobble", ["zigzag", "wobble"])).toEqual(["wobble", "zigzag"]);
  });

  it("空/空白/undefined → 空列表", () => {
    expect(categoryListFromEntry(undefined, undefined)).toEqual([]);
    expect(categoryListFromEntry("", ["  ", "zigzag"])).toEqual(["zigzag"]);
  });
});

describe("localizeCategory（category.* → tag.* → slug 原文三级回退——R4-5.4/I3）", () => {
  it("键在表 → 译文；不在表 → 回退原始 slug", () => {
    const t = mkT({ "category.zigzag": "Zigzag" });
    expect(localizeCategory(t, "zigzag")).toBe("Zigzag");
    expect(localizeCategory(t, "wobble")).toBe("wobble");
  });

  it("category.* 缺、tag.* 有（小类封闭名单）→ 取 tag.* 译文——详情行与 chips 同一份表", () => {
    const t = mkT({ "tag.zigzag": "Zigzag 子类" });
    expect(localizeCategory(t, "zigzag")).toBe("Zigzag 子类");
  });

  it("category.* 优先于 tag.*（主桶两表都有的 slug 不被 tag 表盖掉）", () => {
    const t = mkT({ "category.zigzag": "主桶译名", "tag.zigzag": "子类译名" });
    expect(localizeCategory(t, "zigzag")).toBe("主桶译名");
  });
});

describe("categoryText（多值「 · 」连接）", () => {
  it("多 slug 逐项翻译后连接", () => {
    const t = mkT({ "category.zigzag": "Zigzag", "category.wobble": "Wobble" });
    expect(categoryText(t, "zigzag", ["wobble"])).toBe("Zigzag · Wobble");
  });

  it("无翻译 slug 与有翻译 slug 混合 → 有译文的译、无译文的留原文", () => {
    const t = mkT({ "category.zigzag": "Zigzag" });
    expect(categoryText(t, "zigzag", ["freeform"])).toBe("Zigzag · freeform");
  });

  it("无任何分类 → undefined（元数据行不显示）", () => {
    expect(categoryText(mkT({}), undefined, undefined)).toBeUndefined();
    expect(categoryText(mkT({}), "", [])).toBeUndefined();
  });
});
