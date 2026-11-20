/**
 * licenseActions 单测（R4-3.21）——许可验签**动作单一入口**。
 * 钉住：转递形状（key+publicKey → 壳 verify）、缺面/抛错的诚实回执、失败文案封闭映射、密钥形状预检。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { keyShapeOk, verifyFailText, verifyLicenseKey } from "../services/licenseActions";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;
const t = (k: string, o?: Record<string, unknown>) =>
  o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k;

function stubLicenses(verify: unknown) {
  // licensesApi() 的形状守卫核 `list`（hostApi 头注：dev 契约 Proxy 防线）——stub 必须带 list
  Object.defineProperty(window, "linkdesk", {
    value: { licenses: { list: vi.fn(async () => []), verify } },
    configurable: true,
  });
}

afterEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  vi.restoreAllMocks();
});

describe("verifyLicenseKey", () => {
  it("转递 key+publicKey 给壳 verify，回执原样带回", async () => {
    const verify = vi.fn(async () => ({ valid: true, pluginId: "demo-paid", exp: 123 }));
    stubLicenses(verify);
    const r = await verifyLicenseKey("v1.a.b", "PUBKEY");
    expect(verify).toHaveBeenCalledWith("v1.a.b", "PUBKEY");
    expect(r).toEqual({ valid: true, pluginId: "demo-paid", exp: 123 });
  });

  it("壳面缺失 ⇒ invalid + bad-key-format（诚实报不可用，不假成功）", async () => {
    Object.defineProperty(window, "linkdesk", { value: {}, configurable: true });
    const r = await verifyLicenseKey("v1.a.b", "PUBKEY");
    expect(r.valid).toBe(false);
    expect(r.failureReason).toBe("bad-key-format");
  });

  it("verify 抛错 ⇒ invalid + bad-signature（终局必达，调用方按钮不悬挂）", async () => {
    stubLicenses(vi.fn(async () => Promise.reject(new Error("boom"))));
    const r = await verifyLicenseKey("v1.a.b", "PUBKEY");
    expect(r).toEqual({ valid: false, failureReason: "bad-signature" });
  });
});

describe("keyShapeOk / verifyFailText", () => {
  it("v1.<payload>.<sig> 形状预检（即时验签触发器）", () => {
    expect(keyShapeOk("v1.Abc-_123.xY-_9")).toBe(true);
    expect(keyShapeOk("v1.abc")).toBe(false);
    expect(keyShapeOk("")).toBe(false);
    expect(keyShapeOk("hello world")).toBe(false);
  });

  it("失败原因 → 用户面文案（封闭映射；unknown 落通用句）", () => {
    expect(verifyFailText(t, "bad-key-format")).toBe("密钥格式不对——应是从作者那里拿到的 v1.… 长串");
    expect(verifyFailText(t, "bad-public-key")).toBe("作者未提供可用的公钥——暂时无法验证");
    expect(verifyFailText(t, "expired")).toBe("密钥已过期——续费后输入作者发你的新密钥");
    expect(verifyFailText(t, "machine-mismatch")).toBe("这份密钥绑定的是另一台机器——在本机无法使用");
    expect(verifyFailText(t, "bad-signature")).toBe("密钥验证未通过——请确认复制完整，或联系作者");
    expect(verifyFailText(t, undefined)).toBe("密钥验证未通过——请确认复制完整，或联系作者");
  });
});
