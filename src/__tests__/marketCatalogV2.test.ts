/**
 * marketCatalog v2 纯域单测（R4-2.1/2.2/2.3）——分类封闭名单/归桶 · 根级 v2 字段 · 厂商注册表 ·
 * K5 清单合成 · 三源合并回执。全纯函数直测，零 IO mock。
 * fixture 全虚构（硬约束 21）：demo-* 插件、owner-two/catalog-repo-b、example.invalid 下载址。
 */

import { describe, it, expect } from "vitest";
import {
  buildCategoryRailOrder,
  groupByPrimaryCategory,
  isKnownPrimaryCategory,
  isKnownSubcategory,
  OTHER_CATEGORY_SLUG,
  parseCatalog,
  parseVendors,
  primaryCategoryOf,
  synthesizeEntryFromManifest,
  validateEntryCategories,
  vendorIdSetOf,
  withVendorIds,
  mergeCatalogs,
  mergeCatalogsWithReceipt,
} from "../services/marketCatalog";
import type { CatalogEntry } from "../services/marketCatalog";

function entry(patch: Partial<CatalogEntry> & { id: string }): CatalogEntry {
  /* R4-3.18：目录条目默认带齐「抓取/派生型」三字段——网络源理论上必有（05 §02）。
   * 缺它会被 missing-entry-field 记为目录缺陷，与本组各例要测的声明警告混在一起。 */
  return {
    name: `Demo ${patch.id}`,
    version: "1.0.0",
    author: { name: "Demo Author" },
    publishedAt: "2026-11-20T00:00:00.000Z",
    repository: "https://github.com/demo-owner/demo-repo",
    ...patch,
  };
}

/* ── 分类封闭名单（04 §5.1） ── */

describe("categories — 封闭名单与归桶", () => {
  it("现役 7 桶在册；预留桶（learning）未启用 = 不在册", () => {
    for (const slug of ["development", "documents", "hardware", "network", "productivity", "themes", "entertainment"]) {
      expect(isKnownPrimaryCategory(slug)).toBe(true);
    }
    expect(isKnownPrimaryCategory("learning")).toBe(false); // 04 §5.4 预留，启用须用户明示
    expect(isKnownPrimaryCategory("")).toBe(false);
  });

  it("小分类名单在册判定（跨桶并集）", () => {
    expect(isKnownSubcategory("terminal")).toBe(true);
    expect(isKnownSubcategory("icon-pack")).toBe(true);
    expect(isKnownSubcategory("self-invented-tag")).toBe(false);
  });

  it("validateEntryCategories：名单外主分类/小分类各记一条警告；空声明不报错", () => {
    expect(validateEntryCategories(entry({ id: "demo-a" }))).toEqual([]);
    expect(validateEntryCategories(entry({ id: "demo-b", category: "development" }))).toEqual([]);
    const warnings = validateEntryCategories(
      entry({ id: "demo-c", category: "education", categories: ["terminal", "freeform"] }),
    );
    expect(warnings).toEqual([
      { code: "unknown-category", entryId: "demo-c", detail: "education" },
      { code: "unknown-subcategory", entryId: "demo-c", detail: "freeform" },
    ]);
  });

  it("primaryCategoryOf：category 在册优先 → 退第一个在册的主分类 categories[] → 退 other", () => {
    expect(primaryCategoryOf({ category: "themes", categories: ["terminal"] })).toBe("themes");
    expect(primaryCategoryOf({ category: "made-up", categories: ["made-up-2", "documents"] })).toBe("documents");
    // 小分类不是主分类——不能顶成 rail 桶（04 §5.1：categories[] = 副标签）
    expect(primaryCategoryOf({ category: "made-up", categories: ["terminal"] })).toBe(OTHER_CATEGORY_SLUG);
    expect(primaryCategoryOf({ category: "made-up", categories: ["made-up-2"] })).toBe(OTHER_CATEGORY_SLUG);
    expect(primaryCategoryOf({})).toBe(OTHER_CATEGORY_SLUG);
  });

  it("buildCategoryRailOrder：声明序消费、未注册丢弃、漏声明按规范序补齐、other 恒末位", () => {
    expect(buildCategoryRailOrder()).toEqual([
      "development",
      "documents",
      "hardware",
      "network",
      "productivity",
      "themes",
      "entertainment",
      "other",
    ]);
    expect(buildCategoryRailOrder({ order: ["themes", "nope", "development"] })).toEqual([
      "themes",
      "development",
      "documents",
      "hardware",
      "network",
      "productivity",
      "entertainment",
      "other",
    ]);
    // 声明里写 other 也不改变末位
    const withOtherFirst = buildCategoryRailOrder({ order: ["other", "themes"] });
    expect(withOtherFirst[withOtherFirst.length - 1]).toBe("other");
  });

  it("groupByPrimaryCategory：按 rail 序、空桶不产出、other 末位", () => {
    const groups = groupByPrimaryCategory([
      entry({ id: "demo-1", category: "themes" }),
      entry({ id: "demo-2", category: "development" }),
      entry({ id: "demo-3" }), // 无声明 → other
      entry({ id: "demo-4", category: "made-up" }), // 写错 → other
    ]);
    expect(groups.map((g) => g.slug)).toEqual(["development", "themes", "other"]);
    expect(groups[groups.length - 1].entries.map((e) => e.id)).toEqual(["demo-3", "demo-4"]);
  });
});

/* ── parse v2 根级字段 + 声明警告（06 §二·3/§三） ── */

describe("parseCatalog — v2 根级字段与声明警告", () => {
  it("v1 旧目录：根级字段缺省 ⇒ undefined、零警告（双向兼容）", () => {
    const r = parseCatalog(JSON.stringify({ version: "1", plugins: [entry({ id: "demo-a", category: "themes" })] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.catalog.sources).toBeUndefined();
    expect(r.catalog.collections).toBeUndefined();
    expect(r.catalog.categoryRail).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it("根级 sources/collections/categoryRail 进解析面；坏行跳过并记警告", () => {
    const r = parseCatalog(
      JSON.stringify({
        plugins: [entry({ id: "demo-a" })],
        sources: [
          { url: "https://github.com/owner-two/catalog-repo-b", authorId: "owner-two", addedAt: "2026-11-20" },
          { url: "https://example.invalid/broken" }, // 缺 authorId/addedAt
        ],
        collections: [
          { id: "picks", title: "编辑推荐", items: ["demo-a"], layout: "strip" },
          { id: "bad" }, // 缺 title/items
        ],
        categoryRail: { order: ["themes", "made-up", "other"], icons: { themes: "lucide:palette" } },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.catalog.sources).toEqual([
      { url: "https://github.com/owner-two/catalog-repo-b", authorId: "owner-two", addedAt: "2026-11-20" },
    ]);
    expect(r.catalog.collections).toEqual([
      { id: "picks", title: "编辑推荐", subtitle: undefined, hint: undefined, cover: undefined, layout: "strip", items: ["demo-a"], order: undefined },
    ]);
    expect(r.catalog.categoryRail?.icons).toEqual({ themes: "lucide:palette" });
    expect(r.warnings.map((w) => w.code).sort()).toEqual(["invalid-collection", "invalid-source-link", "unknown-rail-category"]);
  });

  it("条目分类名单外 ⇒ 警告（原值保留，归桶靠 primaryCategoryOf 兜）", () => {
    const r = parseCatalog(JSON.stringify({ plugins: [entry({ id: "demo-a", category: "education", categories: ["terminal", "x"] })] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.catalog.plugins[0].category).toBe("education");
    expect(r.warnings).toEqual([
      { code: "unknown-category", entryId: "demo-a", detail: "education" },
      { code: "unknown-subcategory", entryId: "demo-a", detail: "x" },
    ]);
  });

  it("截图视频项：首段视频保留；越位/多段丢弃并记警告（⛔ 不静默降级成图）", () => {
    const r = parseCatalog(
      JSON.stringify({
        plugins: [
          entry({
            id: "demo-a",
            screenshots: [
              { type: "video", url: "https://example.invalid/a.mp4", poster: "https://example.invalid/a.png" },
              "https://example.invalid/1.png",
              { type: "video", url: "https://example.invalid/b.mp4" },
            ],
          }),
          entry({
            id: "demo-b",
            screenshots: ["https://example.invalid/1.png", { type: "video", url: "https://example.invalid/c.mp4" }],
          }),
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.catalog.plugins[0].screenshots).toEqual([
      { type: "video", url: "https://example.invalid/a.mp4", poster: "https://example.invalid/a.png" },
      "https://example.invalid/1.png",
    ]);
    expect(r.catalog.plugins[1].screenshots).toEqual(["https://example.invalid/1.png"]);
    expect(r.warnings).toEqual([
      { code: "screenshot-video-restricted", entryId: "demo-a", detail: "video@2" },
      { code: "screenshot-video-restricted", entryId: "demo-b", detail: "video@1" },
    ]);
  });
});

/* ── 厂商注册表（09 §一·补2） ── */

describe("vendors — vendors.json 解析与官方 ✓ 注入", () => {
  it("坏 JSON / 非数组 / 缺 vendorId 的行 → 忽略（不阻塞目录）", () => {
    expect(parseVendors("{ bad")).toEqual([]);
    expect(parseVendors(JSON.stringify({ vendorId: "x" }))).toEqual([]);
    expect(parseVendors(JSON.stringify([{ name: "无键" }, { vendorId: "acme", name: "Acme" }]))).toEqual([
      { vendorId: "acme", name: "Acme", domains: undefined, githubOrgs: undefined, verifiedBy: undefined, verifiedAt: undefined },
    ]);
  });

  it("withVendorIds：authorId 命中才注入；未命中/无 authorId 原样", () => {
    const ids = vendorIdSetOf([{ vendorId: "owner-one", name: "One" }]);
    const out = withVendorIds(
      [entry({ id: "demo-a", authorId: "owner-one" }), entry({ id: "demo-b", authorId: "owner-two" }), entry({ id: "demo-c" })],
      ids,
    );
    expect(out[0].vendorId).toBe("owner-one");
    expect(out[1].vendorId).toBeUndefined();
    expect(out[2].vendorId).toBeUndefined();
  });

  it("空注册表 → 原数组返回（零改动路径）", () => {
    const list = [entry({ id: "demo-a", authorId: "owner-one" })];
    expect(withVendorIds(list, new Set())).toBe(list);
  });
});

/* ── K5 回落链末段（11 §二） ── */

describe("synthesizeEntryFromManifest — 单插件仓合成 1 条目录", () => {
  const SOURCE = "https://raw.githubusercontent.com/owner-two/demo-plugin-repo/HEAD/marketplace.json";

  it("plugin.json → 目录条目（身份/版本/作者/下载址/仓库主页）", () => {
    const e = synthesizeEntryFromManifest(
      JSON.stringify({
        pluginId: "demo-alpha",
        name: "Demo Alpha",
        version: "2.1.0",
        description: "演示",
        author: "Owner Two",
        icon: "https://example.invalid/icon.png",
        iconSource: "url",
        category: "development",
        categories: ["terminal"],
        minAppVersion: "0.2.0",
      }),
      SOURCE,
    );
    expect(e).toEqual({
      id: "demo-alpha",
      name: "Demo Alpha",
      version: "2.1.0",
      description: "演示",
      author: { name: "Owner Two" },
      icon: "https://example.invalid/icon.png",
      iconSource: "url",
      marketIcon: undefined,
      marketIconSource: undefined,
      category: "development",
      categories: ["terminal"],
      downloadUrl:
        "https://github.com/owner-two/demo-plugin-repo/releases/download/v2.1.0/demo-alpha.linkdesk-plugin",
      minAppVersion: "0.2.0",
      repository: "https://github.com/owner-two/demo-plugin-repo",
      sourceName: undefined,
      official: undefined,
    });
  });

  it("相对图标路径丢弃（未装态恒 404）；缺身份三件不合成", () => {
    const e = synthesizeEntryFromManifest(
      JSON.stringify({ pluginId: "demo-alpha", name: "Demo Alpha", version: "1.0.0", icon: "resources/icon.svg" }),
      SOURCE,
    );
    expect(e?.icon).toBeUndefined();
    expect(synthesizeEntryFromManifest(JSON.stringify({ name: "x", version: "1.0.0" }), SOURCE)).toBeNull();
    expect(synthesizeEntryFromManifest("{ bad", SOURCE)).toBeNull();
  });
});

/* ── 三源合并（R4-2.2） ── */

describe("mergeCatalogsWithReceipt — 合并序与冲突回执", () => {
  it("版本平手先到者胜（官方排前）；高版本后到者胜并留回执", () => {
    const official = entry({ id: "demo-a", version: "1.0.0" });
    const collected = entry({ id: "demo-a", version: "1.0.0" });
    const user = entry({ id: "demo-a", version: "1.2.0" });
    const r = mergeCatalogsWithReceipt([
      { sourceName: "official/repo", official: true, entries: [official] },
      { sourceName: "collected/repo", entries: [collected] },
      { sourceName: "user/repo", entries: [user] },
    ]);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ version: "1.2.0", sourceName: "user/repo" });
    expect(r.deduped.map((d) => [d.kept, d.dropped])).toEqual([
      ["official/repo", "collected/repo"],
      ["user/repo", "official/repo"],
    ]);
  });

  it("mergeCatalogs 仍只返回条目（既有调用面不变）", () => {
    const r = mergeCatalogs([{ sourceName: "official/repo", official: true, entries: [entry({ id: "demo-a" })] }]);
    expect(r).toHaveLength(1);
    expect(r[0].official).toBe(true);
  });
});
