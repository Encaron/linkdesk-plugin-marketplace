/** libraryData 测试（棒 8 · R4-3.12/3.13）——库行的组装/筛选/排序/分组/统计。 */

import { describe, it, expect } from "vitest";
import type { PluginInfoEntry, PluginListEntry } from "@linkdesk/contracts";
import type { CatalogEntry } from "../services/marketCatalog";
import {
  buildLibraryRows,
  EMPTY_LIB_FILTERS,
  filterLibraryRows,
  libraryAuthorOptions,
  libraryRepoOptions,
  libraryStats,
  orderLibraryRows,
  purchasedNotInstalled,
} from "../views/store/library/libraryData";

const CATALOG: CatalogEntry[] = [
  {
    id: "demo-one",
    name: "Alpha",
    version: "2.0.0",
    publishedAt: "2026-02-01",
    size: 100,
    sourceName: "official/goods",
    official: true,
    categories: [],
  },
  {
    id: "demo-two",
    name: "Beta",
    version: "0.9.0",
    publishedAt: "2026-01-01",
    size: 300,
    sourceName: "author-one/shop",
    authorId: "author-one",
    author: "Author One",
  },
  {
    id: "demo-three",
    name: "Gamma",
    version: "1.0.0",
    size: 50,
    sourceName: "author-one/shop",
    authorId: "author-one",
    author: "Author One",
    pricing: { model: "paid", price: 10, cu: undefined } as never,
  },
];

const installed: PluginListEntry[] = [
  { pluginId: "demo-one", manifest: { name: "Alpha", version: "1.0.0" }, updatable: true },
  { pluginId: "demo-two", manifest: { name: "Beta", version: "0.9.0" } },
  { pluginId: "demo-local", manifest: { name: "Local One", version: "0.1.0" } },
];

const disabled: PluginInfoEntry[] = [
  { pluginId: "demo-three", name: "Gamma", version: "1.0.0" },
];

const rows = buildLibraryRows({
  catalog: CATALOG,
  installed,
  disabled,
  localInstalls: [{ pluginId: "demo-local", sourcePath: "E:\tools\local-one", installedAt: 1 }],
  licenses: new Map([["demo-three", { exp: 9_999_999_999 }]]),
});

describe("buildLibraryRows", () => {
  it("已装 ⊕ 禁用 ⊕ 目录 ⊕ 本地溯源：状态/来源/作者/仓库", () => {
    const byId = new Map(rows.map((r) => [r.entry.id, r]));
    expect(byId.get("demo-one")?.state).toBe("update");
    expect(byId.get("demo-one")?.source).toBe("official");
    expect(byId.get("demo-two")?.state).toBe("installed");
    expect(byId.get("demo-two")?.author).toBe("Author One");
    expect(byId.get("demo-three")?.state).toBe("disabled");
    expect(byId.get("demo-three")?.license).toBeTruthy();
    expect(byId.get("demo-local")?.source).toBe("local");
    expect(byId.get("demo-local")?.localPath).toBe("E:\tools\local-one");
  });

  it("统计：已装 4 / 可更新 1 / 已停用 1", () => {
    expect(libraryStats(rows)).toEqual({ installed: 4, updatable: 1, disabled: 1 });
  });
});

describe("筛选", () => {
  it("状态 / 来源 / 作者 / 仓库 / 搜索叠加", () => {
    expect(filterLibraryRows(rows, { ...EMPTY_LIB_FILTERS, status: "upd" }, "").map((r) => r.entry.id)).toEqual(["demo-one"]);
    expect(
      filterLibraryRows(rows, { ...EMPTY_LIB_FILTERS, source: "local" }, "").map((r) => r.entry.id),
    ).toEqual(["demo-local"]);
    expect(
      filterLibraryRows(rows, { ...EMPTY_LIB_FILTERS, author: "Author One" }, "").map((r) => r.entry.id).sort(),
    ).toEqual(["demo-three", "demo-two"]);
    expect(filterLibraryRows(rows, EMPTY_LIB_FILTERS, "beta").map((r) => r.entry.id)).toEqual(["demo-two"]);
    expect(libraryAuthorOptions(rows)).toEqual(["Author One"]);
    expect(new Set(libraryRepoOptions(rows))).toEqual(
      new Set(["E:\tools\local-one", "author-one/shop", "official/goods"]),
    );
  });
});

describe("排序/分组", () => {
  const ids = (nodes: ReturnType<typeof orderLibraryRows>) =>
    nodes.map((n) => (n.kind === "row" ? n.row.entry.id : `#${n.label}`));

  it("名称 / 最近更新 / 包大小 / 来源；可更新置顶", () => {
    expect(ids(orderLibraryRows(rows, "name", false))).toEqual([
      "demo-one",
      "demo-two",
      "demo-three",
      "demo-local",
    ]);
    expect(ids(orderLibraryRows(rows, "name", true))[0]).toBe("demo-one"); // 可更新置顶
    expect(ids(orderLibraryRows(rows, "updated", false))[0]).toBe("demo-one");
    expect(ids(orderLibraryRows(rows, "size", false))[0]).toBe("demo-two");
    expect(ids(orderLibraryRows(rows, "source", false))[0]).toBe("demo-one");
  });

  it("按作者 / 按仓库出分组头", () => {
    const authorNodes = orderLibraryRows(rows, "author", false);
    expect(new Set(authorNodes.filter((n) => n.kind === "group").map((n) => (n.kind === "group" ? n.label : "")))).toEqual(
      new Set(["Author One", "—"]),
    );
    expect(
      new Set(authorNodes.filter((n) => n.kind === "row").map((n) => (n.kind === "row" ? n.row.entry.id : ""))),
    ).toEqual(new Set(["demo-one", "demo-two", "demo-three", "demo-local"]));

    const repoNodes = orderLibraryRows(rows, "repo", false);
    expect(new Set(repoNodes.filter((n) => n.kind === "group").map((n) => (n.kind === "group" ? n.label : "")))).toEqual(
      new Set(["official/goods", "author-one/shop", "E:\tools\local-one"]),
    );
    // 组内按名：Author One 组里 Alpha < Gamma（beta 是 demo-two 的名字 Beta）
    const authorOne = authorNodes.findIndex((n) => n.kind === "group" && n.label === "Author One");
    expect(authorNodes[authorOne + 1]).toMatchObject({ kind: "row", row: { entry: { id: "demo-two" } } });
  });
});

describe("已购未安装", () => {
  it("有许可、有 pricing、未装包", () => {
    const paidCatalog: CatalogEntry[] = [
      { id: "p1", name: "Paid One", version: "1.0.0", pricing: { model: "paid", price: 1 } },
      { id: "p2", name: "Paid Two", version: "1.0.0", pricing: { model: "paid", price: 2 } },
    ];
    expect(
      purchasedNotInstalled(paidCatalog, new Map([["p1", { exp: 1 }], ["p2", { exp: 1 }]]), rows).map((e) => e.id),
    ).toEqual(["p1", "p2"]);
  });
});
