/**
 * 库＋来源冒烟（棒 8）——注入目录/已装列表/本地溯源/作者块，跑真实数据链（不碰网络）。
 *
 * 判据：
 *   - 库：统计头（已装/可更新/已停用）、行内动作、编辑模式（复选框默认隐藏→全选→批量停用）、
 *     「全部已读」调命令面；「已购未安装」空态写实；
 *   - 来源页：官方锁定行、作者组（声明提示计数）、源级停用写配置原始数组、移除二次确认调命令；
 *   - 加源弹窗：网络页签校验（非法 URL 就地报错），浮层由 OverlayPortal 承载。
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

const DEMO_URL = "https://github.com/demo-owner/demo-shop";
const DEMO_RAW = "https://raw.githubusercontent.com/demo-owner/demo-shop/HEAD/marketplace.json";

const OFFICIAL_CATALOG = { version: "1", plugins: [] };
const DEMO_CATALOG = {
  version: "1",
  plugins: [
    { id: "demo-one", name: "Demo One", version: "2.0.0", category: "hardware", authorId: "demo-author", author: { name: "Demo Author" }, publishedAt: "2026-11-01T00:00:00Z", repository: "https://github.com/demo-author/demo-shop" },
    { id: "demo-two", name: "Demo Two", version: "1.0.0", category: "hardware", authorId: "demo-author", author: { name: "Demo Author" }, publishedAt: "2026-11-01T00:00:00Z", repository: "https://github.com/demo-author/demo-shop" },
    { id: "demo-three", name: "Demo Three", version: "1.0.0", category: "hardware", authorId: "demo-author", author: { name: "Demo Author" }, publishedAt: "2026-11-01T00:00:00Z", repository: "https://github.com/demo-author/demo-shop" },
  ],
};
const AUTHOR_BLOCK = {
  authorId: "demo-author",
  name: "Demo Author",
  repos: [
    {
      id: "demo-shop",
      name: "Demo Shop",
      sourceUrl: DEMO_URL,
      homepage: { sections: [{ type: "hero" }, { type: "hero" }] },
    },
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
      get: vi.fn(async (key: string) => (key === "marketplace.marketplaceSources" ? [DEMO_URL] : undefined)),
      set: vi.fn(async () => undefined),
      onChange: vi.fn(() => unsub),
    },
    pluginState: {
      get: vi.fn(async (key: string) =>
        key === "localInstalls"
          ? [{ pluginId: "demo-local", sourcePath: "E:\tools\demo-local", installedAt: 1 }]
          : undefined,
      ),
      set: vi.fn(async () => undefined),
      onChange: vi.fn(() => unsub),
    },
    events: { on: vi.fn(() => unsub), emit: vi.fn() },
    pluginManager: {
      list: vi.fn(async () => [
        { pluginId: "demo-one", manifest: { name: "Demo One", version: "1.0.0" }, updatable: true },
        { pluginId: "demo-two", manifest: { name: "Demo Two", version: "1.0.0" } },
        { pluginId: "demo-local", manifest: { name: "Local One", version: "0.1.0" } },
      ]),
      getDisabled: vi.fn(async () => [{ pluginId: "demo-three", name: "Demo Three", version: "1.0.0" }]),
      installWithProgress: vi.fn(async () => ({ success: true })),
      update: vi.fn(async () => ({ success: true })),
      enable: vi.fn(async () => undefined),
      disable: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
    },
    commands: {
      registerCommand: vi.fn(),
      executeCommand: vi.fn(async () => ({ ok: true, cleared: 2, count: 1 })),
    },
    menu: { registerItems: vi.fn() },
    tabs: { create: vi.fn(), openOrFocus: vi.fn() },
    toasts: { show: vi.fn() },
    dialog: { confirm: vi.fn(async () => true), open: vi.fn(async () => null) },
    licenses: { list: vi.fn(async () => []) },
  };
  Object.defineProperty(window, "linkdesk", { value: linkdesk, configurable: true });
  return linkdesk;
}

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;
let api: ReturnType<typeof stubLinkdesk>;

beforeEach(() => {
  __resetRealmSlots();
  __resetAuthorsState();
  api = stubLinkdesk();
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

async function goto(page: "library" | "sources") {
  const { container } = render(<StoreView isActive />);
  await waitFor(() => expect(screen.getAllByText("Plugin Store").length).toBeGreaterThan(0));
  // 目录为空时 CatalogGate 会挡住路由——本夹具目录有 3 条，等它渲染完成
  await waitFor(() => expect(container.querySelector('[data-rail-item="library"]')).toBeTruthy());
  fireEvent.click(container.querySelector(`[data-rail-item="${page}"]`) as HTMLElement);
  return container;
}

describe("我的库（R4-3.12/3.13）", () => {
  it("统计头 / 行 / 全部已读 / 编辑批量", async () => {
    const container = await goto("library");
    await waitFor(() => expect(screen.getByText("我的库")).toBeTruthy());
    expect(screen.getByText("4 个已安装 · 1 个可更新 · 1 个已停用")).toBeTruthy();
    // 库行：目录条目 + 目录外本地件（manifest 回退）
    expect(screen.getAllByText(/Local One/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Demo Three/).length).toBeGreaterThan(0);

    // 全部已读 → 命令面（仅发现型）
    fireEvent.click(screen.getByText("全部已读"));
    await waitFor(() =>
      expect(api.commands.executeCommand).toHaveBeenCalledWith("marketplace.markAllRead", { kind: "all" }),
    );

    // 编辑：复选框默认隐藏 → 进入后出现 → 全选 → 批量停用
    expect(container.querySelectorAll(".marketplace-store-lib-check").length).toBe(0);
    fireEvent.click(screen.getByText("编辑"));
    await waitFor(() => expect(container.querySelectorAll(".marketplace-store-lib-check").length).toBe(4));
    fireEvent.click(screen.getByText("全选"));
    await waitFor(() => expect(screen.getByText("已选 4 项")).toBeTruthy());
    fireEvent.click(screen.getByText("批量停用"));
    await waitFor(() => expect(api.pluginManager.disable).toHaveBeenCalledTimes(3));
  });
});

describe("来源管理（R4-3.14/3.15）", () => {
  it("官方锁定行 / 作者组与声明提示 / 源级停用写配置 / 移除二次确认", async () => {
    const container = await goto("sources");
    await waitFor(() => expect(screen.getByText("官方 Plugin Store")).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText("Demo Author").length).toBeGreaterThan(0));
    // 声明提示：block 里两个 hero → 1 条
    expect(screen.getByText("1 条声明提示")).toBeTruthy();

    // 源级停用：写回原始数组（string → 记录 + enabled:false）
    const toggle = container.querySelector(".marketplace-store-src-line .marketplace-store-sbtn") as HTMLElement;
    fireEvent.click(toggle);
    await waitFor(() => expect(api.configuration.set).toHaveBeenCalled());
    const written = api.configuration.set.mock.calls[0][1] as Array<{ enabled?: boolean }>;
    expect(written[0]).toMatchObject({ enabled: false });

    // 移除：二次确认 → 命令面
    const removeBtn = container.querySelector(".marketplace-store-src-line .marketplace-store-src-icon.is-danger") as HTMLElement;
    fireEvent.click(removeBtn);
    await waitFor(() => expect(screen.getByText("移除市场源")).toBeTruthy());
    fireEvent.click(screen.getByText("移除源"));
    await waitFor(() =>
      expect(api.commands.executeCommand).toHaveBeenCalledWith("marketplace.removeSource", { url: DEMO_URL }),
    );
  });

  it("加源弹窗：网络页签非法 URL 就地报错（OverlayPortal 承载）", async () => {
    const container = await goto("sources");
    await waitFor(() => expect(screen.getByText("添加网络源")).toBeTruthy());
    fireEvent.click(screen.getByText("添加网络源"));
    await waitFor(() => expect(screen.getByText("添加来源")).toBeTruthy());
    const input = screen.getByLabelText("来源地址") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "not-a-url" } });
    fireEvent.click(screen.getByText("添加"));
    await waitFor(() =>
      expect(
        screen.getByText("只认 GitHub 仓库主页（github.com/owner/repo）或 marketplace.json 直链"),
      ).toBeTruthy(),
    );
    void container;
  });
});
