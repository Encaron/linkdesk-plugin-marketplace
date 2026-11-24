/**
 * installFlow 的重试腿单测（2026-11-24 重写）。
 *
 * 🔴 行为随「单一入口」根治而变（用户拍板：**不再做老壳适配**）：
 *   重试不再过市场自己的确认门、不再直呼 `installWithProgress`/`pluginManager.update`，
 *   而是统一走壳托管的 `plugins.requestInstall`（判定/令牌/队列/提示全在壳）。
 *   ⇒ 本文件钉三件事：
 *     ① 目录里有条目 ⇒ requestInstall 被调用（mode 正确），旧链**一次都不许调**；
 *     ② 目录里没有条目 ⇒ 不发起、走失败提示（返回 false）；
 *     ③ 用户取消（confirmed:false）⇒ 返回 false，不当失败。
 * 旧断言（确认门 + 旧链）随模块一起删除——它们钉的是已删掉的老路。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../services/marketCatalog";

const ENTRY: CatalogEntry = {
  id: "demo-alpha",
  name: "Demo Alpha",
  version: "1.0.0",
  downloadUrl: "https://example.invalid/demo-alpha-1.0.0.linkdesk-plugin",
  author: { name: "Demo Author" },
  sourceUrl: "https://example.invalid/catalog.json",
  versions: [
    {
      version: "1.0.0",
      downloadUrl: "https://example.invalid/demo-alpha-1.0.0.linkdesk-plugin",
      publishedAt: "2026-11-20T00:00:00.000Z",
      sha256: "a".repeat(64),
    },
  ],
};

const entries: CatalogEntry[] = [];

vi.mock("../services/marketplaceShared/catalogStore", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../services/marketplaceShared/catalogStore");
  return {
    ...actual,
    getCatalogResult: () => ({ entries, collections: [], railOrder: [] }),
    pluginDisplayNameOf: (id: string) => id,
  };
});

const installs: Array<Record<string, unknown>> = [];
const updates: Array<Record<string, unknown>> = [];
const failures: string[] = [];

vi.mock("../services/marketplaceShared/notifications", () => ({
  settleInstallFailure: (_id: string, _url: string, msg: string) => {
    failures.push(msg);
    return false;
  },
  notifyError: () => undefined,
  settleUpdateFailure: () => undefined,
}));
vi.mock("../services/marketplaceShared/pluginsStore", () => ({ scheduleDataRefresh: () => undefined }));

beforeEach(() => {
  entries.length = 0;
  installs.length = 0;
  updates.length = 0;
  failures.length = 0;
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    plugins: {
      requestInstall: vi.fn(async (req: Record<string, unknown>) => {
        if (req.mode === "update") updates.push(req);
        else installs.push(req);
        return { confirmed: true, ok: true };
      }),
    },
  };
});

describe("retryMarketInstall —— 一条腿：壳托管的 requestInstall", () => {
  it("目录有条目 ⇒ 发 requestInstall（mode=install），旧链零调用", async () => {
    entries.push(ENTRY);
    const { retryMarketInstall } = await import("../services/marketplaceShared/installFlow");
    await expect(retryMarketInstall("demo-alpha", ENTRY.downloadUrl!, "Demo Alpha")).resolves.toBe(true);
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({ mode: "install", pluginId: "demo-alpha" });
  });

  it("目录查不到 ⇒ 不发起、如实报失败", async () => {
    const { retryMarketInstall } = await import("../services/marketplaceShared/installFlow");
    await expect(retryMarketInstall("demo-missing", "https://example.invalid/x.linkdesk-plugin")).resolves.toBe(false);
    expect(installs).toHaveLength(0);
    expect(failures).toHaveLength(1);
  });

  it("用户取消 ⇒ false，且不算失败", async () => {
    entries.push(ENTRY);
    (window as unknown as { linkdesk: { plugins: { requestInstall: unknown } } }).linkdesk.plugins.requestInstall = vi.fn(
      async () => ({ confirmed: false, cancelled: true }),
    );
    const { retryMarketInstall } = await import("../services/marketplaceShared/installFlow");
    await expect(retryMarketInstall("demo-alpha", ENTRY.downloadUrl!)).resolves.toBe(false);
    expect(failures).toHaveLength(0);
  });
});

describe("retryMarketUpdate —— 同一条腿（mode=update）", () => {
  it("目录有条目 ⇒ 发 requestInstall（mode=update）", async () => {
    entries.push(ENTRY);
    const { retryMarketUpdate } = await import("../services/marketplaceShared/installFlow");
    await expect(retryMarketUpdate("demo-alpha", ENTRY.downloadUrl!, "Demo Alpha")).resolves.toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ mode: "update", pluginId: "demo-alpha" });
  });
});
