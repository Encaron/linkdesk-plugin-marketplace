/**
 * hostApi — 商店用到的**壳新 API 的窄门面**（licenses / toasts / shell.openExternal）。
 *
 * 为什么需要它：本仓 `@linkdesk/contracts@0.1.15` 的类型面落后于壳已发布的 API（licenses/toasts 是
 * R4-1.3/棒 0 新增，contracts 版本随棒 12 才统一升）——直接 `window.linkdesk.licenses` 会 tsc 报不存在。
 * 照棒 4 的既有处置（installFromDirectory 局部收窄）：**只收窄本仓要用到的面**、运行时缺面回退，
 * ⛔ 不改依赖、⛔ 删功能。类型注释即契约（与 contracts/linkdesk.d.ts 同形）。
 */

export interface LicenseEntitlementView {
  pluginId: string;
  /** 载荷 exp（unix 秒）；undefined = 永久 */
  exp?: number;
}

interface LicensesLike {
  list(): Promise<LicenseEntitlementView[]>;
  verify(key: string, publicKey: string): Promise<unknown>;
  remove(pluginId: string): Promise<void>;
}

interface ToastsLike {
  show(opts: {
    message: string;
    key?: string;
    severity?: "info" | "success" | "warning";
    ttl?: number;
  }): unknown;
}

/** 壳 licenses 面（棒 2 已随 0.2.56 发布；旧壳/预览环境 → null，消费方按「无权益」降级） */
export function licensesApi(): LicensesLike | null {
  const lk = window.linkdesk as unknown as { licenses?: unknown } | undefined;
  const api = lk?.licenses;
  // dev 宿主的契约 Proxy 对「树外路径」返回 call-stub 函数（不是对象）——类型守卫必须核对象形状，
  // 否则 null 检查通过、api.list() 当场抛，effect 未 catch ⇒ 整棵商店树空白。
  if (!api || typeof api !== "object") return null;
  const candidate = api as Partial<LicensesLike>;
  return typeof candidate.list === "function" ? (candidate as LicensesLike) : null;
}

/** Toast 动作（01-API契约：最多 1 个，超限由壳层降级面板） */
export interface ToastAction {
  title: string;
  command?: string;
  args?: unknown[];
}

/** 壳轻 Toast（棒 0 `window.linkdesk.toasts`，顶层平铺；⛔ 无 ui.toasts 层级）。缺面静默。 */
export function showToast(
  message: string,
  opts?: { key?: string; severity?: "info" | "success" | "warning"; ttl?: number; action?: ToastAction },
): void {
  const lk = window.linkdesk as unknown as { toasts?: ToastsLike } | undefined;
  try {
    lk?.toasts?.show({ message, ...opts });
  } catch {
    /* Toast 面缺失（旧壳/预览）——轻反馈丢失不影响业务事实 */
  }
}

/** 受控外链（T4 壳白名单闸门；拒绝会 reject——调用方要知道并提示） */
export async function openExternal(url: string): Promise<boolean> {
  const lk = window.linkdesk as unknown as { shell?: { openExternal?: (u: string) => Promise<void> } } | undefined;
  if (!lk?.shell?.openExternal) return false;
  try {
    await lk.shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
}
