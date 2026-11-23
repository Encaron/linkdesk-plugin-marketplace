/**
 * updateAll（P0）——一张汇总卡确认整批，随后逐项 skipConfirm。
 *
 * 钉四件：
 *   ① 确认只发生一次（不是 N 次）；
 *   ② 确认拒绝 → 0 个更新、N 个 cancelled，且不调用 performMarketUpdate；
 *   ③ 确认通过 → 每项都带 skipConfirm:true + localVer；
 *   ④ 空列表 → 零调用。
 * 模块级 mock：只测编排，不重复测更新序列本身。
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CatalogEntry } from "../services/marketCatalog";

vi.mock("../services/marketUpdateAction", () => ({
  performMarketUpdate: vi.fn(async () => "ok"),
}));
vi.mock("../services/installGate", () => ({
  confirmMarketBatch: vi.fn(async () => true),
}));
vi.mock("../services/marketplaceShared/pluginsStore", () => ({
  scheduleDataRefresh: vi.fn(),
}));

import { updateAll } from "../services/libraryActions";
import { performMarketUpdate } from "../services/marketUpdateAction";
import { confirmMarketBatch } from "../services/installGate";

const A: CatalogEntry = {
  id: "demo-alpha",
  name: "Demo Alpha",
  version: "2.0.0",
  downloadUrl: "https://example.invalid/demo-alpha.linkdesk-plugin",
  author: { name: "Demo Author" },
};
const B: CatalogEntry = {
  id: "demo-beta",
  name: "Demo Beta",
  version: "1.1.0",
  downloadUrl: "https://example.invalid/demo-beta.linkdesk-plugin",
  author: { name: "Demo Author" },
};
const t = (k: string) => k;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(confirmMarketBatch).mockResolvedValue(true);
  vi.mocked(performMarketUpdate).mockResolvedValue("ok");
});

describe("updateAll（P0 一次汇总确认）", () => {
  it("确认一次，逐项 skipConfirm；localVersions 只进批量卡，不进更新序列", async () => {
    const r = await updateAll([A, B], true, t as never, { "demo-alpha": "1.9.0" });

    expect(r).toEqual({ ok: 2, failed: 0, cancelled: 0 });
    expect(confirmMarketBatch).toHaveBeenCalledTimes(1);
    expect(confirmMarketBatch).toHaveBeenCalledWith([A, B], { "demo-alpha": "1.9.0" });
    expect(performMarketUpdate).toHaveBeenCalledTimes(2);
    expect(performMarketUpdate.mock.calls[0][0]).toMatchObject({
      pluginId: "demo-alpha",
      skipConfirm: true,
    });
    // P0 安全：批量跳过单项确认 ⇒ 不传 localVer，避免把降级误放行（版本方向仍由壳 stage 校验）
    expect(performMarketUpdate.mock.calls[0][0]).not.toHaveProperty("localVer");
    expect(performMarketUpdate.mock.calls[1][0]).toMatchObject({
      pluginId: "demo-beta",
      skipConfirm: true,
    });
  });

  it("确认拒绝 → 整批取消；不进入逐项更新", async () => {
    vi.mocked(confirmMarketBatch).mockResolvedValue(false);
    const r = await updateAll([A, B], true, t as never);
    expect(r).toEqual({ ok: 0, failed: 0, cancelled: 2 });
    expect(performMarketUpdate).not.toHaveBeenCalled();
  });

  it("空列表 → 零确认零更新", async () => {
    const r = await updateAll([], true, t as never);
    expect(r).toEqual({ ok: 0, failed: 0, cancelled: 0 });
    expect(confirmMarketBatch).not.toHaveBeenCalled();
    expect(performMarketUpdate).not.toHaveBeenCalled();
  });
});
