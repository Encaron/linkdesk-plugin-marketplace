/**
 * SearchView「检查更新」钮冒烟（05「插件市场·检查更新」）——三态 + 动作行次序 + 无障碍取舍。
 * 视图样板照 `catalogRowSmoke.test.tsx`：mock `react-i18next`（key 即文案，带插值替换）；动作腿走 mock
 * （不触网络、不碰目录）；市场共享门面整体 mock（顺带避开 commands/调度的模块级侧效应）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import SearchView from "../views/sidebar/SearchView";
import { checkForPluginUpdates } from "../services/updateCheck";
import { notifyError } from "../services/marketplaceShared";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k,
  }),
}));
vi.mock("../services/updateCheck", () => ({ checkForPluginUpdates: vi.fn() }));
vi.mock("../services/marketplaceShared", () => ({ setMarketplaceSearch: vi.fn(), notifyError: vi.fn() }));

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

const ok = (updatableCount: number) => ({ state: "ok" as const, updatableCount, checkedAt: Date.now() });
const failed = { state: "failed" as const, updatableCount: 0, checkedAt: Date.now() };

beforeEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = {};
  vi.mocked(checkForPluginUpdates).mockReset();
  vi.mocked(notifyError).mockReset();
});

afterEach(() => {
  cleanup();
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  vi.restoreAllMocks();
});

/** 点一次并等它跑完（mock 即刻返回） */
async function clickAndSettle() {
  fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  });
}

describe("位置与次序（05 §一·①）", () => {
  it("钮在动作行**最左**，既有「安装」「市场源」两钮次序零改动", () => {
    const { container } = render(<SearchView />);
    const row = container.querySelector(".marketplace-ms-header-actions");
    expect(row).toBeTruthy();
    const labels = [...(row as HTMLElement).querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
    expect(labels).toEqual(["检查更新", "安装", "市场源"]);
  });

  it("🔴 提示挂槽位、不挂钮：钮的可见文字就是它的无障碍名（不给钮传 title/aria-label）", () => {
    render(<SearchView />);
    const btn = screen.getByRole("button", { name: "检查更新" });
    expect(btn.getAttribute("data-hint")).toBeNull();
    expect(btn.getAttribute("aria-label")).toBeNull();
    expect(btn.parentElement?.getAttribute("data-hint")).toBe("立即向市场源查询插件新版本（忽略 5 分钟缓存）");
  });
});

describe("三态（默认 / 检查中 / 完成·失败）", () => {
  it("检查中：文字换「检查中…」且禁用防连点（图标题仍在，状态不靠颜色）", async () => {
    let settle: ((r: ReturnType<typeof ok>) => void) | null = null;
    vi.mocked(checkForPluginUpdates).mockImplementation(
      () => new Promise((res) => { settle = res; }) as ReturnType<typeof checkForPluginUpdates>,
    );
    render(<SearchView />);

    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));

    const busy = screen.getByRole("button", { name: "检查中…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);

    await act(async () => {
      settle?.(ok(0));
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    });
  });

  it("完成·无新版：钮回可用 ＋ 就地注「已是最新 · 刚刚」（role=status，可被读屏播报）", async () => {
    vi.mocked(checkForPluginUpdates).mockResolvedValue(ok(0));
    render(<SearchView />);

    await clickAndSettle();

    expect(screen.getByRole("status").textContent).toBe("已是最新 · 刚刚");
    expect((screen.getByRole("button", { name: "检查更新" }) as HTMLButtonElement).disabled).toBe(false);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("完成·有更新：注里带条数", async () => {
    vi.mocked(checkForPluginUpdates).mockResolvedValue(ok(2));
    render(<SearchView />);

    await clickAndSettle();

    expect(screen.getByRole("status").textContent).toBe("发现 2 个可更新 · 刚刚");
  });

  it("🔴 失败：注写「显示的是旧目录」＋ 详情落唯一通知面（铃铛）；钮**不卡在禁用态**", async () => {
    vi.mocked(checkForPluginUpdates).mockResolvedValue(failed);
    render(<SearchView />);

    await clickAndSettle();

    expect(screen.getByRole("status").textContent).toBe("检查失败 · 显示的是旧目录");
    expect(notifyError).toHaveBeenCalledWith("检查更新失败：取不到市场目录");
    expect((screen.getByRole("button", { name: "检查更新" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
