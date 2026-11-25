/**
 * libraryActions — 「我的库」批量动作的**服务单点**（R4-3.13；10 §一 逻辑归一化）。
 *
 * 纪律：
 *   - 插件级停用/卸载 = 壳 `pluginManager` 既有 API（⛔ 新造动作、⛔ 视图里直调）；
 *   - 批量更新 = 逐项走 `performMarketUpdate`（与卡片/详情同一条序列：在线防御/版本址/壳版本门/确认）；
 *   - 「全部已读」= 命令面唯一入口 `marketplace.markAllRead`（discoverReads 单点；⛔ 碰任务型更新数字）。
 */

import type { CatalogEntry } from "./marketCatalog";
import { versionDownloadUrl } from "./marketCatalog";
import { notifyError } from "./marketplaceShared/notifications";
import { buildInstallRequest, installConfirmApi } from "./hostInstallConfirm";
import { scheduleDataRefresh } from "./marketplaceShared/pluginsStore";

const pm = () => window.linkdesk?.pluginManager;

/** 批量停用（重要型/essential 由调用方过滤；返回成功数） */
export async function bulkDisable(ids: readonly string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    try {
      await pm()?.disable(id);
      n++;
    } catch {
      /* 单条失败不阻塞其余 */
    }
  }
  scheduleDataRefresh();
  return n;
}

/** 批量卸载（重要型/essential 由调用方过滤；返回成功数） */
export async function bulkUninstall(ids: readonly string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    try {
      await pm()?.uninstall(id);
      n++;
    } catch {
      /* 单条失败不阻塞其余 */
    }
  }
  scheduleDataRefresh();
  return n;
}

/**
 * 全部更新——P0：**一张汇总卡确认整批**，随后逐项走同一条更新序列（skipConfirm）。
 * ⛔ 不在市场里做来源信任/免问判定；P1 壳 policy 接管后再把 silent/ask 分组传进来。
 * @param localVersions pluginId → 已装版本（**只用于批量卡显示 v旧→v新**；⛔ 不传给
 *   performMarketUpdate —— P0 批量跳过单项确认，不能因此放行降级；版本方向仍由壳 stage 校验）
 */
export interface BulkUpdateResult {
  ok: number;
  failed: number;
  cancelled: number;
  /** true = 走的是壳托管批量（完成反馈由壳统一出：轻 toast + 铃铛面板）——调用方 ⛔ 再弹一次 */
  hosted?: boolean;
  /** hosted 时：整批是否被用户确认（false = 取消，0 个入队） */
  confirmed?: boolean;
}

export async function updateAll(
  entries: readonly CatalogEntry[],
  online: boolean,
  t: (key: string, opts?: Record<string, unknown>) => string,
  localVersions?: Record<string, string>,
): Promise<BulkUpdateResult> {
  if (entries.length === 0) return { ok: 0, failed: 0, cancelled: 0 };
  // P1：新壳 ⇒ 一张汇总卡由壳画、计划由壳算、执行与汇总也由壳（市场只提交结构化请求）
  const hostApi = installConfirmApi();
  if (hostApi) {
    const reqs = entries
      .map((entry) => {
        const url = versionDownloadUrl(entry, entry.version);
        return url ? buildInstallRequest(entry, "update", url, { version: entry.version }) : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (reqs.length === 0) return { ok: 0, failed: 0, cancelled: 0, hosted: true, confirmed: false };
    const res = await hostApi.requestUpdateBatch(reqs);
    return res?.confirmed
      ? { ok: 0, failed: 0, cancelled: 0, hosted: true, confirmed: true }
      : { ok: 0, failed: 0, cancelled: reqs.length, hosted: true, confirmed: false };
  }
  notifyError(t("当前 LinkDesk 版本过旧，请更新后再批量更新插件"));
  return { ok: 0, failed: entries.length, cancelled: 0 };
}

/** 全部已读（发现型）——命令面唯一入口；返回 cleared */
export async function markAllDiscoverRead(): Promise<number> {
  try {
    const r = (await window.linkdesk?.commands?.executeCommand?.("marketplace.markAllRead", {
      kind: "all",
    })) as { cleared?: number } | undefined;
    return typeof r?.cleared === "number" ? r.cleared : 0;
  } catch {
    return 0;
  }
}
