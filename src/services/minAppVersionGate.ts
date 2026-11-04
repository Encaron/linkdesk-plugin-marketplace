/**
 * minAppVersionGate——E6#30.8c 装前 minAppVersion 比对的**共享单点**（2026-11-05 拍板：四入口全走同一道门）。
 *
 * 缝的来历（壳仓 docs/05-插件更新/插件市场-minAppVersion版本门槛/ §二）：门原本只在详情页安装一处
 * （useInstallAction）——侧栏行内安装、手动更新、自动更新都放行了「需要更高壳版本」的包，只能靠壳加载门
 * （pluginLoader/resolution/runtime.ts）事后拦停 ⇒ 用户「更完才发现用不了」。本单点把比对收成一份，
 * 四入口（详情装／行内装／手动更／自动更候选过滤）全走这里，⛔ 各自再写第二份比对。
 *
 * 诚实口径（E6#30.8c 原文）：壳版本读失败 = 放行不拦（诚实不缺省拦装）——**判不了 ≠ 判不满足**。
 * 提示口径：error toast「需升级 LinkDesk 至 {{version}} 才能安装」（key 已在 i18n，详情页沿用）。
 */
import { compareVersions } from "./marketCatalog";

/** 单点判定（纯函数——vitest 直测）。min 缺声明 = 无门；壳版本缺/读失败 = 放行。 */
export function minAppVerdict(
  minAppVersion: string | undefined,
  shellVersion: string | undefined,
): { ok: boolean; need?: string } {
  if (!minAppVersion) return { ok: true };
  if (!shellVersion) return { ok: true };
  return compareVersions(shellVersion, minAppVersion) < 0 ? { ok: false, need: minAppVersion } : { ok: true };
}

/** 读当前壳版本（一次；面缺失/非串/抛错 = undefined——门放行）。 */
export async function readShellVersion(): Promise<string | undefined> {
  const get = window.linkdesk?.app?.getVersion;
  if (!get) return undefined;
  try {
    const v: unknown = await get();
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}
