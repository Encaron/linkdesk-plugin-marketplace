/**
 * DetailView 冒烟（棒 9 · R4-3.16–3.19）——注入目录＋壳 API 替身，跑真实数据链。
 *
 * 钉住四格判据：
 *   - R4-3.16 依赖跳转走唯一入口 openPluginDetailTab（pinned:true＋label）；
 *   - R4-3.17 三页签口径（概览/功能/更改日志）＋日志「最近 5 版」裁口；
 *   - R4-3.18 右栏四类字段：「没有」不画行 /「不够」标黄＋安装置灰 / 兼容性唯一占位；
 *   - §8.1 #11 动作委托：安装/更新/禁用/启用/卸载逐按钮点，全部落到同一条服务入口。
 *
 * fixture 全虚构（硬约束 21）；i18n 走 key 即文案的 mock（与 storeViewSmoke 同款）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import DetailView from "../views/detail/DetailView";
import { __setCatalogIO } from "../services/marketSources";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";
import { __resetRealmSlots } from "../services/realmSlot";
import { scheduleDataRefresh } from "../services/marketplaceShared/pluginsStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k,
  }),
}));

/* 下载数走真实网络（GitHub API）——冒烟不碰网 */
vi.mock("../services/downloadCounts", () => ({
  useDownloadCount: () => ({ status: "hidden" }),
  useDownloadCounts: () => new Map(),
}));

const VERSIONS = Array.from({ length: 7 }, (_, i) => {
  const v = `1.${7 - i}.0`;
  return {
    version: v,
    downloadUrl: `https://github.com/demo-owner/demo-net/releases/download/v${v}/demo.linkdesk-plugin`,
    publishedAt: `2026-0${(7 - i) % 9 || 9}-01T00:00:00Z`,
    changelog: `- demo change ${v}`,
  };
});

const NET_ENTRY = {
  id: "demo-net",
  name: "Demo Net",
  version: "1.7.0",
  description: "Demo description",
  author: { name: "Demo Author" },
  authorId: "demo-author",
  category: "development",
  categories: ["code-editing"],
  publishedAt: "2026-01-01T00:00:00Z",
  repository: "https://github.com/demo-owner/demo-net",
  license: "MIT",
  size: 1234567,
  downloadUrl: "https://github.com/demo-owner/demo-net/releases/download/v1.7.0/demo.linkdesk-plugin",
  versions: VERSIONS,
};

/* 「目录缺字段」：无作者 / 无发布时间 / 无仓库 / 无大小 / 无许可证——网络源的异常态 */
const BARE_ENTRY = {
  id: "demo-bare",
  name: "Demo Bare",
  version: "0.1.0",
  description: "Bare entry",
  downloadUrl: "https://example.invalid/bare.linkdesk-plugin",
};

/* 「不够」：当前壳低于条目要求 */
const MINAPP_ENTRY = {
  ...NET_ENTRY,
  id: "demo-minapp",
  name: "Demo MinApp",
  minAppVersion: "9.9.9",
};

const DEP_ENTRY = {
  ...NET_ENTRY,
  id: "demo-dep",
  name: "Demo Dep",
  versions: undefined,
};

/* R4-3.20/21/22：付费三态样例＋画廊封面视频（parse 契约：视频至多 1 段且必须第一项） */
const PAID_ENTRY = {
  ...NET_ENTRY,
  id: "demo-paid",
  name: "Demo Paid",
  pricing: { model: "paid", licenseUrl: "https://example.invalid/buy", price: 68 },
  screenshots: [
    { type: "video", url: "https://example.invalid/clip.mp4", poster: "https://example.invalid/poster.jpg" },
    "https://example.invalid/shot.png",
  ],
};
const SUB_ENTRY = {
  ...NET_ENTRY,
  id: "demo-sub",
  name: "Demo Sub",
  pricing: { model: "subscription", price: 8, period: "月" },
};

const AUTHOR_BLOCK = {
  authorId: "demo-author",
  name: "Demo Author",
  publicKey: "DEMO_AUTHOR_PUBKEY",
  repos: [{ id: "demo-owner/demo-net", name: "Demo Net" }],
};

const CATALOG = {
  version: "1",
  plugins: [NET_ENTRY, BARE_ENTRY, MINAPP_ENTRY, DEP_ENTRY, PAID_ENTRY, SUB_ENTRY],
};

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

type Stub = {
  pluginManager: Record<string, ReturnType<typeof vi.fn>>;
  [k: string]: unknown;
};

function stubLinkdesk(o: {
  installed?: Array<Record<string, unknown>>;
  disabled?: Array<Record<string, unknown>>;
  pluginLocation?: unknown;
  localRecords?: Array<{ pluginId: string; sourcePath: string; installedAt: number }>;
  /** R4-3.20：壳权益表（licenses.list 的替身载荷） */
  entitlements?: Array<{ pluginId: string; exp?: number }>;
} = {}) {
  const unsub = () => {};
  const linkdesk = {
    configuration: { get: vi.fn(async () => []), set: vi.fn(async () => undefined), onChange: vi.fn(() => unsub) },
    pluginState: {
      get: vi.fn(async (_owner: string, key: string) => (key === "localInstalls" ? o.localRecords : undefined)),
      set: vi.fn(async () => undefined),
      onChange: vi.fn(() => unsub),
    },
    licenses: {
      list: vi.fn(async () => o.entitlements ?? []),
      verify: vi.fn(async (key: string, _publicKey: string) => ({ valid: false, failureReason: "bad-signature" })),
    },
    events: { on: vi.fn(() => unsub), emit: vi.fn() },
    pluginManager: {
      list: vi.fn(async () => o.installed ?? []),
      getDisabled: vi.fn(async () => o.disabled ?? []),
      installWithProgress: vi.fn(async () => ({ success: true })),
      update: vi.fn(async () => ({ success: true })),
      enable: vi.fn(async () => undefined),
      disable: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
    },
    app: { getVersion: vi.fn(async () => "0.2.0") },
    plugins: {
      getCompatibility: vi.fn(async () => undefined),
      resolvePath: vi.fn(async () => "C:/plugins/demo"),
    },
    filesystem: {
      readTextFile: vi.fn(async () => {
        throw new Error("ENOENT");
      }),
    },
    shell: {
      pluginLocation: vi.fn(async () => o.pluginLocation ?? null),
      openPluginFolder: vi.fn(async () => undefined),
      openExternal: vi.fn(async () => undefined),
    },
    commands: { registerCommand: vi.fn(), executeCommand: vi.fn(async () => ({ ok: true })) },
    menu: { registerItems: vi.fn() },
    tabs: { create: vi.fn(async () => undefined), openOrFocus: vi.fn(async () => "") },
    toasts: { show: vi.fn() },
    dialog: { confirm: vi.fn(async () => true), open: vi.fn(async () => null) },

  };
  Object.defineProperty(window, "linkdesk", { value: linkdesk, configurable: true });
  return linkdesk as unknown as Stub & typeof linkdesk;
}

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;
let api: ReturnType<typeof stubLinkdesk>;

beforeEach(() => {
  __resetRealmSlots();
  __setCatalogIO(async (url: string) => {
    if (url === OFFICIAL_SOURCE_URL) return JSON.stringify(CATALOG);
    if (url.endsWith("/authors/demo-author.json")) return JSON.stringify(AUTHOR_BLOCK);
    throw new Error("HTTP 404");
  }, memoryStorage());
});

afterEach(() => {
  cleanup();
  __setCatalogIO(null, null);
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  vi.restoreAllMocks();
});

async function mount(pluginId: string) {
  api = stubLinkdesk();
  const root = render(<DetailView pluginId={pluginId} isActive />);
  await waitFor(() => expect(screen.getAllByText("标识符").length).toBeGreaterThan(0));
  return root;
}

/** 同文件内多个用例共用 realm 槽（模块级 `state` 引用不随槽复位而换）——换壳替身后再拉一次已装列表，
 *  让 `pluginsStore` 的新数据经 `notifyDataListeners` 推到已挂载视图（等价实机 lifecycle 广播）。 */
async function syncPlugins() {
  await act(async () => {
    scheduleDataRefresh();
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("R4-3.17 三页签", () => {
  it("页签口径 = 概览/功能/更改日志；日志只画最近 5 版（UI 口径写明）", async () => {
    await mount("demo-net");
    expect(screen.getAllByText("概览").length).toBeGreaterThan(0);
    expect(screen.queryByText("详情")).toBeNull();
    expect(screen.getAllByText("功能").length).toBeGreaterThan(0);
    expect(screen.getAllByText("更改日志").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("更改日志"));
    await waitFor(() => expect(screen.getByText("更新记录（最近 5 版）")).toBeTruthy());
    // 目录 versions 有 7 版 → 展示裁到 5；最新在前
    const tags = document.querySelectorAll(".marketplace-mpd-chg-ver-tag");
    expect(tags.length).toBe(5);
    expect(tags[0].textContent).toBe("v1.7.0");

    fireEvent.click(screen.getByText("功能"));
    await waitFor(() => expect(screen.getByText("安装插件后在此查看功能贡献")).toBeTruthy());
  });
});

describe("R4-3.18 右栏四类字段", () => {
  it("网络源·完整：抓取型/声明型/本机事实全在；兼容性唯一占位「—」；未装无安装位置", async () => {
    await mount("demo-net");
    for (const label of ["标识符", "版本", "大小", "作者", "来源", "首次发布", "更新时间", "仓库", "问题", "许可证", "兼容性"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // 未装 → 本机事实里的「安装位置」不画；「数据位置」同理
    expect(screen.queryByText("安装位置")).toBeNull();
    expect(screen.queryByText("数据位置")).toBeNull();
    // 来源徽标由来源派生（官方源 → 官方），与商店卡同源 sourceBadge
    expect(screen.getByText("官方")).toBeTruthy();
    // 依赖/被依赖未知 → 不画行（⛔ Dash 撑空行）；全页只剩兼容性这一处占位
    expect(screen.queryByText("依赖")).toBeNull();
    expect(screen.getAllByText("—").length).toBe(1);
  });

  it("「没有」不画行：目录缺作者/发布时间/仓库/许可证 ⇒ 对应行整行消失", async () => {
    await mount("demo-bare");
    expect(screen.getByText("标识符")).toBeTruthy();
    expect(screen.queryByText("作者")).toBeNull();
    expect(screen.queryByText("首次发布")).toBeNull();
    expect(screen.queryByText("更新时间")).toBeNull();
    expect(screen.queryByText("仓库")).toBeNull();
    expect(screen.queryByText("问题")).toBeNull();
    expect(screen.queryByText("许可证")).toBeNull();
    expect(screen.queryByText("大小")).toBeNull();
    // 来源 = 合并注入的目录身份，网络条目必有
    expect(screen.getByText("来源")).toBeTruthy();
  });

  it("「不够」行保留标黄＋安装置灰写原因（不是藏起来）", async () => {
    await mount("demo-minapp");
    await waitFor(() => expect(screen.getByText("需 LinkDesk")).toBeTruthy());
    const row = screen.getByText("v9.9.9").closest(".marketplace-mpd-info-item") as HTMLElement;
    expect(row.querySelector(".marketplace-mpd-info-value.warn")).toBeTruthy();

    const install = screen.getByRole("button", { name: /安装/ }) as HTMLButtonElement;
    expect(install.disabled).toBe(true);
    // 共享 Button 的 title prop = data-hint（写法规约 §13：不落原生 title=，不跟主题/字号）
    expect(install.getAttribute("data-hint")).toBe("需升级 LinkDesk 至 9.9.9 才能安装");
  });

  it("已装：本机事实只有「大小」链接（值可点开安装目录），⛔ 不再重复画「安装位置」行", async () => {
    api = stubLinkdesk({
      installed: [{ pluginId: "demo-net", manifest: { name: "Demo Net", version: "1.0.0" } }],
      pluginLocation: { installDir: "C:/plugins/demo-net", dataDir: "C:/data/demo-net" },
    });
    render(<DetailView pluginId="demo-net" isActive />);
    await syncPlugins();
    // 2026-11-23 用户实机：安装位置与「大小」同一落点（都开安装目录）⇒ 删重复行
    await waitFor(() => expect(screen.getByText("大小")).toBeTruthy());
    expect(screen.queryByText("安装位置")).toBeNull();
    expect(screen.getByText("数据位置")).toBeTruthy();
    // 「大小」的值 = 链接（DirLink 走 data-hint，⛔ 原生 title=），点开安装目录（E6#78）
    const sizeLink = document.querySelector('[data-hint="在资源管理器里打开 C:/plugins/demo-net"]');
    expect(sizeLink).toBeTruthy();
    fireEvent.click(sizeLink as HTMLElement);
    expect(api.shell.openPluginFolder).toHaveBeenCalledWith("demo-net", "install");
  });

  it("本地安装（目录无条目）：来源徽标 = 「本地」（05 §01），不伪造作者徽标", async () => {
    api = stubLinkdesk({
      installed: [{ pluginId: "demo-local", manifest: { name: "Demo Local", version: "0.1.0" } }],
      localRecords: [{ pluginId: "demo-local", sourcePath: "C:/src/demo-local", installedAt: 1 }],
    });
    render(<DetailView pluginId="demo-local" isActive />);
    await syncPlugins();
    await waitFor(() => expect(screen.getByText("本地")).toBeTruthy());
    expect(screen.getByText("Demo Local")).toBeTruthy();
  });
});

describe("§8.1 #11 动作委托：逐按钮落同一条入口", () => {
  it("未装：安装 → 确认门 → installWithProgress（单一下载入口）", async () => {
    api = stubLinkdesk();
    render(<DetailView pluginId="demo-net" isActive />);
    await syncPlugins();
    fireEvent.click(screen.getByText("安装"));
    await waitFor(() => expect(api.dialog.confirm).toHaveBeenCalled());
    await waitFor(() =>
      expect(api.pluginManager.installWithProgress).toHaveBeenCalledWith(
        VERSIONS[0].downloadUrl,
        expect.anything(),
      ),
    );
  });

  it("已装：更新 → pm.update；禁用 → pm.disable；卸载 → 确认 → pm.uninstall", async () => {
    api = stubLinkdesk({
      installed: [{ pluginId: "demo-net", manifest: { name: "Demo Net", version: "1.0.0" }, updatable: true }],
    });
    render(<DetailView pluginId="demo-net" isActive />);
    await syncPlugins();
    await waitFor(() => expect(screen.getByText("更新到 v1.7.0")).toBeTruthy());

    fireEvent.click(screen.getByText("更新到 v1.7.0"));
    await waitFor(() =>
      expect(api.pluginManager.update).toHaveBeenCalledWith(
        "demo-net",
        expect.objectContaining({ url: VERSIONS[0].downloadUrl }),
      ),
    );

    fireEvent.click(screen.getByText("禁用"));
    await waitFor(() => expect(api.pluginManager.disable).toHaveBeenCalledWith("demo-net"));

    fireEvent.click(screen.getByText("卸载"));
    await waitFor(() => expect(api.dialog.confirm).toHaveBeenCalled());
    await waitFor(() => expect(api.pluginManager.uninstall).toHaveBeenCalledWith("demo-net"));
  });

  it("已停用：启用 → pm.enable", async () => {
    api = stubLinkdesk({ disabled: [{ pluginId: "demo-net", name: "Demo Net", version: "1.0.0" }] });
    render(<DetailView pluginId="demo-net" isActive />);
    await syncPlugins();
    await waitFor(() => expect(screen.getByText("启用")).toBeTruthy());
    fireEvent.click(screen.getByText("启用"));
    await waitFor(() => expect(api.pluginManager.enable).toHaveBeenCalledWith("demo-net"));
  });
});

describe("R4-3.16 依赖跳转", () => {  it("依赖行点击 → openPluginDetailTab（pinned:true＋label，与商店卡片同一入口）", async () => {
    api = stubLinkdesk({
      installed: [
        {
          pluginId: "demo-net",
          manifest: { name: "Demo Net", version: "1.0.0", requires: ["demo-dep"] },
          pendingReason: "missing-deps",
        },
      ],
    });
    render(<DetailView pluginId="demo-net" isActive />);
    await syncPlugins();
    await waitFor(() => expect(screen.getByText("依赖未满足")).toBeTruthy());
    const depButton = screen.getAllByText("Demo Dep")[0].closest("button") as HTMLButtonElement;
    fireEvent.click(depButton);
    await waitFor(() =>
      expect(api.tabs.create).toHaveBeenCalledWith("plugin-detail", {
        pluginId: "demo-dep",
        pinned: true,
        label: "Demo Dep",
      }),
    );
  });
});

describe("R4-3.20/21 付费流（详情）", () => {
  it("未购买断：获取许可（外跳 licenseUrl）＋我有密钥 → 弹窗；粘贴即时验签（不过→红句）", async () => {
    api = stubLinkdesk();
    render(<DetailView pluginId="demo-paid" isActive />);
    await syncPlugins();
    // 徽标：详情 = 最全档——价格徽标上标题行
    await waitFor(() => expect(screen.getByText("买断 ¥68")).toBeTruthy());

    fireEvent.click(screen.getByText("获取许可 ¥68"));
    await waitFor(() => expect(api.shell.openExternal).toHaveBeenCalledWith("https://example.invalid/buy"));

    fireEvent.click(screen.getByText("我有密钥"));
    await waitFor(() => expect(screen.getByText("输入许可密钥")).toBeTruthy());
    // 等作者块公钥到位（懒加载）——公钥随行是「即时验签」契约的一半
    await waitFor(() => expect(screen.getByText("密钥由作者签名，粘贴后自动验证")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("许可密钥"), { target: { value: "v1.abc.def" } });
    await waitFor(() =>
      expect(api.licenses.verify).toHaveBeenCalledWith("v1.abc.def", "DEMO_AUTHOR_PUBKEY"),
    );
    await waitFor(() => expect(screen.getByText("密钥验证未通过——请确认复制完整，或联系作者")).toBeTruthy());
  });

  it("验签通过 → licenses.list 重读（权益投影收敛）；弹窗自动收起", async () => {
    api = stubLinkdesk();
    api.licenses.verify.mockResolvedValue({ valid: true, pluginId: "demo-paid" });
    const listCallsBefore = api.licenses.list.mock.calls.length;
    render(<DetailView pluginId="demo-paid" isActive />);
    await syncPlugins();
    fireEvent.click(screen.getByText("我有密钥"));
    await waitFor(() => expect(screen.getByText("输入许可密钥")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("许可密钥"), { target: { value: "v1.abc.def" } });
    await waitFor(() => expect(screen.getByText("许可有效——安装已解锁")).toBeTruthy());
    await act(() => new Promise((r) => setTimeout(r, 1000)));
    expect(screen.queryByText("输入许可密钥")).toBeNull();
    expect(api.licenses.list.mock.calls.length).toBeGreaterThan(listCallsBefore);
  });

  it("许可过期：输入新密钥＋续费（续费走 openExternal）；已购有效 → 安装钮＋已购徽标", async () => {
    const past = Math.floor(Date.now() / 1000) - 86_400;
    const future = Math.floor(Date.now() / 1000) + 86_400 * 40; // 40 天后到期——徽标「已购 ✓」档（≤30 天走临期黄）
    api = stubLinkdesk({ entitlements: [{ pluginId: "demo-paid", exp: past }] });
    const { unmount } = render(<DetailView pluginId="demo-paid" isActive />);
    await syncPlugins();
    await waitFor(() => expect(screen.getByText("输入新密钥")).toBeTruthy());
    fireEvent.click(screen.getByText("续费"));
    await waitFor(() => expect(api.shell.openExternal).toHaveBeenCalledWith("https://example.invalid/buy"));
    unmount();
    cleanup();

    api = stubLinkdesk({ entitlements: [{ pluginId: "demo-paid", exp: future }] });
    render(<DetailView pluginId="demo-paid" isActive />);
    await syncPlugins();
    await waitFor(() => expect(screen.getByText("已购 ✓")).toBeTruthy());
    expect(screen.getByRole("button", { name: /安装/ })).toBeTruthy();
    expect(screen.getByText("买断制 · 许可验证在壳层（本地验签，不联网）")).toBeTruthy();
  });

  it("订阅：动作钮 = 即将支持（禁用写原因）；说明行给订阅制口径", async () => {
    api = stubLinkdesk();
    render(<DetailView pluginId="demo-sub" isActive />);
    await syncPlugins();
    await waitFor(() => expect(screen.getByText("订阅 ¥8/月")).toBeTruthy());
    const soon = screen.getByText("即将支持").closest("button") as HTMLButtonElement;
    expect(soon.disabled).toBe(true);
    expect(screen.getByText("订阅制 · 需服务器实时校验——B3 上线后开放购买与自动续费")).toBeTruthy();
  });
});

describe("R4-3.22 画廊视频（I12）", () => {
  it("封面视频：controls 强制、preload=metadata、无 autoplay；图片项照常", async () => {
    api = stubLinkdesk();
    render(<DetailView pluginId="demo-paid" isActive />);
    await syncPlugins();
    await waitFor(() => expect(document.querySelector(".marketplace-mpd-gallery-video")).toBeTruthy());
    const video = document.querySelector(".marketplace-mpd-gallery-video") as HTMLVideoElement;
    expect(video.src).toBe("https://example.invalid/clip.mp4");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(video.getAttribute("poster")).toBe("https://example.invalid/poster.jpg");
    const imgs = document.querySelectorAll(".marketplace-mpd-gallery-shot:not(.marketplace-mpd-gallery-video)");
    expect(imgs.length).toBe(1);
  });
});
