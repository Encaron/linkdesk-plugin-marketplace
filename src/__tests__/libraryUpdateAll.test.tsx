/**
 * 「我的库 · 全部更新」——实机回归（2026-11-26 用户报障）。
 *
 * 🔴 报障现象：库里明明亮着「N 个可更新」，点「全部更新」却弹「所有插件已是最新」。
 *    根因：`onUpdateAll` 里 `state === "update" && !r.core` 把 core 插件整批排掉——而当时待更新的
 *    恰好全是随包件（editor / file-tree / settings，全声明 essential）。`essential` 唯一语义是
 *    「UI 不给卸载按钮」，**不定义更新/版本行为**（05-更新与版本 §147）；能不能真更新由住所闸
 *    `updatable` 决定（随包只读根压根不是 update 态）。
 *
 * 本测试走真实数据链（目录 + 已装列表 → 库行 → 点按钮 → 壳托管批量），只桩 IPC：
 *   判据 = 壳收到 `requestUpdateBatch`（含 core 插件），且**没有**「所有插件已是最新」的 toast。
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

const OFFICIAL_CATALOG = {
  version: "1",
  plugins: [
    {
      id: "editor",
      name: "Editor",
      version: "1.0.32",
      downloadUrl: "https://example.com/editor-1.0.32.linkdesk-plugin",
      category: "core",
      author: { name: "Encaron" },
      publishedAt: "2026-11-25T00:00:00Z",
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
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
      onChange: vi.fn(() => unsub),
    },
    pluginState: { get: vi.fn(async () => undefined), set: vi.fn(async () => undefined), onChange: vi.fn(() => unsub) },
    events: { on: vi.fn(() => unsub), emit: vi.fn() },
    pluginManager: {
      // essential + userData 住所（updatable）——本仓常态：随包件的可更新行
      list: vi.fn(async () => [
        { pluginId: "editor", manifest: { name: "Editor", version: "1.0.31", essential: true }, updatable: true },
      ]),
      getDisabled: vi.fn(async () => []),
      installWithProgress: vi.fn(async () => ({ success: true })),
      update: vi.fn(async () => ({ success: true })),
    },
    // 壳托管确认面（无两步面 ⇒ requestUpdateBatch 快捷路径）
    plugins: {
      requestInstall: vi.fn(async () => ({ confirmed: true, ok: true })),
      requestUpdateBatch: vi.fn(async () => ({ confirmed: true })),
    },
    commands: { registerCommand: vi.fn(), executeCommand: vi.fn(async () => ({ ok: true })) },
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

describe("我的库 · 全部更新", () => {
  it("🔴 essential 的待更新行照常入批——⛔ 不许弹「所有插件已是最新」", async () => {
    const { container } = render(<StoreView isActive />);
    await waitFor(() => expect(container.querySelector('[data-rail-item="library"]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-rail-item="library"]') as HTMLElement);
    await waitFor(() => expect(screen.getByText("我的库")).toBeTruthy());
    // 统计头如实说 1 个可更新（含 core）
    await waitFor(() => expect(screen.getByText(/1 个可更新/)).toBeTruthy());

    fireEvent.click(screen.getByText("全部更新"));

    await waitFor(() => expect(api.plugins.requestUpdateBatch).toHaveBeenCalledTimes(1));
    const reqs = api.plugins.requestUpdateBatch.mock.calls[0][0] as Array<{ pluginId: string; version: string }>;
    expect(reqs.map((r) => r.pluginId)).toEqual(["editor"]);
    expect(reqs[0].version).toBe("1.0.32");
    // 谎话判据：这条 toast 一次都不许出现
    expect(api.toasts.show.mock.calls.some(([o]) => (o as { message?: string })?.message?.includes("所有插件已是最新"))).toBe(
      false,
    );
  });
});
