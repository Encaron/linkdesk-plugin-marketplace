/**
 * marketplaceCommands —— I15 命令面 13 条（09 §三·补 · R4-2.5）。
 *
 * 钉四层：
 *   ① **注册面**：恰好 13 条新命令、id 与 title 逐字对得上 manifest；
 *   ② **导航面**：store 命令把意图写进 `storeNav` 信箱（跨进程）+ openOrFocus 带 `{pluginId}` 打开/聚焦商店标签
 *      （R4-V.2 真机修正：不带则壳把裸 type 当插件 id，面板画「不可用」），tabId 由 `tabs.list` 按 type 认领；
 *      `openPlugin` 走 create（pinned 缺省 true + label 解析）；
 *   ③ **数据面**：本地安装/移源/检查更新/刷新目录/全部已读/视图偏好各自调**既有唯一入口**
 *      （⛔ 第二套逻辑——本文件只测接线与回执）；
 *   ④ **回执形状**：照 09 §三·补表（含两条实现的边界：create 无 tabId、坏参不装成功）。
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  checkForPluginUpdates: vi.fn(),
  refreshCatalogNow: vi.fn(),
  markAllRead: vi.fn(),
  setViewPrefs: vi.fn(),
  getCatalogResult: vi.fn(),
  recordLocalInstall: vi.fn(),
  readStoreState: vi.fn(),
  swapAuthors: vi.fn(),
  swapRepos: vi.fn(),
  readSourceOrder: vi.fn(),
}));

vi.mock("../services/updateCheck", () => ({
  checkForPluginUpdates: mocks.checkForPluginUpdates,
}));
vi.mock("../services/marketplaceShared/catalogStore", () => ({
  refreshCatalogNow: mocks.refreshCatalogNow,
  getCatalogResult: mocks.getCatalogResult,
}));
vi.mock("../services/discoverReads", () => ({
  markAllRead: mocks.markAllRead,
}));
vi.mock("../services/marketplaceShared/uiPrefs", () => ({
  setViewPrefs: mocks.setViewPrefs,
}));
vi.mock("../services/localInstalls", () => ({
  recordLocalInstall: mocks.recordLocalInstall,
}));
vi.mock("../services/storeRead", () => ({
  readStoreState: mocks.readStoreState,
}));
vi.mock("../services/sourceAdmin", () => ({
  swapAuthors: mocks.swapAuthors,
  swapRepos: mocks.swapRepos,
  readSourceOrder: mocks.readSourceOrder,
}));
/** 测试环境不初始化插件 i18next（t() 恒 undefined）——命令面只透传 label，钉键原文即可 */
vi.mock("i18next", () => ({ default: { t: (k: string) => k } }));

import {
  registerMarketplaceStoreCommands,
  runAddLocalPlugin,
  runCheckUpdates,
  runGetState,
  runGetOrder,
  runMarkAllRead,
  runOpenAuthor,
  runOpenAuthors,
  runOpenCategory,
  runOpenLibrary,
  runSwapAuthors,
  runSwapRepos,
  runOpenPlugin,
  runOpenRank,
  runOpenSources,
  runOpenStore,
  runRefreshCatalog,
  runRemoveSource,
  runSearch,
  runSetViewPrefs,
} from "../services/marketplaceCommands";
import {
  getMarketplaceSearch,
  listenMarketplaceSearchBroadcast,
  __resetSearchState,
} from "../services/marketplaceShared/searchState";
import { __resetStoreNavState, NAV_COMMANDS } from "../services/storeNav";

type Handler = (payload: unknown) => void;

/** window.linkdesk 替身：事件总线（可手动 fire）+ tabs 桩（openOrFocus 时回放 tab:activated） */
function makeWorld(overrides: Record<string, unknown> = {}) {
  const subs = new Map<string, Set<Handler>>();
  const events = {
    on: vi.fn((channel: string, cb: Handler) => {
      if (!subs.has(channel)) subs.set(channel, new Set());
      subs.get(channel)!.add(cb);
      return () => subs.get(channel)?.delete(cb);
    }),
    emit: vi.fn((channel: string, payload: unknown) => {
      subs.get(channel)?.forEach((fn) => fn(payload));
    }),
  };
  const fire = (channel: string, payload: unknown) => subs.get(channel)?.forEach((fn) => fn(payload));

  const tabs = {
    /** R4-V.2 起 openOrFocus 带 {pluginId}（真机壳按 opts 归属面板）；回执走 tab:activated
     *  （广播 tab.pluginId = "marketplace"——序列化 DTO 无 type 字段，tabs.list 认领路不通） */
    openOrFocus: vi.fn(async (type: string) => {
      fire("tab:activated", { tabId: `tab-${type}`, pluginId: "marketplace" });
    }),
    create: vi.fn(async () => undefined),
  };
  const pluginState = {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => undefined),
    onChange: vi.fn(() => () => {}),
  };
  const linkdesk = { events, tabs, pluginState, ...overrides };
  Object.defineProperty(window, "linkdesk", { value: linkdesk, configurable: true });
  return { linkdesk, events, tabs, pluginState, fire };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetStoreNavState();
  __resetSearchState();
  mocks.getCatalogResult.mockReturnValue({ entries: [], collections: [], railOrder: [] });
  mocks.markAllRead.mockResolvedValue({ cleared: 7 });
  mocks.setViewPrefs.mockResolvedValue({ ok: true });
  mocks.checkForPluginUpdates.mockResolvedValue({ state: "ok", updatableCount: 3, checkedAt: 1 });
  mocks.refreshCatalogNow.mockResolvedValue({ ok: true, changed: true });
});

afterEach(() => {
  Reflect.deleteProperty(window, "linkdesk");
});

describe("注册面 —— 21 条新命令", () => {
  it("id/title 逐条对得上 manifest；返回注册条数 21", () => {
    const registerCommand = vi.fn();
    Object.defineProperty(window, "linkdesk", { value: { commands: { registerCommand } }, configurable: true });

    expect(registerMarketplaceStoreCommands()).toBe(21);
    const calls = registerCommand.mock.calls as Array<[string, unknown, { title: string }]>;
    expect(calls.map(([id]) => id)).toEqual([
      "marketplace.openStore",
      "marketplace.openRepoAll",
      "marketplace.openCategory",
      "marketplace.openRank",
      "marketplace.openAuthors",
      "marketplace.openLibrary",
      "marketplace.openAuthor",
      "marketplace.openPlugin",
      "marketplace.openSources",
      "marketplace.search",
      "marketplace.getState",
      "marketplace.addLocalPlugin",
      "marketplace.removeSource",
      "marketplace.checkUpdates",
      "marketplace.refreshCatalog",
      "marketplace.markAllRead",
      "marketplace.setViewPrefs",
      "marketplace.setSourcesDefaultCollapsed",
      "marketplace.swapAuthors",
      "marketplace.swapRepos",
      "marketplace.getOrder",
    ]);
    expect(calls.map(([, , meta]) => meta.title)).toEqual([
      "打开插件市场",
      "查看本仓全部插件",
      "打开分类",
      "打开排行榜",
      "打开作者列表",
      "打开我的库",
      "打开作者主页",
      "打开插件详情",
      "打开来源管理",
      "搜索插件市场",
      "读取市场状态",
      "添加本地插件",
      "移除市场源",
      "检查插件更新",
      "刷新目录内容",
      "全部标为已读",
      "设置视图偏好",
      "设置来源分组默认收起",
      "交换作者顺序",
      "交换仓库顺序",
      "读取市场顺序",
    ]);
  });

  it("commands 面缺席 ⇒ 返回 0（不抛）", () => {
    Object.defineProperty(window, "linkdesk", { value: {}, configurable: true });
    expect(registerMarketplaceStoreCommands()).toBe(0);
  });
});

describe("AI 友好化门禁 —— 每个页面都有可调命令", () => {
  it("NAV_COMMANDS 全覆盖：每条命令既已注册又已在 plugin.json 声明", () => {
    const registerCommand = vi.fn();
    Object.defineProperty(window, "linkdesk", { value: { commands: { registerCommand } }, configurable: true });
    registerMarketplaceStoreCommands();
    const registered = new Set((registerCommand.mock.calls as Array<[string]>).map(([id]) => id));
    const manifest = JSON.parse(readFileSync("plugin.json", "utf8")) as {
      contributes?: { commands?: Array<{ id?: string }> };
    };
    const declared = new Set((manifest.contributes?.commands ?? []).map((c) => c.id));
    for (const [page, commandId] of Object.entries(NAV_COMMANDS)) {
      expect(registered.has(commandId), `${page} → ${commandId} 未注册`).toBe(true);
      expect(declared.has(commandId), `${page} → ${commandId} 未声明`).toBe(true);
    }
  });
});

describe("marketplace.getState —— AI 读取面接线", () => {
  it("直接返回 readStoreState 的结构化快照（不点 DOM）", async () => {
    const snap = {
      ok: true as const,
      route: { page: "home" as const },
      navCommands: Object.values(NAV_COMMANDS),
      entries: [],
      collections: [],
      authors: [],
      sources: [],
      counts: { entries: 0, installed: 0, updates: 0, authors: 0, remoteSources: 0 },
    };
    mocks.readStoreState.mockResolvedValue(snap);
    expect(await runGetState()).toEqual(snap);
  });
});

describe("导航命令 —— 意图信箱 + 标签页", () => {
  it("openStore：意图 home 落盘/广播 + openOrFocus 带 {pluginId}（真机壳按 opts 归属面板）+ tabId 取自 tab:activated", async () => {
    const w = makeWorld();

    expect(await runOpenStore()).toEqual({ ok: true, tabId: "tab-marketplace-store" });
    expect(w.tabs.openOrFocus).toHaveBeenCalledWith("marketplace-store", { pluginId: "marketplace", label: "插件商店" });
    expect(w.pluginState.set).toHaveBeenCalledWith("marketplace", "storeNav", { page: "home" });
    expect(w.events.emit).toHaveBeenCalledWith("marketplace:storeNav", { page: "home" });
  });

  it.each([
    ["openCategory", () => runOpenCategory("development"), { page: "category", category: "development" }],
    ["openCategory(对象形)", () => runOpenCategory({ category: "themes" }), { page: "category", category: "themes" }],
    [
      "openCategory(+authorId 对象形)",
      () => runOpenCategory({ category: "themes", authorId: "linkdesk-fixture-alice" }),
      { page: "category", category: "themes", authorId: "linkdesk-fixture-alice" },
    ],
    [
      "openCategory(+official 对象形)",
      () => runOpenCategory({ category: "themes", official: true }),
      { page: "category", category: "themes", official: true },
    ],
    ["openRank", () => runOpenRank(), { page: "rank" }],
    ["openAuthors", () => runOpenAuthors(), { page: "authors" }],
    ["openLibrary", () => runOpenLibrary(), { page: "library" }],
    ["openSources", () => runOpenSources(), { page: "sources" }],
    ["openAuthor", () => runOpenAuthor("owner-two"), { page: "author", authorId: "owner-two" }],
    [
      "openAuthor(+repoId 位置形)",
      () => runOpenAuthor(["owner-two", "catalog-repo-b"]),
      { page: "author", authorId: "owner-two", repoId: "catalog-repo-b" },
    ],
  ] as const)("%s：意图载荷正确", async (_name, run, expected) => {
    const w = makeWorld();
    const r = await run();
    expect(r).toEqual({ ok: true, tabId: "tab-marketplace-store" });
    expect(w.pluginState.set).toHaveBeenCalledWith("marketplace", "storeNav", expected);
  });

  it("坏参：空 category/authorId ⇒ ok:false 且不落意图/不开标签页", async () => {
    const w = makeWorld();
    expect(await runOpenCategory("   ")).toEqual({ ok: false, tabId: "" });
    expect(await runOpenAuthor({ authorId: "" })).toEqual({ ok: false, tabId: "" });
    expect(w.pluginState.set).not.toHaveBeenCalled();
    expect(w.tabs.openOrFocus).not.toHaveBeenCalled();
  });

  it("search：搜索词同步给侧栏共享状态 + 意图 search", async () => {
    const w = makeWorld();
    await runSearch("serial");
    expect(getMarketplaceSearch()).toBe("serial");
    expect(w.pluginState.set).toHaveBeenCalledWith("marketplace", "storeNav", { page: "search", query: "serial" });
  });

  it("search：跨进程广播到达即更新共享搜索词（壳进程设词 → 池侧栏跟随）", () => {
    const w = makeWorld();
    listenMarketplaceSearchBroadcast(); // 命令注册时挂的订阅（生产由 registerMarketplaceStoreCommands 触发）
    w.fire("marketplace:search", "terminal");
    expect(getMarketplaceSearch()).toBe("terminal");
  });

  it("tabs API 缺失 ⇒ ok:false（⛔ 假装开了）", async () => {
    makeWorld({ tabs: undefined });
    expect(await runOpenStore()).toEqual({ ok: false, tabId: "" });
  });
});

describe("openPlugin —— create 路径（pinned 缺省 true + label 解析）", () => {
  it("目录名优先 → create(plugin-detail, {pinned:true,label})；tabId 恒空串（fire 型通道）", async () => {
    mocks.getCatalogResult.mockReturnValue({
      entries: [{ id: "demo-alpha", name: "Demo Alpha", version: "1.0.0" }],
      collections: [],
      railOrder: [],
    });
    const w = makeWorld();

    expect(await runOpenPlugin("demo-alpha")).toEqual({ ok: true, tabId: "" });
    expect(w.tabs.create).toHaveBeenCalledWith("plugin-detail", {
      pluginId: "demo-alpha",
      pinned: true,
      label: "Demo Alpha",
    });
    expect(w.tabs.openOrFocus).not.toHaveBeenCalled();
  });

  it("目录未加载 → 已装 manifest 名；都没有 → pluginId 兜底", async () => {
    const w = makeWorld({
      pluginManager: { list: vi.fn(async () => [{ pluginId: "demo-beta", manifest: { name: "Demo Beta" } }]) },
    });
    await runOpenPlugin({ pluginId: "demo-beta", pinned: false });
    expect(w.tabs.create).toHaveBeenCalledWith("plugin-detail", {
      pluginId: "demo-beta",
      pinned: false,
      label: "Demo Beta",
    });
  });

  it("空 pluginId ⇒ 不创建", async () => {
    const w = makeWorld();
    expect(await runOpenPlugin("")).toEqual({ ok: false, tabId: "" });
    expect(w.tabs.create).not.toHaveBeenCalled();
  });
});

describe("数据动作命令 —— 各自唯一入口", () => {
  it("addLocalPlugin：复用壳 installFromDirectory + 记溯源", async () => {
    const installFromDirectory = vi.fn(async () => ({ ok: true, pluginId: "demo-alpha" }));
    makeWorld({ pluginManager: { installFromDirectory } });

    expect(await runAddLocalPlugin("/plugins/demo-alpha")).toEqual({ ok: true });
    expect(installFromDirectory).toHaveBeenCalledWith("/plugins/demo-alpha");
    expect(mocks.recordLocalInstall).toHaveBeenCalledWith("demo-alpha", "/plugins/demo-alpha");
  });

  it("addLocalPlugin：失败/空参/旧壳不装成功", async () => {
    makeWorld({
      pluginManager: { installFromDirectory: vi.fn(async () => ({ ok: false, reason: "exists" })) },
    });
    expect(await runAddLocalPlugin("/x")).toEqual({ ok: false, reason: "exists" });
    expect(await runAddLocalPlugin("")).toEqual({ ok: false, reason: "empty" });

    makeWorld({ pluginManager: {} });
    expect(await runAddLocalPlugin("/x")).toEqual({ ok: false, reason: "unavailable" });
    expect(mocks.recordLocalInstall).not.toHaveBeenCalled();
  });

  it("removeSource：删一条、其余原始形态原样写回", async () => {
    const stored = [
      "https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/marketplace.json",
      "https://github.com/owner-three/catalog-repo-c",
    ];
    const set = vi.fn(async () => undefined);
    makeWorld({ configuration: { get: vi.fn(async () => stored), set } });

    expect(await runRemoveSource({ url: "https://github.com/owner-two/catalog-repo-b" })).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith("marketplace.marketplaceSources", [stored[1]]);
  });

  it("removeSource：not-found / official / bad index 回执", async () => {
    const set = vi.fn(async () => undefined);
    makeWorld({
      configuration: {
        get: vi.fn(async () => ["https://github.com/owner-two/catalog-repo-b"]),
        set,
      },
    });

    expect(await runRemoveSource("https://github.com/owner-nine/nope")).toEqual({ ok: false, reason: "not-found" });
    expect(await runRemoveSource("https://github.com/encaron/linkdesk-marketplace")).toEqual({
      ok: false,
      reason: "official",
    });
    expect(await runRemoveSource({ index: 9 })).toEqual({ ok: false, reason: "bad-arg" });
    expect(set).not.toHaveBeenCalled();
  });

  it("removeSource：配置写入面缺失 ⇒ 抛（⛔ 假 ok）", async () => {
    makeWorld({ configuration: { get: vi.fn(async () => []) } });
    await expect(runRemoveSource("https://github.com/owner-two/x")).rejects.toThrow(/配置写入面不可用/);
  });

  it("checkUpdates / refreshCatalog：回执按 09 表映射（ok/count 与 ok/changed）", async () => {
    makeWorld();
    expect(await runCheckUpdates()).toEqual({ ok: true, count: 3 });

    mocks.checkForPluginUpdates.mockResolvedValueOnce({ state: "failed", updatableCount: 0, checkedAt: 1 });
    expect(await runCheckUpdates()).toEqual({ ok: false, count: 0 });

    expect(await runRefreshCatalog()).toEqual({ ok: true, changed: true });
    mocks.refreshCatalogNow.mockResolvedValueOnce({ ok: false, changed: false });
    expect(await runRefreshCatalog()).toEqual({ ok: false, changed: false });
  });

  it("markAllRead：kind 校验 + cleared 回执", async () => {
    makeWorld();
    expect(await runMarkAllRead("all")).toEqual({ cleared: 7 });
    expect(mocks.markAllRead).toHaveBeenCalledWith("all");
    expect(await runMarkAllRead("nope")).toEqual({ cleared: 0, reason: "bad-arg" });
    expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
  });

  it("setViewPrefs：透传 page/view/sort；坏参/IO 失败折 ok:false", async () => {
    makeWorld();
    expect(await runSetViewPrefs({ page: "lib", view: "grid", sort: "size" })).toEqual({ ok: true });
    expect(mocks.setViewPrefs).toHaveBeenCalledWith("lib", { view: "grid", sort: "size" });

    mocks.setViewPrefs.mockResolvedValueOnce({ ok: false, reason: "bad-sort" });
    expect(await runSetViewPrefs({ page: "cat", sort: "name" })).toEqual({ ok: false, reason: "bad-sort" });

    mocks.setViewPrefs.mockRejectedValueOnce(new Error("IPC 断了"));
    expect(await runSetViewPrefs({ page: "lib", view: "grid" })).toEqual({ ok: false, reason: "io" });
  });
});

describe("顺序面（19 §4.3）—— GUI 与命令共用同一份 swap", () => {
  it("swapAuthors：三形态参数 + 结构化回执（失败原因不吞）", async () => {
    makeWorld();
    mocks.swapAuthors.mockResolvedValueOnce({
      ok: true,
      next: [],
      order: { authorOrder: ["geek", "official"], repoOrder: { geek: ["hw", "fx"] } },
    });
    expect(await runSwapAuthors({ authorIdA: "geek", authorIdB: "official" })).toEqual({
      ok: true,
      authorOrder: ["geek", "official"],
      repoOrder: { geek: ["hw", "fx"] },
    });
    expect(mocks.swapAuthors).toHaveBeenCalledWith("geek", "official");

    expect(await runSwapAuthors(["geek"])).toEqual({ ok: false, reason: "bad-arg" });
    mocks.swapAuthors.mockResolvedValueOnce({ ok: false, reason: "not-found" });
    expect(await runSwapAuthors(["geek", "nobody"])).toEqual({ ok: false, reason: "not-found" });
    expect(mocks.swapAuthors).toHaveBeenCalledTimes(2);
  });

  it("swapRepos：作者/双仓参数校验 + 回执透传", async () => {
    makeWorld();
    mocks.swapRepos.mockResolvedValueOnce({
      ok: true,
      next: [],
      order: { authorOrder: ["official"], repoOrder: { official: ["linkdesk-marketplace"] } },
    });
    expect(await runSwapRepos({ authorId: "official", repoIdA: "a", repoIdB: "b" })).toEqual({
      ok: true,
      authorOrder: ["official"],
      repoOrder: { official: ["linkdesk-marketplace"] },
    });
    expect(mocks.swapRepos).toHaveBeenCalledWith("official", "a", "b");
    expect(await runSwapRepos({ authorId: "official", repoIdA: "a" })).toEqual({ ok: false, reason: "bad-arg" });
  });

  it("getOrder：直接返回唯一真相源的顺序快照", async () => {
    makeWorld();
    mocks.readSourceOrder.mockResolvedValueOnce({
      authorOrder: ["official", "geek"],
      repoOrder: { official: ["linkdesk-marketplace"], geek: ["hw", "fx"] },
    });
    expect(await runGetOrder()).toEqual({
      ok: true,
      authorOrder: ["official", "geek"],
      repoOrder: { official: ["linkdesk-marketplace"], geek: ["hw", "fx"] },
    });
  });
});
