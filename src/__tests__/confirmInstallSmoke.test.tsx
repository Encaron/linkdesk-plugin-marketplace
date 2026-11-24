/**
 * ConfirmInstall 冒烟（E6#157 视图样板①）——2026-11-25 随 D8′ 重写。
 *
 * 判据：市场自绘卡在 jsdom 里真挂载、关键交互走通（不追像素）：
 *   ① 载荷 = 壳给的 `PluginConfirmViewPayload`（labels＋plan）⇒ 卡片按 plan 画标题/来源/动作；
 *   ② 点确认/取消 → `dialogHost.confirm()/cancel()` 恰一次（⛔ 不自动确认）；
 *   ③ 载荷缺失/形状不对 ⇒ 渲染 null（不白屏、不抛）。
 * 文案全部来自载荷（壳 t() 产物）——所以这里断言「壳给什么就画什么」，⛔ 不查字典。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ConfirmInstall from "../views/confirm/ConfirmInstall";
import type { PluginConfirmViewPayload } from "@linkdesk/contracts";

function stubDialogHost(payload: unknown | null) {
  const api = { confirm: vi.fn(), cancel: vi.fn() };
  Object.defineProperty(window, "linkdesk", {
    value: {
      dialogHost: {
        current: () => (payload ? { open: true, content: { payload } } : null),
        ...api,
      },
    },
    configurable: true,
  });
  return api;
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "linkdesk");
});

const LABELS = {
  installTitle: "安装 {{name}}",
  subFirst: "首次安装 · 壳托管确认",
  subSourceChanged: "来源已变更 · 按新装处理",
  subDowngrade: "降级安装 · 壳托管确认",
  subOfficial: "官方更新 · 壳托管确认",
  subUpdate: "更新 · 壳托管确认",
  noteFirst: "首装说明",
  noteSourceChanged: "来源变更说明",
  noteDowngrade: "降级说明",
  kvPlugin: "插件",
  kvPublisher: "发布者",
  kvSource: "来源",
  kvVersion: "版本",
  kvSize: "大小",
  kvIntegrity: "完整性",
  kvOldSource: "旧来源",
  kvNewSource: "新来源",
  integrityToVerify: "sha256 {{hash}} · 下载后校验",
  integrityMissing: "未提供校验值",
  warnSourceChanged: "警告",
  rememberSource: "记住来源",
  actionInstall: "确认安装",
  actionUpdate: "确认更新",
  actionUpdateAnyway: "仍要更新",
  actionCancel: "取消",
  unknownPublisher: "未知发布者",
  unknownSize: "未知大小",
  batchTitle: "更新插件",
  batchSub: "只列需要确认的项",
  statTotal: "总数",
  statAsk: "需确认",
  statSilent: "免问",
  groupAsk: "{{n}} 个需要确认",
  groupSilent: "{{n}} 个免问",
  groupSilentSummary: "{{label}} {{n}} 个",
  badgeOfficial: "官方",
  badgeThird: "第三方",
  silentLine: "{{summary}}按设置免问",
  silentAction: "改为逐个确认",
  rememberOfficial: "官方源不再询问",
  batchEmpty: "没有需要确认的项",
  batchNote: "取消 = 整批取消",
  actionConfirmBatch: "确认更新 {{n}} 个",
  actionRunBatch: "直接更新 {{n}} 个",
  actionCancelBatch: "取消",
  originLabel: "发起方",
  originAI: "AI",
  aiNoteTitle: "AI 说明",
  aiNoteHint: "由发起请求的 AI 提供",
  aiNoteMore: "展开",
  aiNoteLess: "收起",
};

const PAYLOAD = {
  kind: "install",
  labels: LABELS,
  plan: {
    totals: { total: 1, ask: 1, silent: 0 },
    groups: [{ sourceId: "official", label: "官方目录", trusted: true, silentAllowed: false, askCount: 1, silentCount: 0 }],
    ask: [
      {
        reason: "first-install",
        request: {
          pluginId: "demo",
          version: "1.0.0",
          downloadUrl: "https://example.dev/demo.zip",
          sha256: "a".repeat(64),
          source: { id: "official", url: "https://example.dev/marketplace.json" },
          display: { name: "Demo Alpha", size: 1234 },
        },
      },
    ],
    silent: [],
    rejected: [],
  },
  fromVersion: null,
} as unknown as PluginConfirmViewPayload;

describe("ConfirmInstall 冒烟（市场自绘卡）", () => {
  it("渲染不炸：标题带插件名、来源行来自 plan、两个动作都在", () => {
    stubDialogHost(PAYLOAD);
    const { container } = render(<ConfirmInstall />);
    expect(container.querySelector(".ldk-pic")).not.toBeNull();
    expect(screen.getByText("安装 Demo Alpha")).toBeTruthy();
    expect(screen.getByText("官方目录")).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认安装" })).toBeTruthy();
  });

  it("点确认 → dialogHost.confirm 恰一次；⛔ 不自动确认（挂载时零调用）", () => {
    const api = stubDialogHost(PAYLOAD);
    render(<ConfirmInstall />);
    expect(api.confirm).not.toHaveBeenCalled(); // 市场自绘卡也必须等人点
    fireEvent.click(screen.getByRole("button", { name: "确认安装" }));
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it("点取消 → dialogHost.cancel 恰一次", () => {
    const api = stubDialogHost(PAYLOAD);
    render(<ConfirmInstall />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(api.cancel).toHaveBeenCalledTimes(1);
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it("防御空态：载荷取不到 / 形状不对 ⇒ 渲染 null（不白屏）", () => {
    for (const bad of [null, { kind: "install" }, { kind: "batch", labels: LABELS, plan: PAYLOAD.plan }]) {
      stubDialogHost(bad);
      const { container, unmount } = render(<ConfirmInstall />);
      expect(container.firstElementChild).toBeNull();
      unmount();
    }
  });
});
