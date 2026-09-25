/**
 * installFlow 的重试腿单测——`retryMarketInstall` / `retryMarketUpdate`（E6#152 必做③；此前零测试）。
 *
 * 🔴 裁决口径：installFlow 的**发起腿**（`startMarketInstall`）已被 `marketplaceInstallDispatch.test.ts`
 *   覆盖（6 例：无闸并发 / 同 id 在途去重 / 身份随行 / 取消≠失败 / 恰一条失败 toast / 并发隔离），
 *   故本文件**不重测那一支**，只补它**没碰的两个导出**——两个重试入口。
 *
 * 本文件钉的是本层最值钱的那条纪律（E6#71k「都问」）：**重试不是免问券**。
 *   - 门说「不」⇒ `installWithProgress` / `pluginManager.update` **一次都没被调用**（否定断言）；
 *   - 门说「是」⇒ 动作与入参原样下达；
 *   - 对话框面整个缺失（老 preload）⇒ 不装（保守方向）。
 * 另钉重试更新的收敛与容错：成功才重拉已装列表；失败**不再递归推新 toast**（头注：再挂一条 [重试]
 * = 无限自助餐）。
 *
 * 替身口径：模块级状态（在途登记表）⇒ 每例 `vi.resetModules()` + 动态 import（照 dispatch 文件惯例）；
 * 目录查条目走 `marketSources.__setCatalogIO` 既有注入点。fixture 全虚构（硬约束 21）。
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import i18n from "i18next";
import type { StorageLike } from "../services/marketSources";
import type { CatalogEntry } from "../services/marketCatalog";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

const URL_DL = "https://example.invalid/releases/demo-alpha-1.0.0.linkdesk-plugin";

const ENTRY: CatalogEntry = {
  id: "demo-alpha",
  name: "Demo Alpha",
  version: "1.0.0",
  downloadUrl: URL_DL,
  author: { name: "Demo Author" },
  sourceUrl: "https://example.invalid/catalog.json",
};

type Shown = { message: string; opts?: Record<string, unknown> };

function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

const CATALOG_TEXT = JSON.stringify({ version: "1", updatedAt: "2026-09-01T00:00:00Z", plugins: [ENTRY] });

let shown: Shown[];
let installWithProgress: ReturnType<typeof vi.fn>;
let updateFn: ReturnType<typeof vi.fn>;
let listFn: ReturnType<typeof vi.fn>;
let confirm: ReturnType<typeof vi.fn>;
let confirmContent: ReturnType<typeof vi.fn>;

/** 每个用例一份全新模块实例（在途登记表是模块级状态）＋ 全新壳面 */
async function boot(o: { catalogOk?: boolean; dialog?: boolean } = {}) {
  vi.resetModules();
  shown = [];
  installWithProgress = vi.fn(async () => ({ success: true }));
  updateFn = vi.fn(async () => ({ success: true }));
  listFn = vi.fn(async () => []);
  confirm = vi.fn(async () => true);
  confirmContent = vi.fn(async () => true);

  (window as unknown as { linkdesk: unknown }).linkdesk = {
    pluginManager: { installWithProgress, update: updateFn, list: listFn, getDisabled: async () => [] },
    events: { on: () => () => {}, emit: () => {} },
    notifications: {
      show: (message: string, opts?: Record<string, unknown>) => {
        shown.push({ message, opts });
        return { id: "demo-notif", dismiss: () => {} };
      },
    },
    commands: { registerCommand: vi.fn() },
    configuration: { get: async () => null, onChange: () => () => {} },
    ...(o.dialog === false ? {} : { dialog: { confirm, confirmContent } }),
  };

  /* 🔴 注入必须打在**这一代**模块实例上：`vi.resetModules()` 之后再 import 的 marketplaceShared
   * 会拿到全新的 marketSources——静态 import 来的 `__setCatalogIO` 指向上一代、注入不生效
   * （本文件第一版就踩了这个：目录恒查不到，重试一律回落纯文字确认）。 */
  const ms = await import("../services/marketSources");
  ms.__setCatalogIO(async () => {
    if (o.catalogOk === false) throw new Error("demo-offline"); // 抛 = reason network ⇒ 查不到条目
    return CATALOG_TEXT;
  }, fakeStorage());

  return import("../services/marketplaceShared");
}

async function flush() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

/* 生产前提 = marketplace 入口 i18n init 先行；单测不走入口 ⇒ 手动 init 同款默认实例
 * （否则未初始化时 `i18n.t` 返回 undefined，回落确认那条的文案断言就没有牙了）。
 * 资源留空 ⇒ `t` 回 key + 自行插值（i18n key = 中文原文，硬约束 2）。 */
beforeAll(async () => {
  await i18n.init({
    lng: "en",
    fallbackLng: false,
    nsSeparator: false,
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

beforeEach(() => {
  vi.useFakeTimers(); // 门面模块顶的 ~10s 启动发现调度——测试里掐掉
  (window as unknown as { linkdesk: unknown }).linkdesk = {};
});

afterEach(() => {
  vi.useRealTimers();
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  // 注入面无需手工清：每例 `vi.resetModules()` 已换掉整代模块（静态 import 的注入点指向上一代，清了也没用）
});

describe("retryMarketInstall（三个入口共用的单点门位）", () => {
  it("🔴 门说「不」⇒ 一次安装动作都没落下（否定断言——重试不是免问券）", async () => {
    const { retryMarketInstall } = await boot();
    confirmContent.mockResolvedValue(false);

    await expect(retryMarketInstall("demo-alpha", URL_DL, "Demo Alpha")).resolves.toBe(false);
    expect(installWithProgress).not.toHaveBeenCalled();
    expect(confirmContent).toHaveBeenCalledTimes(1); // 问了，只是没答应
  });

  it("门说「是」⇒ 原样发起（downloadUrl ＋ 显示名随行）", async () => {
    const { retryMarketInstall } = await boot();

    await expect(retryMarketInstall("demo-alpha", URL_DL, "Demo Alpha")).resolves.toBe(true);
    expect(installWithProgress).toHaveBeenCalledTimes(1);
    const [url, opts] = installWithProgress.mock.calls[0] as [string, { pluginId: string; displayName: string }];
    expect(url).toBe(URL_DL);
    expect(opts.pluginId).toBe("demo-alpha");
    expect(opts.displayName).toBe("Demo Alpha");
  });

  it("目录能查到条目 ⇒ 富内容卡的 payload 带上了目录条目（构造单点 = installConfirmPayload）", async () => {
    const { retryMarketInstall } = await boot();
    await retryMarketInstall("demo-alpha", URL_DL, "Demo Alpha");

    const arg = confirmContent.mock.calls[0][0] as { payload: { name?: string; publisher?: string; mode?: string } };
    // 比对载荷字段而非整对象：目录条目经 parse 白名单归一（字段集与手写 fixture 不必逐字相同），
    // 「条目真的进来了」才是这条的判据。
    expect(arg.payload).toMatchObject({ name: "Demo Alpha", publisher: "Demo Author" });
  });

  it("🔴 入参不全（无 pluginId / 无 downloadUrl）⇒ 立即 false，**连门都不问**", async () => {
    const { retryMarketInstall } = await boot();

    await expect(retryMarketInstall("", URL_DL)).resolves.toBe(false);
    await expect(retryMarketInstall("demo-alpha", "")).resolves.toBe(false);

    expect(confirmContent).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(installWithProgress).not.toHaveBeenCalled();
  });

  it("🔴 对话框面整个缺失（老 preload）⇒ false 且不装——不能问就不装", async () => {
    const { retryMarketInstall } = await boot({ dialog: false });
    await expect(retryMarketInstall("demo-alpha", URL_DL, "Demo Alpha")).resolves.toBe(false);
    expect(installWithProgress).not.toHaveBeenCalled();
  });

  it("目录查不到（离线/下架）⇒ 回落纯文字 confirm，名字用 displayName——仍然要问", async () => {
    const { retryMarketInstall } = await boot({ catalogOk: false });

    await expect(retryMarketInstall("demo-alpha", URL_DL, "Demo Alpha")).resolves.toBe(true);
    expect(confirmContent).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(String(confirm.mock.calls[0][0])).toContain("Demo Alpha");
    expect(installWithProgress).toHaveBeenCalledTimes(1);
  });

  it("失败终局照旧走失败通道（一条带 [重试] 的 toast——重试失败也是失败）", async () => {
    const { retryMarketInstall } = await boot();
    installWithProgress.mockResolvedValue({ success: false, error: "HTTP 404" });

    await expect(retryMarketInstall("demo-alpha", URL_DL, "Demo Alpha")).resolves.toBe(false);
    expect(shown).toHaveLength(1);
    const actions = shown[0].opts?.actions as Array<{ label?: string }> | undefined;
    expect(actions?.length).toBeGreaterThan(0);
  });
});

describe("retryMarketUpdate（命令 marketplace.retryUpdate 的落点）", () => {
  it("🔴 门说「不」⇒ `pluginManager.update` 一次都没被调用", async () => {
    const { retryMarketUpdate } = await boot();
    confirmContent.mockResolvedValue(false);

    await expect(retryMarketUpdate("demo-alpha", URL_DL, "Demo Alpha")).resolves.toBe(false);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("门说「是」＋ 引擎成功 ⇒ 走 update(pluginId, {url})，并重拉已装列表收敛（否则重试成功看不到变化）", async () => {
    const { retryMarketUpdate } = await boot();
    expect(listFn).not.toHaveBeenCalled();

    await expect(retryMarketUpdate("demo-alpha", URL_DL, "Demo Alpha")).resolves.toBe(true);
    expect(updateFn).toHaveBeenCalledWith("demo-alpha", { url: URL_DL });

    await flush(); // scheduleDataRefresh 是 microtask 合并
    expect(listFn).toHaveBeenCalledTimes(1);
  });

  it("引擎返回 success:false ⇒ false，且**不重拉**列表", async () => {
    const { retryMarketUpdate } = await boot();
    updateFn.mockResolvedValue({ success: false, error: "不在用户安装区" });

    await expect(retryMarketUpdate("demo-alpha", URL_DL)).resolves.toBe(false);
    await flush();
    expect(listFn).not.toHaveBeenCalled();
  });

  it("🔴 引擎抛错 ⇒ 吞掉返回 false（不 throw 给调用方的按钮），也**不推**递归 [重试] toast", async () => {
    const { retryMarketUpdate } = await boot();
    updateFn.mockRejectedValue(new Error("引擎炸了"));

    await expect(retryMarketUpdate("demo-alpha", URL_DL)).resolves.toBe(false);
    expect(shown).toHaveLength(0); // 失败本身就是这条 [重试] 的答案，不再挂一条
  });

  it("壳无 update 面（老 preload）⇒ false，不进引擎", async () => {
    const { retryMarketUpdate } = await boot();
    (window as unknown as { linkdesk: { pluginManager: { update?: unknown } } }).linkdesk.pluginManager.update =
      undefined;

    await expect(retryMarketUpdate("demo-alpha", URL_DL)).resolves.toBe(false);
  });

  it("🔴 入参不全 ⇒ 立即 false，连门都不问", async () => {
    const { retryMarketUpdate } = await boot();
    await expect(retryMarketUpdate("", URL_DL)).resolves.toBe(false);
    await expect(retryMarketUpdate("demo-alpha", "")).resolves.toBe(false);
    expect(confirmContent).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
  });
});
