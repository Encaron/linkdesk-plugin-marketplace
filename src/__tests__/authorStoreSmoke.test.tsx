/**
 * 作者店冒烟（棒 7）——用**注入目录＋注入作者块**跑真实数据链（不碰网络）：
 *   catalog → authorId 聚合 → 首页作者卡 → 作者店（hero/合集/scope:self 榜单/grid/按分类浏览/门店卡）。
 *
 * 判据（09 §二 / 08 §三·v3.57 U4）：
 *   - 三入口进同一店（本测走首页作者卡）；
 *   - 门店卡官方第一、当前仓 ring；切仓全换；空仓诚实空态；
 *   - 店内合集只筛**当前仓**（⛔ 第四方）；scope:self 只算本店；more 跳分类页＋authorId 预过滤；
 *   - 按分类浏览硬保留（只列有货）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import StoreView from "../views/store/StoreView";
import { __setCatalogIO } from "../services/marketSources";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";
import { __resetRealmSlots } from "../services/realmSlot";
import { __resetAuthorsState } from "../services/authors";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k,
  }),
}));

const DEMO_RAW = "https://raw.githubusercontent.com/demo-owner/demo-shop/HEAD/marketplace.json";

const OFFICIAL_CATALOG = {
  version: "1",
  plugins: [
    {
      id: "official-one",
      name: "Official One",
      version: "1.0.0",
      description: "Official plugin",
      category: "hardware",
    },
  ],
};

const DEMO_CATALOG = {
  version: "1",
  plugins: [
    {
      id: "demo-one",
      name: "Demo One",
      version: "1.0.0",
      description: "Demo hardware one",
      category: "hardware",
      authorId: "demo-author",
    },
    {
      id: "demo-two",
      name: "Demo Two",
      version: "1.0.0",
      description: "Demo hardware two",
      category: "hardware",
      authorId: "demo-author",
    },
  ],
  collections: [
    { id: "demo-set", title: "Must Have", layout: "strip", items: ["demo-one", "official-one"] },
  ],
};

const AUTHOR_BLOCK = {
  authorId: "demo-author",
  name: "Demo Author",
  intro: "Demo author intro",
  storeTitle: "Demo Store",
  repos: [
    {
      id: "hw",
      name: "Hardware Repo",
      intro: "Hardware things",
      sourceUrl: "https://github.com/demo-owner/demo-shop",
      homepage: {
        storeTitle: "Demo Store",
        sections: [
          { type: "hero", slides: [{ plugin: "demo-one", tag: "Pick" }] },
          { type: "collection", collection: "demo-set", more: { label: "All hardware", target: "category:hardware" } },
          {
            type: "rank",
            top: 2,
            scope: "self",
            title: "HW Rank",
            more: { label: "Full rank", target: "rank" },
          },
          { type: "grid", title: "All plugins" },
        ],
      },
    },
    { id: "empty", name: "Empty Repo", intro: "Nothing yet" },
  ],
};

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function stubLinkdesk() {
  const unsub = () => {};
  const linkdesk = {
    configuration: {
      get: vi.fn(async (key: string) =>
        key === "marketplace.marketplaceSources" ? ["https://github.com/demo-owner/demo-shop"] : undefined,
      ),
      onChange: vi.fn(() => unsub),
    },
    pluginState: {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
      onChange: vi.fn(() => unsub),
    },
    events: { on: vi.fn(() => unsub), emit: vi.fn() },
    pluginManager: {
      list: vi.fn(async () => []),
      getDisabled: vi.fn(async () => []),
      installWithProgress: vi.fn(async () => ({ success: true })),
      update: vi.fn(async () => ({ success: true })),
      enable: vi.fn(async () => undefined),
      disable: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
    },
    commands: { registerCommand: vi.fn(), executeCommand: vi.fn(async () => ({ ok: true })) },
    menu: { registerItems: vi.fn() },
    tabs: { create: vi.fn(), openOrFocus: vi.fn() },
    toasts: { show: vi.fn() },
    dialog: { confirm: vi.fn(async () => true) },
  };
  Object.defineProperty(window, "linkdesk", { value: linkdesk, configurable: true });
  return linkdesk;
}

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

beforeEach(() => {
  __resetRealmSlots();
  __resetAuthorsState();
  stubLinkdesk();
  __setCatalogIO(
    async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return JSON.stringify(OFFICIAL_CATALOG);
      if (url === DEMO_RAW) return JSON.stringify(DEMO_CATALOG);
      if (url.endsWith("/authors/demo-author.json") && url.includes("demo-owner/demo-shop")) {
        return JSON.stringify(AUTHOR_BLOCK);
      }
      throw new Error("HTTP 404");
    },
    memoryStorage(),
  );
});

afterEach(() => {
  cleanup();
  __setCatalogIO(null, null);
  __resetAuthorsState();
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  vi.restoreAllMocks();
});

describe("作者店冒烟（注入目录＋作者块）", () => {
  it("作者页作者卡 → 作者店：hero/合集只筛当前仓/self 榜单/空仓/官方卡返回", async () => {
    const { container } = render(<StoreView isActive />);
    // D1（19 §一）：首页不再有作者区；跨作者入口 = 作者页（批 D 再加作者坞）
    fireEvent.click(container.querySelector('[data-rail-item="authors"]') as HTMLElement);
    await waitFor(() => expect(screen.getAllByText("Demo Author").length).toBeGreaterThan(0));

    const card = container.querySelector('[data-author="demo-author"]') as HTMLElement;
    expect(card).toBeTruthy();
    fireEvent.click(card);

    // 作者店：店名/hero/板块
    await waitFor(() => expect(screen.getAllByText("Demo Store").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Demo One").length).toBeGreaterThan(0);
    // 合集只筛当前仓：official-one 不在店内合集
    expect(screen.getByText("Must Have")).toBeTruthy();
    expect(screen.queryByText("Official One")).toBeNull();
    // scope:self 榜单只出本店 2 件
    expect(screen.getByText("HW Rank")).toBeTruthy();
    expect(screen.getByText("All hardware")).toBeTruthy();
    // 按分类浏览硬保留（只列有货）
    expect(screen.getByText("按分类浏览")).toBeTruthy();
    const tiles = [...container.querySelectorAll(".marketplace-store-cat-tile")].map(
      (t) => (t as HTMLElement).dataset.category,
    );
    expect(tiles).toEqual(["hardware"]);

    // 点分类瓷片 → 店内网格过滤（再点收起）
    fireEvent.click(container.querySelector(".marketplace-store-cat-tile") as HTMLElement);
    await waitFor(() =>
      expect(
        container.querySelectorAll(
          ".marketplace-store-grid.marketplace-store-mt10 .marketplace-store-card.is-grid",
        ).length,
      ).toBe(2),
    );

    // 切到空仓：诚实空态（不伪造）
    const switchBtns = [...container.querySelectorAll(".marketplace-store-author-card.is-switch")];
    const emptyBtn = switchBtns.find((b) => b.textContent?.includes("Empty Repo")) as HTMLElement;
    expect(emptyBtn).toBeTruthy();
    fireEvent.click(emptyBtn);
    await waitFor(() =>
      expect(screen.getAllByText("「Empty Repo」暂无插件").length).toBeGreaterThan(0),
    );

    // 官方卡恒排第一且可返回首页
    const officialBtn = switchBtns[0] as HTMLElement;
    expect(officialBtn.textContent).toContain("官方 Plugin Store");
    fireEvent.click(officialBtn);
    await waitFor(() => expect(screen.queryByText("HW Rank")).toBeNull());
  });

  it("作者跳转字落页：进作者仓即切 currentRepo（分类页只算该仓；⛔ 全源/逃生门已作废）", async () => {
    const { container } = render(<StoreView isActive />);
    fireEvent.click(container.querySelector('[data-rail-item="authors"]') as HTMLElement);
    await waitFor(() => expect(screen.getAllByText("Demo Author").length).toBeGreaterThan(0));
    fireEvent.click(container.querySelector('[data-author="demo-author"]') as HTMLElement);
    await waitFor(() => expect(screen.getByText("All hardware")).toBeTruthy());

    fireEvent.click(screen.getByText("All hardware"));
    // D1（19 §一/§五）：分类页 = 当前仓（进作者店时已切到 demo-author/hw）
    await waitFor(() => expect(screen.getAllByText("Demo One").length).toBeGreaterThan(0));
    expect(screen.queryByText("Official One")).toBeNull();
    // 「显示全部」全源逃生门随全源合并池一起作废
    expect(screen.queryByText("已过滤")).toBeNull();
    expect(screen.queryByText("显示全部")).toBeNull();
  });
});
