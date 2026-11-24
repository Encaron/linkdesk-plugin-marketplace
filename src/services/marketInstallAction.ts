/**
 * marketInstallAction — 目录条目「安装」的**唯一动作序列**（侧栏行内与商店卡共用）。
 *
 * 迁移说明（棒 6）：原住 `views/sidebar/ExploreView/useCatalogInstall.ts`（E6#86b 拆分）——侧栏视图
 * 私有件。商店（主区）与侧栏都要走同一条安装链（10 §六 `views → services`，⛔ 视图互相 import），
 * 故上移到 services；判断顺序与文案 key 逐字保留：
 *   online 防御 → 缺下载地址 → installWithProgress 存在性 → minAppVersion 门 → 确认卡 → startMarketInstall。
 *
 * 进度/失败/重试全走 startMarketInstall（壳侧 job 表广播回流；本函数不画进度——单一出处）。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { notifyError } from "./marketplaceShared/notifications";
import { startMarketInstall } from "./marketplaceShared/installFlow";
import { buildInstallRequest, installConfirmApi } from "./hostInstallConfirm";
import { minAppVerdict, readShellVersion } from "./minAppVersionGate";
import type { CatalogEntry } from "./marketCatalog";

const lk = () => window.linkdesk;

/** 安装动作（供 use 与测试；返回是否真正发起） */
export async function runMarketInstallAction(
  entry: CatalogEntry,
  online: boolean,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Promise<boolean> {
  if (!online) return false; // 离线钮置灰（G3）——此处防御不发起（title 已提示「联网后重试」）
  if (!entry.downloadUrl) {
    notifyError(t("该插件缺少下载地址"));
    return false;
  }
  /* 🔴 2026-11-24 用户拍板：**不再为老壳做任何适配**（本软件只有作者本人使用，没有旧版本用户）。
   * 市场只走壳托管的 requestInstall；拿不到这个面 = 壳太旧，直接如实报错，⛔ 不写回落分支。 */
  const hostApi = installConfirmApi();
  if (!hostApi) {
    notifyError(t("当前 LinkDesk 版本过旧，请更新后再安装插件"));
    return false;
  }
  // 2026-11-05 拍板②：minAppVersion 门（行内/商店/详情同一道）
  const gate = minAppVerdict(entry.minAppVersion, await readShellVersion());
  if (!gate.ok) {
    notifyError(t("需升级 LinkDesk 至 {{version}} 才能安装", { version: gate.need }));
    return false;
  }
  const res = await hostApi.requestInstall(buildInstallRequest(entry, "install", entry.downloadUrl));
  if (res?.confirmed && res?.ok === false) {
    // 用户点了确认但没装成（下载/校验/落盘失败）——如实报，⛔ 不假装启动成功
    notifyError(res.error || t("安装失败"));
    return false;
  }
  return res?.confirmed === true;
}

export function useMarketInstallAction(online: boolean) {
  const { t } = useTranslation();
  const handleInstall = useCallback((entry: CatalogEntry) => runMarketInstallAction(entry, online, t), [online, t]);
  return { handleInstall };
}
