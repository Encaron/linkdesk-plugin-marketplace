/**
 * storeRead —— `marketplace.getState` 的唯一实现单测。
 * 钉：当前路由、价格/分类/作者原样读、本地状态四态、能力布尔、作者/仓库分组、来源计数。
 * 全部走模块替身（catalog/authors/sources/storeNav）＋ window.linkdesk 桩；⛔ 不碰 DOM。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  catalog: { entries: [] as unknown[], collections: [] as unknown[], railOrder: [] as string[] },
  sources: [] as unknown[],
  authors: [] as unknown[],
  route: { page: "home" } as unknown,
}));

vi.mock("../services/marketplaceShared/catalogStore", () => ({
  getCatalogResult: () => mocks.catalog,
  reprojectCatalog: async () => mocks.catalog,
  refreshCatalogNow: async () => ({ ok: true, changed: false }),
}));
vi.mock("../services/marketSources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/marketSources")>()),
  readSourceRecords: async () => mocks.sources,
}));
vi.mock("../services/authors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/authors")>()),
  knownAuthorIds: async () => ["linkdesk-fixture-alice"],
  ensureAuthorDomains: async () => {},
  getLoadedAuthorDomains: () => mocks.authors,
}));
vi.mock("../services/storeNav", () => ({
  readCurrentStoreRoute: async () => mocks.route,
  NAV_COMMANDS: {
    home: "marketplace.openStore",
    category: "marketplace.openCategory",
    rank: "marketplace.openRank",
    authors: "marketplace.openAuthors",
    library: "marketplace.openLibrary",
    author: "marketplace.openAuthor",
    search: "marketplace.search",
  },
}));

import { readStoreState } from "../services/storeRead";

const entry = (patch: Record<string, unknown>) => ({
  id: "demo",
  name: "Demo",
  version: "1.0.0",
  downloadUrl: "https://example.com/demo.linkdesk-plugin",
  ...patch,
});

beforeEach(() => {
  mocks.catalog = {
    entries: [
      entry({
        id: "demo-bundle",
        name: "Bob 全家桶",
        author: { name: "Bob" },
        authorId: "bob",
        category: "productivity",
        pricing: { model: "paid", price: 128, currency: "¥" },
      }),
      entry({
        id: "demo-sub",
        name: "Bob 订阅",
        author: { name: "Bob" },
        authorId: "bob",
        category: "productivity",
        pricing: { model: "subscription", price: 8, currency: "¥", period: "月" },
      }),
      entry({ id: "demo-installed", name: "已装件", author: "Alice", authorId: "alice" }),
      entry({ id: "demo-disabled", name: "停用件", author: "Alice", authorId: "alice" }),
      entry({ id: "demo-core", name: "内置件", author: "官方" }),
      entry({
        id: "demo-alice-theme",
        name: "Alice 晨雾主题",
        author: "Alice",
        authorId: "linkdesk-fixture-alice",
        category: "themes",
      }),
      entry({ id: "demo-official-dev", name: "官方开发件", author: "官方", category: "development", official: true }),
    ],
    collections: [{ id: "col-bob", title: "Bob 的效率双件", layout: "duo", items: ["demo-bundle", "demo-sub"] }],
    railOrder: ["development", "productivity", "other"],
  };
  mocks.sources = [
    { kind: "remote", url: "https://github.com/bob/repo", authorId: "bob", repoId: "repo", enabled: true, status: "ok" },
    { kind: "remote", url: "https://github.com/old/repo", authorId: "old", repoId: "repo", enabled: false, status: "ok" },
  ];
  mocks.authors = [
    {
      authorId: "linkdesk-fixture-alice",
      name: "Alice 光栅工坊",
      storeTitle: "Alice 的小店",
      repos: [
        { id: "alpha-themes", name: "Alice 主题铺", plugins: [{ id: "demo-installed" }] },
      ],
    },
  ];
  mocks.route = { page: "category", category: "themes", authorId: "linkdesk-fixture-alice" };

  const pluginManager = {
    list: vi.fn(async () => [
      { pluginId: "demo-installed", manifest: { version: "1.0.0" }, updatable: true },
      { pluginId: "demo-core", manifest: { version: "1.0.0", core: true } },
    ]),
    getDisabled: vi.fn(async () => [{ pluginId: "demo-disabled", version: "0.9.0", updatable: false }]),
  };
  const licenses = {
    list: vi.fn(async () => [
      { pluginId: "demo-bundle", verifiedAt: "2026-11-22T00:00:00Z" },
      { pluginId: "demo-sub", exp: 1_900_000_000, verifiedAt: "2026-11-22T00:00:00Z" },
    ]),
  };
  Object.defineProperty(window, "linkdesk", { value: { pluginManager, licenses }, configurable: true });
});

describe("readStoreState —— AI 读取面", () => {
  it("当前路由 + 当前页可见条目 + 每页导航命令", async () => {
    const s = await readStoreState();
    expect(s.route).toEqual({ page: "category", category: "themes", authorId: "linkdesk-fixture-alice" });
    // D1（19 §一/§五）：分类页只算 currentRepo（默认官方核心仓）——route 上的旧 authorId 预过滤已作废
    expect(s.visibleEntryIds).toEqual([]);
    expect(s.currentRepo).toEqual({ authorId: "official", repoId: "linkdesk-marketplace" });
    expect(s.visibleAuthorIds).toEqual([]);
    expect(s.navCommands).toEqual([
      "marketplace.openStore",
      "marketplace.openCategory",
      "marketplace.openRank",
      "marketplace.openAuthors",
      "marketplace.openLibrary",
      "marketplace.openAuthor",
      "marketplace.search",
    ]);
  });

  it("价格/分类/作者原样读（Bob 全家桶 ¥128 可读）", async () => {
    const s = await readStoreState();
    const bundle = s.entries.find((e) => e.id === "demo-bundle")!;
    expect(bundle.name).toBe("Bob 全家桶");
    expect(bundle.pricing).toEqual({ model: "paid", price: 128, currency: "¥" });
    expect(bundle.author).toBe("Bob");
    expect(bundle.authorId).toBe("bob");
    expect(bundle.category).toBe("productivity");
    expect(bundle.state).toBe("install");
    expect(bundle.capabilities.install).toBe(true);
    expect(bundle.license).toEqual({ exp: undefined });
  });

  it("本地状态四态 + 能力：已装可停用/卸载，停用可启用，core 不可卸载", async () => {
    const s = await readStoreState();
    const installed = s.entries.find((e) => e.id === "demo-installed")!;
    expect(installed.state).toBe("installed"); // updatable 但目录无更高版本
    expect(installed.capabilities).toMatchObject({ disable: true, uninstall: true, install: false });
    const disabled = s.entries.find((e) => e.id === "demo-disabled")!;
    expect(disabled.state).toBe("disabled");
    expect(disabled.capabilities).toMatchObject({ enable: true, install: false });
    const core = s.entries.find((e) => e.id === "demo-core")!;
    expect(core.core).toBe(true);
    expect(core.capabilities.uninstall).toBe(false);
  });

  it("合集/作者仓库/来源/计数全量可读", async () => {
    const s = await readStoreState();
    expect(s.collections).toEqual([
      { id: "col-bob", title: "Bob 的效率双件", layout: "duo", items: ["demo-bundle", "demo-sub"] },
    ]);
    expect(s.authors).toEqual([
      {
        authorId: "linkdesk-fixture-alice",
        name: "Alice 光栅工坊",
        storeTitle: "Alice 的小店",
        repos: [{ id: "alpha-themes", name: "Alice 主题铺", pluginIds: ["demo-installed"] }],
      },
    ]);
    expect(s.sources).toHaveLength(2);
    expect(s.counts).toEqual({ entries: 7, installed: 2, updates: 0, authors: 1, remoteSources: 1 });
    expect(s.authorOrder).toEqual(["official"]);
    expect(s.repoOrder).toEqual({ official: ["linkdesk-marketplace"] });
    expect(s.authorOrder).toContain("official");
  });
});

describe("visibleEntryIds —— 各页可见切片", () => {
  it("首页：hero/合集/主题专区/热门下载并集", async () => {
    mocks.route = { page: "home" };
    const s = await readStoreState();
    // D1：首页 = 当前仓首页（官方核心仓），⛔ 不再是全源并集
    expect(s.visibleEntryIds).toEqual(["demo-official-dev"]);
    expect(s.visibleAuthorIds).toEqual(["official"]);
  });

  it("排行榜：只算 currentRepo Top（无缓存计数时按名稳定排序，最多 50）", async () => {
    mocks.route = { page: "rank" };
    const s = await readStoreState();
    expect(s.visibleEntryIds).toEqual(["demo-official-dev"]);
  });

  it("官方分类：只留 official 源（官方店「更多」落页）", async () => {
    mocks.route = { page: "category", category: "development", official: true };
    const s = await readStoreState();
    expect(s.visibleEntryIds).toEqual(["demo-official-dev"]);
  });

  it("库：已装/停用 ∪ 已购未安装（不含未购主题）", async () => {
    mocks.route = { page: "library" };
    const s = await readStoreState();
    expect(s.visibleEntryIds).toEqual(
      expect.arrayContaining(["demo-installed", "demo-core", "demo-disabled", "demo-bundle", "demo-sub"]),
    );
    expect(s.visibleEntryIds).not.toContain("demo-alice-theme");
    expect(s.visibleEntryIds).toHaveLength(5);
  });

  it("作者列表：条目为空、作者按名可读", async () => {
    mocks.route = { page: "authors" };
    const s = await readStoreState();
    expect(s.visibleEntryIds).toEqual([]);
    expect(s.visibleAuthorIds).toEqual(["official", "linkdesk-fixture-alice"]);
  });
});
