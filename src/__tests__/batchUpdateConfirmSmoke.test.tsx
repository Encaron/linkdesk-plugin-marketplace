/**
 * BatchUpdateConfirm 冒烟（市场自绘批量卡，2026-11-25）。
 *
 * 判据三条：
 *   ① 载荷是壳的 `PluginConfirmViewPayload(kind:"batch")` ⇒ 卡上分组/统计来自 `plan`（⛔ 不自造）；
 *   ② 确认/取消只调 `dialogHost.confirm()/cancel()`（⛔ 不自动确认）；
 *   ③ 「以后官方源不再询问」/「改为逐个确认」= 写壳策略 + **向壳重算计划**（`previewUpdatePlan`），
 *      ⛔ 市场不自己判哪些免问。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import BatchUpdateConfirm from "../views/confirm/BatchUpdateConfirm";
import type { PluginConfirmViewPayload } from "@linkdesk/contracts";

const LABELS: Record<string, string> = {
  batchTitle: "更新插件",
  batchSub: "只列需要确认的项",
  statTotal: "本批总数",
  statAsk: "需要确认",
  statSilent: "按设置免问",
  groupAsk: "{{n}} 个需要确认",
  groupSilent: "{{n}} 个免问",
  groupSilentSummary: "{{label}} {{n}} 个",
  badgeOfficial: "官方",
  badgeThird: "第三方",
  silentLine: "{{summary}}按设置免问，将随本批一起执行。",
  silentAction: "改为逐个确认",
  rememberOfficial: "以后官方源更新不再询问",
  batchEmpty: "没有需要确认的项",
  batchNote: "取消 = 整批取消",
  actionConfirmBatch: "确认更新 {{n}} 个",
  actionRunBatch: "直接更新 {{n}} 个",
  actionCancelBatch: "取消",
  unknownSize: "未知大小",
  kvVersion: "版本",
};

function plan(askCount = 1) {
  return {
    totals: { total: 2, ask: askCount, silent: 2 - askCount },
    groups: [
      { sourceId: "third", label: "第三方源", trusted: false, silentAllowed: false, askCount, silentCount: 0 },
      { sourceId: "official", label: "官方目录", trusted: true, silentAllowed: true, askCount: 0, silentCount: 1 },
    ],
    ask: askCount
      ? [
          {
            reason: "untrusted-source",
            request: {
              pluginId: "demo",
              version: "2.0.0",
              downloadUrl: "https://example.dev/demo.zip",
              source: { id: "third", url: "https://example.dev/marketplace.json", publisher: "Lab" },
              display: { name: "Demo", size: 2048 },
            },
          },
        ]
      : [],
    silent: [{ pluginId: "official-one", displayName: "官方一", version: "1.1.0", sourceId: "official" }],
    rejected: [],
  };
}

const PAYLOAD = {
  kind: "batch",
  labels: LABELS,
  plan: plan(1),
  policy: { silentOfficial: false, silentTrustedSources: false },
  reqs: [],
} as unknown as PluginConfirmViewPayload;

function stub(payload: unknown, plugins: Record<string, unknown> = {}) {
  const api = { confirm: vi.fn(), cancel: vi.fn() };
  Object.defineProperty(window, "linkdesk", {
    value: {
      dialogHost: { current: () => (payload ? { open: true, content: { payload } } : null), ...api },
      plugins,
    },
    configurable: true,
  });
  return api;
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "linkdesk");
});

describe("BatchUpdateConfirm 冒烟", () => {
  it("渲染不炸：标题/统计/待确认分组都来自 plan", () => {
    stub(PAYLOAD);
    const { container } = render(<BatchUpdateConfirm />);
    expect(container.querySelector(".ldk-pic")).not.toBeNull();
    expect(screen.getByText("更新插件")).toBeTruthy();
    expect(screen.getByText("第三方源")).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
  });

  it("确认/取消只回 dialogHost，⛔ 不自动结算", () => {
    const api = stub(PAYLOAD);
    render(<BatchUpdateConfirm />);
    expect(api.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(api.cancel).toHaveBeenCalledTimes(1);
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it("「改为逐个确认」= 向壳要 forceAsk 计划（⛔ 市场不自己判）", async () => {
    const previewUpdatePlan = vi.fn(async () => plan(2));
    stub(PAYLOAD, { previewUpdatePlan });
    render(<BatchUpdateConfirm />);
    fireEvent.click(screen.getByText("改为逐个确认"));
    await waitFor(() => expect(previewUpdatePlan).toHaveBeenCalledWith([], { forceAsk: true }));
  });

  it("「以后官方源不再询问」= 写壳策略后重算计划", async () => {
    const setUpdatePolicy = vi.fn(async () => ({ silentOfficial: true, silentTrustedSources: false }));
    const previewUpdatePlan = vi.fn(async () => plan(0));
    stub(PAYLOAD, { setUpdatePolicy, previewUpdatePlan });
    render(<BatchUpdateConfirm />);
    fireEvent.click(screen.getByText("以后官方源更新不再询问"));
    await waitFor(() => expect(setUpdatePolicy).toHaveBeenCalledWith({ silentOfficial: true }));
    await waitFor(() => expect(previewUpdatePlan).toHaveBeenCalled());
  });

  it("载荷形状不对（kind 不是 batch）⇒ 渲染 null", () => {
    stub({ kind: "install", labels: LABELS, plan: plan(1) });
    const { container } = render(<BatchUpdateConfirm />);
    expect(container.firstElementChild).toBeNull();
  });
});
