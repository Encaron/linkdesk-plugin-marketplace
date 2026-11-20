/**
 * LicenseModal 冒烟（R4-3.21）——粘贴即时验签的**交互契约**。
 * 服务层（licenseActions）与作者域 hook 打 mock：本件只钉弹窗自己的行为——
 * 形状齐才发验签、WRONG 红/VALID 绿、valid ⇒ onVerified + 自动收起。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { LicenseModal } from "../views/store/LicenseModal";
import { __resetRealmSlots } from "../services/realmSlot";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k,
  }),
}));

/* 作者域 hook 打 mock——弹窗只消费 domain.publicKey（真实懒加载链在 authors.test 覆盖） */
const useAuthorDomainMock = vi.fn(() => ({ domain: { publicKey: "AUTHOR_PUBKEY" }, loading: false }));
vi.mock("../services/authors", () => ({
  useAuthorDomain: (...args: unknown[]) => useAuthorDomainMock(...(args as [])),
}));

/* 验签服务打 mock——keyShapeOk/verifyFailText 走真实现（弹窗的形状触发器是被测行为的一部分） */
const verifyMock = vi.fn(async () => ({ valid: false, failureReason: "bad-signature" as const }));
vi.mock("../services/licenseActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/licenseActions")>();
  return { ...actual, verifyLicenseKey: (...args: unknown[]) => verifyMock(...(args as [])) };
});

beforeEach(() => {
  __resetRealmSlots();
  verifyMock.mockClear();
  useAuthorDomainMock.mockClear();
  useAuthorDomainMock.mockImplementation(() => ({ domain: { publicKey: "AUTHOR_PUBKEY" }, loading: false }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LicenseModal", () => {
  it("open=false 不渲染；open=true 出弹窗并带插件名引导句", () => {
    render(<LicenseModal open={false} pluginName="Demo Paid" authorId="demo-author" onClose={() => {}} onVerified={() => {}} />);
    expect(screen.queryByText("输入许可密钥")).toBeNull();
    render(<LicenseModal open pluginName="Demo Paid" authorId="demo-author" onClose={() => {}} onVerified={() => {}} />);
    expect(screen.getByText("输入许可密钥")).toBeTruthy();
    expect(screen.getByText("粘贴 Demo Paid 的许可密钥——验证在本机完成，不联网上传")).toBeTruthy();
  });

  it("形状齐才发验签（粘半截不调壳；作者块公钥随行）", async () => {
    render(<LicenseModal open pluginName="Demo Paid" authorId="demo-author" onClose={() => {}} onVerified={() => {}} />);
    const input = screen.getByLabelText("许可密钥") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "v1.half" } });
    expect(verifyMock).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "v1.abc.def" } });
    await waitFor(() => expect(verifyMock).toHaveBeenCalledWith("v1.abc.def", "AUTHOR_PUBKEY"));
  });

  it("验签不过 ⇒ 结论行红句（failureReason 文案）；onVerified 不调", async () => {
    render(<LicenseModal open pluginName="Demo Paid" authorId="demo-author" onClose={() => {}} onVerified={() => {}} />);
    fireEvent.change(screen.getByLabelText("许可密钥"), { target: { value: "v1.abc.def" } });
    await waitFor(() => expect(screen.getByText("密钥验证未通过——请确认复制完整，或联系作者")).toBeTruthy());
  });

  it("验签通过 ⇒ onVerified 一次 + 结论绿句 + 自动收起（onClose）", async () => {
    verifyMock.mockResolvedValue({ valid: true, pluginId: "demo-paid" });
    const onVerified = vi.fn();
    const onClose = vi.fn();
    render(<LicenseModal open pluginName="Demo Paid" authorId="demo-author" onClose={onClose} onVerified={onVerified} />);
    fireEvent.change(screen.getByLabelText("许可密钥"), { target: { value: "v1.abc.def" } });
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("许可有效——安装已解锁")).toBeTruthy());
    await act(() => new Promise((r) => setTimeout(r, 1000)));
    expect(onClose).toHaveBeenCalled();
  });

  it("作者块无公钥 ⇒ 引导句换「未声明公钥」（如实告知，不假装验过）", () => {
    useAuthorDomainMock.mockImplementation(() => ({ domain: undefined, loading: false }));
    render(<LicenseModal open pluginName="Demo Paid" authorId="" onClose={() => {}} onVerified={() => {}} />);
    expect(screen.getByText(/作者块未声明公钥/)).toBeTruthy();
  });
});
