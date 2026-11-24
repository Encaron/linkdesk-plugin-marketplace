/**
 * 安装失败的**出口**单测（2026-11-25）。
 *
 * 🔴 钉的是一句用户原话（2026-11-24 实机，BadHash）：
 *   「我安装这个 betahash，然后弹出一个这个：`Error invoking remote method 'plugins:download':
 *     Error: 包完整性校验失败：期望 sha256 000…，实际 6f5b…——已删除该包`」
 *   ——通道名与主进程措辞不该出现在界面上。
 *
 * 修法（不是改文案，是改**路由**）：确认后被壳拒（`confirmed && ok===false`，下载/校验/落盘失败）
 * 一律走 `settleInstallFailure`（归因 →「安装失败：文件校验未通过」+ [重试] + 面板），
 * ⛔ 不再 `notifyError(res.error)` 把原始文本直甩。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../services/marketCatalog";

const ENTRY: CatalogEntry = {
  id: "fixture-badhash",
  name: "Fixture BadHash",
  version: "1.0.0",
  downloadUrl: "https://example.invalid/fixture-badhash-1.0.0.linkdesk-plugin",
  author: { name: "Fixture Lab" },
  sourceUrl: "https://example.invalid/catalog.json",
  versions: [
    {
      version: "1.0.0",
      downloadUrl: "https://example.invalid/fixture-badhash-1.0.0.linkdesk-plugin",
      publishedAt: "2026-11-20T00:00:00.000Z",
      sha256: "0".repeat(64),
    },
  ],
};

const RAW = "Error invoking remote method 'plugins:download': Error: 包完整性校验失败：期望 sha256 000…";
let reply: { confirmed?: boolean; ok?: boolean; error?: string } = {};
const seen = { notifyError: [] as string[], settled: [] as Array<{ id: string; url: string; error?: string }>, requests: [] as unknown[] };

vi.mock("../services/marketplaceShared/notifications", () => ({
  notifyError: (msg: string) => seen.notifyError.push(msg),
  settleInstallFailure: async (id: string, url: string, error?: string) => {
    seen.settled.push({ id, url, error });
    return false;
  },
}));

vi.mock("../services/marketplaceShared/installFlow", () => ({ startMarketInstall: vi.fn() }));

vi.mock("../services/hostInstallConfirm", () => ({
  installConfirmApi: () => ({
    requestInstall: async (req: unknown) => {
      seen.requests.push(req);
      return reply;
    },
  }),
  buildInstallRequest: () => ({ mode: "install" }),
}));

vi.mock("../services/minAppVersionGate", () => ({
  minAppVerdict: () => ({ ok: true }),
  readShellVersion: async () => "0.2.99",
}));

import { runMarketInstallAction } from "../services/marketInstallAction";

const t = (k: string) => k;

beforeEach(() => {
  reply = {};
  seen.notifyError.length = 0;
  seen.settled.length = 0;
  seen.requests.length = 0;
});

describe("runMarketInstallAction —— 失败出口", () => {
  it("确认后被壳拒（ok===false）⇒ 走归因通道，⛔ 不把原始 IPC 文本当提示", async () => {
    reply = { confirmed: true, ok: false, error: RAW };
    const ok = await runMarketInstallAction(ENTRY, true, t);

    expect(ok).toBe(false);
    expect(seen.settled).toEqual([{ id: ENTRY.id, url: ENTRY.downloadUrl, error: RAW }]);
    expect(seen.notifyError).toEqual([]);
  });

  it("用户取消（confirmed:false）⇒ 什么都不报（取消不是失败）", async () => {
    reply = { confirmed: false };
    expect(await runMarketInstallAction(ENTRY, true, t)).toBe(false);
    expect(seen.settled).toEqual([]);
    expect(seen.notifyError).toEqual([]);
  });

  it("装成（confirmed:true，ok 省略）⇒ 返回 true，不报错", async () => {
    reply = { confirmed: true };
    expect(await runMarketInstallAction(ENTRY, true, t)).toBe(true);
    expect(seen.settled).toEqual([]);
  });

  it("离线 ⇒ 不发起请求（按钮置灰已说明原因）", async () => {
    expect(await runMarketInstallAction(ENTRY, false, t)).toBe(false);
    expect(seen.requests).toEqual([]);
  });
});
