/**
 * StoreView 冒烟（棒 6）——用**注入目录**跑真实数据链（不碰网络）：
 *   catalog IO → 解析/归桶 → rail 计数 → 首页板块 → 分类页 chips。
 *
 * fixture 全虚构（硬约束 21）；i18n 走 key 即文案的 mock（与 catalogRowSmoke 同款）。
 * 钉住 R4-2.9 的 UI 侧读数：分类 rail 归位、空桶灰显、小类 chip 有货即显、「其他」桶落位。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import StoreView from "../views/store/StoreView";
import { __setCatalogIO } from "../services/marketSources";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";
import { __resetRealmSlots } from "../services/realmSlot";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k,
  }),
}));

const CATALOG = {
  version: "1",
  updatedAt: "2026-01-01T00:00:00.000Z",
  plugins: [
    {
      id: "demo-dev-one",
      name: "Demo Dev One",
      version: "1.0.0",
      description: "Demo development plugin",
      category: "development",
      categories: ["code-editing"],
    },
    {
      id: "demo-theme-one",
      name: "Demo Theme One",
      version: "1.0.0",
      description: "Demo theme plugin",
      category: "themes",
      categories: ["color-scheme"],
    },
    {
      id: "demo-third-party",
      name: "Demo Third Party",
      version: "0.1.0",
      description: "No category declared",
    },
  ],
  collections: [
    { id: "featured", title: "Featured", layout: "banner", items: ["demo-theme-one"] },
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
    configuration: { get: vi.fn(async () => []), onChange: vi.fn(() => unsub) },
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
    commands: {
      registerCommand: vi.fn(),
      executeCommand: vi.fn(async () => ({ ok: true, changed: false, count: 0 })),
    },
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
  stubLinkdesk();
  __setCatalogIO(
    async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return JSON.stringify(CATALOG);
      throw new Error("network");
    },
    memoryStorage(),
  );
});

afterEach(() => {
  cleanup();
  __setCatalogIO(null, null);
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  vi.restoreAllMocks();
});

describe("StoreView 冒烟（注入目录）", () => {
  it("首页：hero 来自 banner 合集；rail 归位/空桶灰显；分类瓷片只列有货", async () => {
    const { container } = render(<StoreView isActive />);
    await waitFor(() => expect(screen.getAllByText("Demo Theme One").length).toBeGreaterThan(0));

    // hero（banner 合集）渲染 + 合集标题
    expect(screen.getByText("Featured")).toBeTruthy();
    // rail：开发/主题有货，网络 0（灰显类），其他 1（未声明件）
    const railButtons = [...container.querySelectorAll(".marketplace-store-rail-scroll [data-rail-item]")];
    const bySlug = new Map(railButtons.map((b) => [(b as HTMLElement).dataset.railItem, b as HTMLElement]));
    expect(bySlug.get("development")?.textContent).toContain("1");
    expect(bySlug.get("themes")?.textContent).toContain("1");
    expect(bySlug.get("network")?.className).toContain("is-empty");
    expect(bySlug.get("other")?.textContent).toContain("1");
    // 首页瓷片：只列出有货分类（开发/主题/其他）——网络不出瓷片
    const tiles = [...container.querySelectorAll(".marketplace-store-cat-tile")].map(
      (t) => (t as HTMLElement).dataset.category,
    );
    expect(tiles).toEqual(["development", "themes", "other"]);
  });

  it("分类页：小类 chip 有货即显（≥1）＋未标注兜底；「其他」桶诚实空态可进", async () => {
    const { container } = render(<StoreView isActive />);
    await waitFor(() => expect(screen.getAllByText("Demo Dev One").length).toBeGreaterThan(0));

    // 点 rail「开发」
    const dev = container.querySelector('[data-rail-item="development"]') as HTMLElement;
    fireEvent.click(dev);
    await waitFor(() => expect(screen.getByText("tag.code-editing")).toBeTruthy());
    // chip 行：封闭名单有货才出现；本分类只有 code-editing（无未标注）
    expect(screen.getByText("tag.code-editing")).toBeTruthy();
    expect(screen.queryByText(/未标注小类/)).toBeNull();

    // 点「其他」：未声明件在，无小类 → 未标注兜底 chip
    const other = container.querySelector('[data-rail-item="other"]') as HTMLElement;
    fireEvent.click(other);
    await waitFor(() => expect(screen.getAllByText("Demo Third Party").length).toBeGreaterThan(0));
    expect(screen.getByText("未标注小类 · 1")).toBeTruthy();
  });

  it("搜索：键入即搜索页；清空回原视图（首页）", async () => {
    render(<StoreView isActive />);
    await waitFor(() => expect(screen.getAllByText("Demo Theme One").length).toBeGreaterThan(0));
    const input = screen.getByLabelText("搜索插件") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Theme" } });
    await waitFor(() => expect(screen.getByText("搜索")).toBeTruthy());
    expect(screen.getAllByText("Demo Theme One").length).toBeGreaterThan(0);
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() => expect(screen.queryByText("搜索")).toBeNull());
  });
});
