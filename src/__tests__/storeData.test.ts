/**
 * storeData —— 商店纯数据推导（棒 6 R4-3.4–3.6）。
 *
 * 钉住：
 *   ① **R4-2.9 分类读数**（官方 18 件按 04 §5.2 预归类）：rail 归位计数、小类 chip 有货即显（≥1）、
 *      未声明分类件落「其他」桶——**不重算分类、不按 categories[0] 猜主分类**；
 *   ② chips = 封闭名单 ∩ 有货（⛔ 满 3 旧规）；名单外 slug 归「未标注小类」兜底；
 *   ③ 排序（dl/upd/az/author/repo 分组）与榜单截断；搜索命中名/ID/标签。
 */

import { describe, it, expect } from "vitest";
import type { CatalogEntry } from "../services/marketCatalog";
import {
  applyInstallFilters,
  applySubcategory,
  chipsOf,
  countByBucket,
  EMPTY_FILTERS,
  orderEntries,
  rankEntries,
  searchEntries,
  sourceKeyOf,
  untaggedCountOf,
} from "../views/store/storeData";

function e(id: string, patch: Partial<CatalogEntry> = {}): CatalogEntry {
  return { id, name: id, version: "1.0.0", ...patch };
}

/** 18 件分类形状（照 04 §5.2 预归类分布）＋ 1 件第三方未声明（其他桶落位）——fixture 全虚构（硬约束 21） */
const OFFICIAL: CatalogEntry[] = [
  e("demo-dev-1", { category: "development", categories: ["code-editing"] }),
  e("demo-dev-2", { category: "development", categories: ["runtime"] }),
  e("demo-dev-3", { category: "development", categories: ["i18n"] }),
  e("demo-doc-1", { category: "documents", categories: ["files"] }),
  e("demo-doc-2", { category: "documents", categories: ["viewer"] }),
  e("demo-hw-1", { category: "hardware", categories: ["serial"] }),
  e("demo-theme-1", { category: "themes", categories: ["color-scheme"] }),
  e("demo-theme-2", { category: "themes", categories: ["color-scheme"] }),
  e("demo-theme-3", { category: "themes", categories: ["icon-pack"] }),
  e("demo-theme-4", { category: "themes", categories: ["color-scheme"] }),
  e("demo-theme-5", { category: "themes", categories: ["color-scheme"] }),
  e("demo-theme-6", { category: "themes", categories: ["color-scheme"] }),
  e("demo-theme-7", { category: "themes", categories: ["color-scheme"] }),
  e("demo-theme-8", { category: "themes", categories: ["color-scheme"] }),
  e("demo-theme-9", { category: "themes", categories: ["color-scheme"] }),
  e("demo-ent-1", { category: "entertainment", categories: ["game"] }),
  e("demo-prod-1", { category: "productivity" }),
  e("demo-prod-2", { category: "productivity" }),
];
const CATALOG = [...OFFICIAL, e("demo-third-party")];
const RAIL = [
  "development",
  "documents",
  "hardware",
  "network",
  "productivity",
  "themes",
  "reading",
  "entertainment",
  "other",
];

describe("R4-2.9 分类读数（官方 18 件真实预归类）", () => {
  it("rail 归位：开发 3 / 文档 2 / 硬件 1 / 网络 0 / 效率 2 / 主题 9 / 阅读 0 / 娱乐 1 / 其他 1", () => {
    const counts = countByBucket(CATALOG, RAIL);
    expect(Object.fromEntries(counts)).toEqual({
      development: 3,
      documents: 2,
      hardware: 1,
      network: 0,
      productivity: 2,
      themes: 9,
      reading: 0,
      entertainment: 1,
      other: 1,
    });
  });

  it("小类 chip 有货即显（≥1）＋封闭名单序；未标注小类兜底", () => {
    const development = CATALOG.filter((x) => (x.category ?? "other") === "development");
    expect(chipsOf(development, "development")).toEqual(["code-editing", "runtime", "i18n"]);
    const themes = CATALOG.filter((x) => x.category === "themes");
    expect(chipsOf(themes, "themes")).toEqual(["color-scheme", "icon-pack"]);
    const productivity = CATALOG.filter((x) => x.category === "productivity");
    expect(chipsOf(productivity, "productivity")).toEqual([]);
    expect(untaggedCountOf(productivity, "productivity")).toBe(2);
    expect(untaggedCountOf(CATALOG.filter((x) => (x.category ?? "other") === "other"), "other")).toBe(1);
  });

  it("「其他」桶 = 未声明/名单外 slug（诚实落位）", () => {
    const other = CATALOG.filter((x) => !x.category);
    expect(other.map((x) => x.id)).toEqual(["demo-third-party"]);
    expect(applySubcategory(other, "__none", "other")).toHaveLength(1);
  });

  it("chip 过滤：__none 只留无可识别小类的件；再点清除由调用方（wasOn）负责", () => {
    const dev = CATALOG.filter((x) => x.category === "development");
    expect(applySubcategory(dev, "code-editing", "development").map((x) => x.id)).toEqual(["demo-dev-1"]);
    expect(applySubcategory(dev, "runtime", "development").map((x) => x.id)).toEqual(["demo-dev-2"]);
  });
});

describe("排序 / 分组 / 榜单", () => {
  const dl = (m: Record<string, number>) => (x: CatalogEntry) => m[x.id];
  const set = [
    e("alpha", { publishedAt: "2026-01-01", category: "development" }),
    e("bravo", { publishedAt: "2026-03-01", category: "development" }),
    e("charlie", { publishedAt: "2026-02-01", category: "development" }),
  ];

  it("dl：有计数降序，无计数排后（不造假名次）", () => {
    const nodes = orderEntries(set, "dl", dl({ alpha: 100, charlie: 300 }));
    expect(nodes.map((n) => (n.kind === "entry" ? n.entry.id : n.label))).toEqual(["charlie", "alpha", "bravo"]);
  });

  it("upd：publishedAt 降序", () => {
    const nodes = orderEntries(set, "upd", dl({}));
    expect(nodes.map((n) => (n.kind === "entry" ? n.entry.id : n.label))).toEqual(["bravo", "charlie", "alpha"]);
  });

  it("author/repo：分组头 + 组间 A→Z + 组内下载降序", () => {
    const list = [
      e("a1", { author: "Zulu", sourceName: "z/repo" }),
      e("b1", { author: "Alpha", sourceName: "a/repo" }),
      e("b2", { author: "Alpha", sourceName: "a/repo" }),
    ];
    const nodes = orderEntries(list, "author", dl({ a1: 5, b1: 1, b2: 9 }));
    expect(nodes.map((n) => (n.kind === "group" ? `#${n.label}:${n.count}` : n.entry.id))).toEqual([
      "#Alpha:2",
      "b2",
      "b1",
      "#Zulu:1",
      "a1",
    ]);
  });

  it("rankEntries：按计数取前 N；top 缺省 = 全量", () => {
    expect(rankEntries(set, dl({ alpha: 100, charlie: 300, bravo: 200 }), 2).map((x) => x.id)).toEqual([
      "charlie",
      "bravo",
    ]);
    expect(rankEntries(set, dl({}), undefined)).toHaveLength(3);
  });
});

describe("搜索 / 筛选", () => {
  it("搜索命中名/ID/标签（不搜描述——蓝图 v3.24 口径）", () => {
    expect(searchEntries(CATALOG, "serial").map((x) => x.id)).toEqual(["demo-hw-1"]);
    expect(searchEntries(CATALOG, "DEMO-DEV-1").map((x) => x.id)).toEqual(["demo-dev-1"]);
    expect(searchEntries(CATALOG, "code-editing").map((x) => x.id)).toEqual(["demo-dev-1"]);
    expect(searchEntries(CATALOG, "no-such-term")).toHaveLength(0);
  });

  it("安装/来源筛选可叠加；空筛选 = 全量", () => {
    const stateOf = (x: CatalogEntry) => (x.id === "demo-dev-1" ? "installed" : x.id === "demo-dev-2" ? "update" : "install");
    expect(applyInstallFilters(CATALOG, { ...EMPTY_FILTERS }, stateOf)).toHaveLength(CATALOG.length);
    expect(applyInstallFilters(CATALOG, { ...EMPTY_FILTERS, installed: true }, stateOf).map((x) => x.id)).toEqual([
      "demo-dev-1",
      "demo-dev-2",
    ]);
    expect(applyInstallFilters(CATALOG, { ...EMPTY_FILTERS, update: true }, stateOf).map((x) => x.id)).toEqual([
      "demo-dev-2",
    ]);
  });

  it("来源身份：官方/厂商 → official；无 official → third", () => {
    expect(sourceKeyOf(e("x", { official: true }))).toBe("official");
    expect(sourceKeyOf(e("x", { vendorId: "st" }))).toBe("official");
    expect(sourceKeyOf(e("x", { official: false }))).toBe("third");
    expect(sourceKeyOf(e("x", { sourceName: "local" }))).toBe("local");
  });
});
