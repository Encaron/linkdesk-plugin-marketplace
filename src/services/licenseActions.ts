/**
 * licenseActions — 付费流**动作单一入口**（R4-3.21；09 §三·补3「裁决全在壳」）。
 *
 * 三件事：
 *   - `verifyLicenseKey`：粘贴的密钥 + 作者公钥 → 壳 `licenses.verify`（Ed25519 离线验签；
 *     valid=true 时壳已把权益入库——市场零记账）。商店卡与详情弹窗共用本入口，⛔ 各自直呼 IPC；
 *   - `verifyFailText`：失败原因 → 用户面文案（⛔ 不上屏作者面词）；
 *   - `openBuyPage`：外链作者销售页（`shell.openExternal` T4 闸门）——buy/renew 同一条。
 *
 * 验签结果判定只在壳；本模块只转递与翻译。缺 licenses 面（旧壳/预览）→ 诚实报「不可用」。
 */

import { licensesApi, openExternal, type LicenseEntitlementView } from "./hostApi";

export type VerifyFailureReason =
  | "bad-key-format"
  | "bad-public-key"
  | "bad-signature"
  | "expired"
  | "machine-mismatch";

export interface LicenseVerifyOutcome {
  valid: boolean;
  pluginId?: string;
  exp?: number;
  failureReason?: VerifyFailureReason;
}

type T = (key: string, opts?: Record<string, unknown>) => string;

/** 验签（离线）——valid=true 时壳已入库；调用方随后 refresh 权益投影即可收敛全表面 */
export async function verifyLicenseKey(key: string, publicKey: string): Promise<LicenseVerifyOutcome> {
  const api = licensesApi();
  if (!api || typeof api.verify !== "function") {
    return { valid: false, failureReason: "bad-key-format" };
  }
  try {
    const r = (await api.verify(key, publicKey)) as Partial<LicenseVerifyOutcome> | undefined;
    return {
      valid: r?.valid === true,
      pluginId: typeof r?.pluginId === "string" ? r.pluginId : undefined,
      exp: typeof r?.exp === "number" ? r.exp : undefined,
      failureReason: r?.failureReason as VerifyFailureReason | undefined,
    };
  } catch {
    return { valid: false, failureReason: "bad-signature" };
  }
}

/** 失败原因 → 用户面文案（05 §05：WRONG 红 · 每个 reason 都说得清人话） */
export function verifyFailText(t: T, reason: VerifyFailureReason | undefined): string {
  switch (reason) {
    case "bad-key-format":
      return t("密钥格式不对——应是从作者那里拿到的 v1.… 长串");
    case "bad-public-key":
      return t("作者未提供可用的公钥——暂时无法验证");
    case "expired":
      return t("密钥已过期——续费后输入作者发你的新密钥");
    case "machine-mismatch":
      return t("这份密钥绑定的是另一台机器——在本机无法使用");
    case "bad-signature":
    default:
      return t("密钥验证未通过——请确认复制完整，或联系作者");
  }
}

/** 密钥形状预检（粘贴即时验签的触发器；⛔ 不做真验——真验只有壳一道） */
export function keyShapeOk(raw: string): boolean {
  return /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw.trim());
}

/** 外链购买/续费（09：buyPage 真机 = openExternal 离开应用；⛔ licenseUrl 未声明不渲染外跳钮）。
 *  即 `hostApi.openExternal` 的语义别名——购买流自己的名字，实现只有一份。 */
export const openBuyPage = openExternal;

/** 权益投影类型再出口（弹窗 props 用，免得各处摸 hostApi 内部） */
export type { LicenseEntitlementView };
