/**
 * authors 数据面测试（棒 7 · R4-3.8–3.11）——纯解析/聚合与声明警告。
 *
 * 判据（09 §二/06 §三）：
 *   - 白名单归一：块内未知字段静默丢、坏块整块跳过（缺 authorId = 致命）；
 *   - 声明警告：重复大屏 / 未知板块 / 引用不存在的合集——三者都要产出（来源页计数数据源）；
 *   - authorId 聚合：多仓跨块合并（同仓先去者）、插件按 sourceName 归仓、官方厂商块按 authorId 归；
 *   - 边界三态的数据基础：4+ 仓由视图侧收敛、空仓照实产出 0 件。
 */

import { describe, it, expect } from "vitest";
import {
  aggregateAuthorDomain,
  collectAuthorWarnings,
  parseAuthorBlock,
  type AuthorBlock,
} from "../services/authors";
import type { SourceRecord } from "../services/marketSources";
import type { CatalogEntry, CollectionDecl } from "../services/marketCatalog";
import { authorDeckOf, authorDeckRestCount, sortAuthorDomains } from "../views/store/authors/authorsData";

const BLOCK = {
  authorId: "demo-author",
  name: "Demo Author",
  intro: "Demo intro",
  storeTitle: "Demo Store",
  homepage: {
    sections: [
      { type: "hero", slides: [{ plugin: "demo-one", tag: "Pick" }] },
      { type: "hero", slides: [{ plugin: "demo-two" }] },
      { type: "collection", collection: "demo-set", more: { label: "All", target: "category:development" } },
      { type: "collection" },
      { type: "mystery" },
      { type: "rank", top: 3, scope: "self" },
      { type: "grid", title: "All plugins" },
    ],
  },
  repos: [
    {
      id: "main",
      name: "Main",
      intro: "Main repo",
      sourceUrl: "https://github.com/demo-owner/main-repo",
      homepage: {
        storeTitle: "Repo Store",
        sections: [{ type: "hero", slides: [{ plugin: "demo-one" }] }],
      },
    },
    { id: "empty", name: "Empty" },
  ],
  unknownField: "dropped",
};

const RECORDS: SourceRecord[] = [
  {
    kind: "remote",
    url: "https://github.com/demo-owner/main-repo",
    authorId: "demo-author",
    repoId: "main",
    enabled: true,
    status: "ok",
  },
  {
    kind: "remote",
    url: "https://github.com/demo-other/empty-repo",
    authorId: "demo-author",
    repoId: "empty",
    enabled: true,
    status: "ok",
  },
];

const ENTRIES: CatalogEntry[] = [
  { id: "demo-one", name: "Demo One", version: "1.0.0", sourceName: "demo-owner/main-repo" },
  { id: "demo-two", name: "Demo Two", version: "1.0.0", sourceName: "demo-owner/main-repo" },
  { id: "other-one", name: "Other One", version: "1.0.0", sourceName: "someone/else" },
];

const COLLECTIONS: CollectionDecl[] = [{ id: "demo-set", title: "Demo Set", items: ["demo-one"] }];

describe("parseAuthorBlock（白名单 + 声明警告）", () => {
  it("正常块：仓/板块归一；未知板块丢弃并记警告；缺合集键记警告；未知顶层字段丢弃", () => {
    const r = parseAuthorBlock(JSON.stringify(BLOCK));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.block.authorId).toBe("demo-author");
    expect(r.block.repos.map((x) => x.id)).toEqual(["main", "empty"]);
    // 未知板块（mystery）＋缺 collection 键各一条
    expect(r.warnings.map((w) => w.code).sort()).toEqual(["missing-collection", "unknown-section"]);
    // 未知顶层字段不进白名单
    expect("unknownField" in r.block).toBe(false);
    // rank 的 scope/top 与 collection 的 more 保留
    const sections = r.block.homepage!.sections;
    const rank = sections.find((s) => s.type === "rank");
    expect(rank).toMatchObject({ top: 3, scope: "self" });
    const col = sections.find((s) => s.type === "collection");
    expect(col?.more).toEqual({ label: "All", target: "category:development" });
  });

  it("致命块：坏 JSON / 非对象 / 缺 authorId → 整块跳过", () => {
    expect(parseAuthorBlock("{")).toEqual({ ok: false, reason: "invalid-json" });
    expect(parseAuthorBlock("[]")).toEqual({ ok: false, reason: "not-object" });
    expect(parseAuthorBlock(JSON.stringify({ repos: [] }))).toEqual({ ok: false, reason: "no-author-id" });
  });
});

describe("collectAuthorWarnings（聚合期声明问题）", () => {
  it("重复大屏与引用不存在的合集各记一条", () => {
    const sections = [
      { type: "hero" as const },
      { type: "hero" as const },
      { type: "collection" as const, collection: "missing" },
    ];
    const ws = collectAuthorWarnings(sections, "main", new Set(["present"]));
    expect(ws.map((w) => w.code).sort()).toEqual(["duplicate-hero", "missing-collection"]);
    expect(ws.find((w) => w.code === "missing-collection")?.detail).toBe("missing");
  });
});

describe("authorsData（视图纯推导）", () => {
  const repo = (id: string, n: number): Parameters<typeof authorDeckOf>[0][number] =>
    ({ id, name: id, plugins: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, name: `${id}-${i}`, version: "1" })) }) as never;

  it("仓卡扇出三边界：1 仓单张 / 3 仓逐张 / 4+ 仓前 2 ＋ +N", () => {
    expect(authorDeckOf([repo("a", 2)])).toEqual([{ name: "a", count: 2 }]);
    expect(authorDeckOf([repo("a", 1), repo("b", 1), repo("c", 1)])).toHaveLength(3);
    const four = authorDeckOf([repo("a", 1), repo("b", 2), repo("c", 3), repo("d", 4)]);
    expect(four).toHaveLength(3);
    expect(four[2]).toMatchObject({ count: 7, more: true });
    expect(authorDeckRestCount([repo("a", 1), repo("b", 2), repo("c", 3), repo("d", 4)])).toBe(2);
  });

  it("作者列表排序：名称 / 插件数 / 仓库数", () => {
    const a = { authorId: "a", name: "Beta", repos: [repo("r", 3)] } as never;
    const b = { authorId: "b", name: "Alpha", repos: [repo("r", 1), repo("s", 1)] } as never;
    expect(sortAuthorDomains([a, b], "name").map((d) => d.authorId)).toEqual(["b", "a"]);
    expect(sortAuthorDomains([a, b], "plugins").map((d) => d.authorId)).toEqual(["a", "b"]);
    expect(sortAuthorDomains([a, b], "repos").map((d) => d.authorId)).toEqual(["b", "a"]);
  });
});

describe("aggregateAuthorDomain（authorId 聚合）", () => {
  const parsed = parseAuthorBlock(JSON.stringify(BLOCK));
  const block: AuthorBlock = parsed.ok ? parsed.block : ({} as AuthorBlock);

  it("仓级 homepage 生效；插件按 sourceName 归仓；空仓照实 0 件", () => {
    // 合集表故意给空：验证「引用不存在的合集」在聚合期也会记警告
    const d = aggregateAuthorDomain("demo-author", [block], RECORDS, ENTRIES, [], false)!;
    expect(d.name).toBe("Demo Author");
    const main = d.repos.find((r) => r.id === "main")!;
    const empty = d.repos.find((r) => r.id === "empty")!;
    expect(main.plugins.map((p) => p.id).sort()).toEqual(["demo-one", "demo-two"]);
    expect(main.storeTitle).toBe("Repo Store");
    expect(empty.plugins).toEqual([]);
    // 块级 homepage 里重复 hero（聚合期）＋缺合集（聚合期）；未知板块是解析期警告（见上一组）
    const codes = new Set(d.warnings.map((w) => w.code));
    expect(codes.has("duplicate-hero")).toBe(true);
    expect(codes.has("missing-collection")).toBe(true);
  });

  it("多块同 authorId：同仓先去者胜（不重复翻倍）", () => {
    const second: AuthorBlock = {
      authorId: "demo-author",
      repos: [{ id: "main", name: "Main Dup" }, { id: "third", name: "Third" }],
    };
    const d = aggregateAuthorDomain("demo-author", [block, second], RECORDS, ENTRIES, COLLECTIONS, false)!;
    expect(d.repos.map((r) => r.id)).toEqual(["main", "empty", "third"]);
    // 先到块的名字保留
    expect(d.repos[0].name).toBe("Main");
  });

  it("官方厂商整店：单仓 = authorId 命中的官方条目；vendorId 命中 = 官方 ✓", () => {
    const vendorBlock: AuthorBlock = {
      authorId: "demo-vendor",
      name: "Demo Vendor",
      repos: [{ id: "vendor-main", name: "Vendor Main" }],
    };
    const entries: CatalogEntry[] = [
      { id: "demo-one", name: "Demo One", version: "1.0.0", authorId: "demo-vendor", vendorId: "demo-vendor", official: true },
      { id: "demo-two", name: "Demo Two", version: "1.0.0", authorId: "other", official: true },
    ];
    const d = aggregateAuthorDomain("demo-vendor", [vendorBlock], [], entries, [], true)!;
    expect(d.official).toBe(true);
    expect(d.repos[0].plugins.map((p) => p.id)).toEqual(["demo-one"]);
  });

  it("无块 → null（v1 源不伪造作者域）", () => {
    expect(aggregateAuthorDomain("nobody", [], RECORDS, ENTRIES, COLLECTIONS, false)).toBeNull();
  });
});
