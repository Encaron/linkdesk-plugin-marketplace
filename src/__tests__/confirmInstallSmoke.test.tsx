/**
 * E6#157 视图冒烟样板①——ConfirmInstall 安装确认卡（「渲染不炸 ＋ 关键交互」样板，06④ 收窄版拍板）。
 *
 * 冒烟判据：组件在 jsdom 里真挂载、关键交互走通——不追像素、不追全覆盖（视图层不做硬指标）。
 * 替身面：react-i18next 假 t（照 useInstallAction.test.ts 同一形状，假 t 回 key 保住「带参文案」的牙）；
 * window.linkdesk 只给 dialogHost 一扇（共享 mock 是最小面、视图专属桩住本测试文件——替身照契约）。
 * payload 照 installConfirmPayload.InstallConfirmPayload 契约形状；夹具全虚构（硬约束 21）。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ConfirmInstall from "../views/confirm/ConfirmInstall";
import type { InstallConfirmPayload } from "../services/installConfirmPayload";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/** dialogHost 替身——current() 按 payload 有无返回开/闭两态；confirm/cancel 可断言调用次数 */
function stubDialogHost(payload: InstallConfirmPayload | null) {
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

const PAYLOAD: InstallConfirmPayload = {
  name: "Demo Alpha", // 虚构（硬约束 21）
  publisher: "owner-two",
  sourceName: "owner-two/catalog-b",
  version: "1.0.0",
  size: 1234,
  mode: "install",
};

describe("ConfirmInstall 冒烟（E6#157 视图样板）", () => {
  it("渲染不炸：payload 在 ⇒ 卡片带标题、插件名（作者数据按原文）与取消/确认两个动作", () => {
    stubDialogHost(PAYLOAD);
    const { container } = render(<ConfirmInstall />);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector(".marketplace-mpd-confirm-title")?.textContent).toBe("确认安装"); // 假 t ⇒ key 即文案
    expect(screen.getByText("Demo Alpha")).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认安装" })).toBeTruthy();
  });

  it("关键交互：点确认 → dialogHost.confirm 恰一次；防双击锁 ⇒ 再点不重复结算，取消零调用", () => {
    const api = stubDialogHost(PAYLOAD);
    render(<ConfirmInstall />);
    const confirmBtn = screen.getByRole("button", { name: "确认安装" });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn); // submitting 锁——第二次 no-op
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it("关键交互：点取消 → dialogHost.cancel 恰一次（结算方向由壳定，本视图只表态）", () => {
    const api = stubDialogHost(PAYLOAD);
    render(<ConfirmInstall />);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(api.cancel).toHaveBeenCalledTimes(1);
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it("防御空态：payload 取不到 ⇒ 渲染 null（不白屏、不抛）", () => {
    stubDialogHost(null);
    const { container } = render(<ConfirmInstall />);
    expect(container.firstElementChild).toBeNull();
  });
});
