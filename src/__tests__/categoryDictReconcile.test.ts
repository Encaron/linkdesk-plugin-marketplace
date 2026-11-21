/**
 * categoryDictReconcile — 封闭名单 ↔ 双字典值表对账（R4-5.4 / I3 机械门）。
 *
 * 正典 = 04 §5.1（封闭名单 slug=zh）＋ E6#32b（英文 slug 身份 → category 前缀主桶表 ＋ tag 前缀小类表）。
 * 一份名单一张表：`categories.ts` 是名单唯一属主，本测试钉「名单里每个人在 en/zh 都有真显示名」——
 * 防两类历史坑复发：
 *   ① zh 侧占位键（值 = 键，R4-5.4 实测抓出：7 主桶 zh 全是占位 ⇒ 中文 rail/chips 落英文 slug）；
 *   ② 名单加行后字典漏行（§5.3 SOP 第 2 步「zh 值表登记」的机械兜底）。
 * fixture = 真字典文件（i18n/en.json + zh.json——身份键表本来就是仓内真源，硬约束 21 的
 * 「虚构值」不适用于对账对象本身；被测对象是字典与名单的一致性，不是渲染文案）。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OTHER_CATEGORY_SLUG, PRIMARY_CATEGORY_SLUGS, SUBCATEGORY_SLUGS } from "../services/marketCatalog/categories";

const HERE = dirname(fileURLToPath(import.meta.url));

type Dict = Record<string, string>;

function loadDict(file: string): Dict {
  return JSON.parse(readFileSync(join(HERE, "../../i18n", file), "utf8")) as Dict;
}

const en = loadDict("en.json");
const zh = loadDict("zh.json");

/** 身份键（英文 slug 作 key）必须有**真显示名**——值 === 键 = 占位符（没翻译），红。 */
function expectRealEntry(dict: Dict, file: string, key: string): void {
  const v = dict[key];
  expect(v, `${file}:${key} 缺键`).toBeDefined();
  expect(v === key, `${file}:${key} 是占位（值=键）`).toBe(false);
}

describe("封闭名单 ↔ 双字典值表对账（R4-5.4/I3）", () => {
  it("主分类 7 桶＋兜底 other：en/zh category.* 全有真显示名", () => {
    for (const slug of [...PRIMARY_CATEGORY_SLUGS, OTHER_CATEGORY_SLUG]) {
      expectRealEntry(en, "en.json", `category.${slug}`);
      expectRealEntry(zh, "zh.json", `category.${slug}`);
    }
  });

  it("小分类封闭名单全表：en/zh tag.* 全有真显示名", () => {
    const subcategories = Object.values(SUBCATEGORY_SLUGS).flat();
    expect(subcategories.length).toBe(48); // 04 §5.1 全表 7+6+8+7+8+6+6——名单改动必须连本数一起改
    for (const slug of subcategories) {
      expectRealEntry(en, "en.json", `tag.${slug}`);
      expectRealEntry(zh, "zh.json", `tag.${slug}`);
    }
  });

  it("双字典身份键表键集一致（en 有 zh 必有，反之亦然——防单语加行）", () => {
    const keysOf = (d: Dict) => Object.keys(d).filter((k) => k.startsWith("category.") || k.startsWith("tag."));
    expect(new Set(keysOf(en))).toEqual(new Set(keysOf(zh)));
  });

  it("主桶 zh 显示名 = 04 §5.1 正典（值表不是随便填——逐桶钉死）", () => {
    expect(Object.fromEntries(PRIMARY_CATEGORY_SLUGS.map((s) => [s, zh[`category.${s}`]]))).toEqual({
      development: "开发",
      documents: "文档",
      hardware: "硬件",
      network: "网络",
      productivity: "效率",
      themes: "主题",
      entertainment: "娱乐",
    });
  });
});
