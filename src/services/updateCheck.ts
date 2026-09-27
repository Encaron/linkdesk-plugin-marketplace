/**
 * updateCheck —— 手动「检查更新」的**唯一动作**（05「插件市场·检查更新」）。
 *
 * 🔴 这件东西为谁而存在：目录有 5min 缓存（`marketSources/io.ts` 的 `CACHE_TTL_MS`）＋ 发现循环每进程只排
 *   一趟（`updateDiscovery/schedule.ts`）＋ 行内「可更新」徽标只随目录**重投影**才翻新 ⇒ 用户刚发布的新版本，
 *   要么退软件重进、要么干等。本模块把引擎里**早已存在**的两条手动腿接成一件事：
 *     ① `runUpdateDiscovery(true)`  —— 强拉目录（绕 5min 缓存）+ 跑发现腿（推铃铛 / 代劳自动更新）
 *     ② `reprojectCatalog()`        —— 把目录**重投影**进共享 store ⇒ 行内「可更新」徽标当场翻新
 *
 * 🔴 顺序与网络次数（判据，动之前先读）：发现腿内部 `loadCatalog(true)` 会把实时内容**写进缓存**
 *   （`marketSources/fetch.ts:51`）⇒ 之后的 `reprojectCatalog()` 走**非强拉** `loadCatalog()`，命中刚写好
 *   的 fresh 缓存 ⇒ **全程只有 1 次网络**。反过来先重投影再发现 = 两次全源拉取（且 `forceRefreshCatalog`
 *   会先 `removeCache`，失败路径连 stale 兜底都没了）。故：**先发现，后重投影**——本文件是这句话的唯一落点，
 *   `src/__tests__/updateCheck.test.ts` 用注入 fetcher 数调用次数钉住它。
 *   （「一台没装插件」时发现腿在拉目录前就早退，此时重投影那一趟是唯一一次网络——仍是 1 次，判据不变。）
 *
 * 语义边界（05 §三）：本动作**只发现、只记账、只通知**——不构成对自动更新的授权。勾过自动更新的插件照既有
 *   规则由发现腿代劳，没勾的一律不动（`planDiscovery` / `selectAutoCandidates` 那套判据原样）。
 *
 * 返回值判据（沿用发现腿的 null 语义，见 `updateDiscovery/run.ts` 头注）：`DiscoveryPlan`（哪怕空）是**结论**；
 *   `null` 是**判不了**（读盘不可信 / 目录拉不到或坏 parse）——两种都折成本模块的 `state`，UI 据此选文案。
 *   `null` 时**不重投影**：目录没拿到，重投影只会把那点旧投影再推一遍（还会白搭一次通知）。
 *
 * 依赖方向：本模块在 `updateDiscovery` 与 `marketplaceShared` **之上**（两只都只向下 import，无回边）——
 *   `marketCatalog → marketSources → updateDiscovery → marketplaceShared → updateCheck`。
 */

import { runUpdateDiscovery } from "./updateDiscovery";
import type { DiscoveryPlan } from "./updateDiscovery";
import { reprojectCatalog } from "./marketplaceShared/catalogStore";

export interface UpdateCheckResult {
  /** `ok` = 比过了（含「没有可更新」这一结论）；`failed` = 判不了（目录取不到/坏 parse、读盘不可信） */
  state: "ok" | "failed";
  /** 本趟结论里的可更新插件数——与行内「可更新」徽标同一把钥匙（`planDiscovery` 的判定）。failed 恒 0。 */
  updatableCount: number;
  /** 完成时刻（毫秒）——就地注的时间锚（「刚刚」→ 具体时刻） */
  checkedAt: number;
}

const failed = (): UpdateCheckResult => ({ state: "failed", updatableCount: 0, checkedAt: Date.now() });

/** 手动检查更新——顺序判据见文件头。**本函数不抛**：任何失败都折成 `state:"failed"`，
 *  让按钮无论如何都回得到可用态（⛔ 不许出现「卡在检查中」的按钮）。 */
export async function checkForPluginUpdates(): Promise<UpdateCheckResult> {
  try {
    const plan: DiscoveryPlan | null = await runUpdateDiscovery(true);
    if (plan === null) return failed();
    await reprojectCatalog();
    return { state: "ok", updatableCount: plan.candidates.length, checkedAt: Date.now() };
  } catch {
    // 读盘/目录/配置任一处抛（如预览环境无 configuration 面）——一律「判不了」，不把异常漏给调用方
    return failed();
  }
}
