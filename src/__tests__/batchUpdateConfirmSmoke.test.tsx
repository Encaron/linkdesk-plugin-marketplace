/**
 * P0 批量确认卡冒烟——BatchUpdateConfirm（视图层：渲染不炸 + 关键交互）。
 * 假 t 做简单 {{}} 插值（否则「更新 2 个」按钮名断不出来）；dialogHost 替身照契约。
 * fixture 全虚构（硬约束 21）。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BatchUpdateConfirm from "../views/confirm/BatchUpdateConfirm";
import type { BatchConfirmPayload } from "../services/batchConfirmPayload";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(opts?.[k] ?? "")),
  }),
}));

function stubDialogHost(payload: BatchConfirmPayload | null) {
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

const PAYLOAD: BatchConfirmPayload = {
  mode: "batch",
  officialCount: 1,
  thirdPartyCount: 1,
  entries: [
    {
      id: "demo-alpha",
      name: "Demo Alpha",
      publisher: "Demo Author",
      official: true,
      sourceName: "demo-owner/demo-alpha",
      version: "2.0.0",
      fromVersion: "1.9.0",
      size: 1024,
    },
    {
      id: "demo-beta",
      name: "Demo Beta",
      publisher: "Demo Third",
      sourceName: "third.invalid/demo-beta",
      version: "1.1.0",
    },
  ],
};

describe("BatchUpdateConfirm 冒烟（P0）", () => {
  it("渲染：标题、计数、两行、取消/更新按钮", () => {
    stubDialogHost(PAYLOAD);
    const { container } = render(<BatchUpdateConfirm />);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector(".marketplace-mpd-confirm-title")?.textContent).toBe("确认批量更新");
    expect(screen.getByText(/共 2 个/)).toBeTruthy();
    expect(screen.getByText("Demo Alpha")).toBeTruthy();
    expect(screen.getByText("Demo Beta")).toBeTruthy();
    expect(screen.getByText("v1.9.0 → v2.0.0")).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "更新 2 个" })).toBeTruthy();
  });

  it("关键交互：点更新 → confirm 恰一次；防双击锁；取消零调用", () => {
    const api = stubDialogHost(PAYLOAD);
    render(<BatchUpdateConfirm />);
    const btn = screen.getByRole("button", { name: "更新 2 个" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it("关键交互：点取消 → cancel 恰一次", () => {
    const api = stubDialogHost(PAYLOAD);
    render(<BatchUpdateConfirm />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(api.cancel).toHaveBeenCalledTimes(1);
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it("20+ 条：24 行全挂载（列表滚动由 CSS，不截断数据）", () => {
    const many: BatchConfirmPayload = {
      mode: "batch",
      officialCount: 0,
      thirdPartyCount: 24,
      entries: Array.from({ length: 24 }, (_, i) => ({
        id: `demo-${i}`,
        name: `Demo ${i}`,
        version: "1.0.0",
      })),
    };
    stubDialogHost(many);
    const { container } = render(<BatchUpdateConfirm />);
    expect(container.querySelectorAll(".marketplace-mpd-batch-row")).toHaveLength(24);
  });

  it("防御空态：payload 取不到 ⇒ null（不白屏、不抛）", () => {
    stubDialogHost(null);
    const { container } = render(<BatchUpdateConfirm />);
    expect(container.firstElementChild).toBeNull();
  });
});
