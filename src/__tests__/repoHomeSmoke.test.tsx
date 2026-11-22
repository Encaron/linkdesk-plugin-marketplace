/**
 * 仓库首页冒烟（19 §2/§七，批 B）——注入官方目录跑真实数据链：
 *   - 首页槽位：hero → 槽 2 仓库卡（当前作者各仓）→ 声明板块 → 分类瓷片；
 *   - 首页不再出现作者区（D1）；槽 2 有「查看全部 N 个插件」；
 *   - 全部插件页：返回仓首页 + 仓库卡横排 + 全部插件 + 分类瓷片（撤 hero/合集）。
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
  plugins: [
    { id: "demo-a", name: "Demo A", version: "1.0.0", description: "A", category: "development" },
    { id: "demo-b", name: "Demo B", version: "1.0.0", description: "B", category: "hardware" },
  ],
  collections: [
    { id: "demo-banner", title: "精选", layout: "banner", items: ["demo-a"] },
    { id: "demo-must", title: "Must", layout: "strip", items: ["demo-a", "demo-b"] },
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

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

beforeEach(() => {
  __resetRealmSlots();
  const unsub = () => {};
  Object.defineProperty(window, "linkdesk", {
    configurable: true,
    value: {
      configuration: {
        get: vi.fn(async (key: string) =>
          key === "marketplace.marketplaceSources" ? [] : undefined,
        ),
        onChange: vi.fn(() => unsub),
      },
      pluginState: {
        get: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
        onChange: vi.fn(() => unsub),
      },
      events: { on: vi.fn(() => unsub), emit: vi.fn() },
      pluginManager: { list: vi.fn(async () => []), getDisabled: vi.fn(async () => []) },
      toasts: { show: vi.fn() },
    },
  });
  __setCatalogIO(
    (async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return JSON.stringify(CATALOG);
      throw new Error("HTTP 404");
    }) as never,
    memoryStorage(),
  );
});

afterEach(() => {
  cleanup();
  __setCatalogIO(null, null);
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  vi.restoreAllMocks();
});

describe("仓库首页（批 B）", () => {
  it("槽 2 = 当前作者仓库卡 + 查看全部；首页无作者区（D1）", async () => {
    const { container } = render(<StoreView isActive />);
    await waitFor(() => expect(screen.getAllByText("官方目录").length).toBeGreaterThan(0));

    const slot = container.querySelector('[data-spec="04-6-repo-slot"]') as HTMLElement;
    expect(slot).toBeTruthy();
    expect(slot.querySelectorAll("[data-swap-kind='repo']").length).toBe(1);
    expect(slot.textContent).toContain("查看全部 2 个插件");
    expect(slot.querySelector("[aria-current='true']")).toBeTruthy();

    // D1：首页不再出现作者卡（跨作者入口 = 作者页/作者坞）
    expect(container.querySelector(".marketplace-store-author-card.has-deck")).toBeNull();
    // hero（banner 合集）在第一视觉
    expect(container.querySelector(".marketplace-store-hero")).toBeTruthy();
  });

  it("全部插件页：返回仓首页 + 仓库卡横排 + 全部插件（⛔ hero/合集）", async () => {
    const { container } = render(<StoreView isActive />);
    await waitFor(() => expect(screen.getAllByText("官方目录").length).toBeGreaterThan(0));

    const cta = screen.getByText("查看全部 2 个插件") as HTMLElement;
    fireEvent.click(cta);
    await waitFor(() => expect(screen.getByText("返回「官方目录」首页")).toBeTruthy());

    expect(container.querySelector('[data-spec="04-7-repo-all"]')).toBeTruthy();
    expect(container.querySelector('[data-spec="04-6-repo-slot"]')).toBeTruthy();
    expect(container.querySelectorAll(".marketplace-store-card.is-grid").length).toBe(2);
    expect(container.querySelector(".marketplace-store-hero")).toBeNull();
    expect(screen.queryByText("Must")).toBeNull(); // 合集板块被撤掉

    fireEvent.click(screen.getByText("返回「官方目录」首页"));
    await waitFor(() => expect(screen.queryByText("返回「官方目录」首页")).toBeNull());
    expect(container.querySelector('[data-spec="04-6-repo-slot"]')).toBeTruthy();
  });
});
