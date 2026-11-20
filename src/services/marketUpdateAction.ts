/**
 * marketUpdateAction — 已装插件「更新」的**唯一动作序列**（详情页版本动作与商店卡共用）。
 *
 * 迁移说明（棒 6）：原核心住 `views/detail/DetailView/useDetailVersionAction.ts` 的 `doVersionAction`
 * （E6#33b/#33c 版本级动作）。商店主面给卡片「更新」钮时若再抄一遍，就是 10 §一「同一按钮两套实现」——
 * 故把**执行序列**抽到本服务，详情 hook 改为薄皮（版本下拉/降级确认仍在视图层）。
 *
 * 序列（逐字保留原实现）：
 *   在线防御 → 版本下载址 → 壳版本门（升级/同级才比）→ 确认卡（E6#71k「都问」）→ pm.update
 *   → 成功：钉版本记账 + refreshPlugins；失败/取消：settleUpdateFailure（取消不算失败）。
 */

import type { CatalogEntry } from "./marketCatalog";
import { compareVersions, pinnedAfterApply, versionDownloadUrl } from "./marketCatalog";
import { minAppVerdict, readShellVersion } from "./minAppVersionGate";
import { notifyError, settleUpdateFailure } from "./marketplaceShared/notifications";
import { confirmMarketInstall } from "./installGate";
import { setPinnedVersion } from "./installedUpdateMeta";

const pm = () => window.linkdesk?.pluginManager;

export type MarketUpdateOutcome = "ok" | "cancelled" | "blocked";

export interface MarketUpdateOptions {
  pluginId: string;
  /** 目录条目（缺省 = 推不出版本下载址 → 报缺下载地址） */
  entry?: CatalogEntry;
  displayName: string;
  /** 目标版本（缺省 = 条目顶层版本） */
  ver?: string;
  /** 已装版本（升降判定基准；缺省 = 不判降级） */
  localVer?: string;
  online: boolean;
  /** 成功后的收敛动作（详情 refreshPlugins / 商店 scheduleDataRefresh） */
  refresh: () => void;
  /** i18n 函数（失败文案） */
  t: (key: string, opts?: Record<string, unknown>) => string;
}

/** 执行一次更新/降级（不持有 UI 状态——调用方负责 busy 态） */
export async function performMarketUpdate(o: MarketUpdateOptions): Promise<MarketUpdateOutcome> {
  const { pluginId, entry, displayName, online, refresh, t } = o;
  const ver = o.ver ?? entry?.version;
  if (!online) return "blocked";
  const url = entry && ver ? versionDownloadUrl(entry, ver) : undefined;
  if (!url) {
    notifyError(t("该插件缺少下载地址"));
    return "blocked";
  }
  const upd = pm()?.update;
  if (!upd) {
    notifyError(t("更新失败"));
    return "blocked";
  }
  const isDowngrade = !!o.localVer && !!ver && compareVersions(ver, o.localVer) < 0;
  // 升/同级过 minAppVersion 门；降级不比（entry.minAppVersion 是最新版要求）
  if (!isDowngrade) {
    const gate = minAppVerdict(entry?.minAppVersion, await readShellVersion());
    if (!gate.ok) {
      notifyError(t("需升级 LinkDesk 至 {{version}} 才能安装", { version: gate.need }));
      return "blocked";
    }
  }
  if (entry) {
    const ok = await confirmMarketInstall(entry, "update", ver);
    if (!ok) return "cancelled";
  }
  try {
    const r = await upd(pluginId, { url, allowOlder: isDowngrade ? true : undefined });
    if (r && r.success) {
      const pin = entry && ver ? pinnedAfterApply(entry, ver) : undefined;
      if (pin !== undefined) void setPinnedVersion(pluginId, pin);
      refresh();
      return "ok";
    }
    if (!r?.cancelled) settleUpdateFailure(pluginId, displayName, url, r?.error ?? "");
    return r?.cancelled ? "cancelled" : "blocked";
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    settleUpdateFailure(pluginId, displayName, url, raw);
    return "blocked";
  }
}
