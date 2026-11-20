/**
 * libraryActions — 「我的库」批量动作的**服务单点**（R4-3.13；10 §一 逻辑归一化）。
 *
 * 纪律：
 *   - 插件级停用/卸载 = 壳 `pluginManager` 既有 API（⛔ 新造动作、⛔ 视图里直调）；
 *   - 批量更新 = 逐项走 `performMarketUpdate`（与卡片/详情同一条序列：在线防御/版本址/壳版本门/确认）；
 *   - 「全部已读」= 命令面唯一入口 `marketplace.markAllRead`（discoverReads 单点；⛔ 碰任务型更新数字）。
 */

import type { CatalogEntry } from "./marketCatalog";
import { performMarketUpdate } from "./marketUpdateAction";
import { scheduleDataRefresh } from "./marketplaceShared/pluginsStore";

const pm = () => window.linkdesk?.pluginManager;

/** 批量停用（core 由调用方过滤；返回成功数） */
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

/** 批量卸载（core 由调用方过滤；返回成功数） */
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

/** 全部更新（逐项走同一条更新序列；回执 = 成功/取消/阻塞计数） */
export async function updateAll(
  entries: readonly CatalogEntry[],
  online: boolean,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Promise<{ ok: number; failed: number; cancelled: number }> {
  let ok = 0;
  let failed = 0;
  let cancelled = 0;
  for (const entry of entries) {
    const outcome = await performMarketUpdate({
      pluginId: entry.id,
      entry,
      displayName: entry.name,
      ver: entry.version,
      online,
      refresh: scheduleDataRefresh,
      t,
    });
    if (outcome === "ok") ok++;
    else if (outcome === "cancelled") cancelled++;
    else failed++;
  }
  return { ok, failed, cancelled };
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
