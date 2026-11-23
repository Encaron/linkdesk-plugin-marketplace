/**
 * batchConfirmPayload——P0「Update all」批量确认卡载荷（纯函数，单测友好）。
 *
 * 口径（P0 过渡桥）：
 *   - 只把目录条目 + 已装版本映射成**展示数据**；
 *   - ⛔ 不做来源信任/免问判定、不分组、不裁剪——这些是 P1 壳 `policy.ts` 的事；
 *   - P0 这张卡仍然**每次批量都问**，只是把 N 张单卡合并成 1 张。
 *
 * 归一化：`authorLabel` 复用 `installConfirmPayload` 的唯一实现，⛔ 不复制第二份
 *   （2026-11-24 头像三处不同源的教训：同一事实只留一个推导点）。
 */

import type { CatalogEntry } from "./marketCatalog";
import { authorLabel } from "./catalogText"; // P1 归一化：作者显示名唯一实现（catalogText）

/** 批量卡里的一行（结构克隆安全：纯原始数据，零函数零闭包） */
export interface BatchConfirmEntry {
  id: string;
  name: string;
  publisher?: string;
  official?: boolean;
  sourceName?: string;
  /** 目标版本（目录条目顶层 version） */
  version: string;
  /** 已装版本（LibraryView 传入；缺省只显示目标版本） */
  fromVersion?: string;
  /** 包大小字节（视图本地 fmtSize） */
  size?: number;
}

export interface BatchConfirmPayload {
  mode: "batch";
  entries: BatchConfirmEntry[];
  officialCount: number;
  thirdPartyCount: number;
}

/**
 * 构造批量确认载荷。
 * @param entries       待更新目录条目（调用方已过滤 core / 无下载址）
 * @param localVersions pluginId → 已装版本（用于显示 v旧 → v新；缺省只显示目标版本）
 */
export function batchConfirmPayload(
  entries: readonly CatalogEntry[],
  localVersions?: Record<string, string>,
): BatchConfirmPayload {
  const rows: BatchConfirmEntry[] = entries.map((e) => ({
    id: e.id,
    name: e.name,
    publisher: authorLabel(e.author),
    official: e.official === true,
    sourceName: e.sourceName,
    version: e.version,
    fromVersion: localVersions?.[e.id],
    size: e.size,
  }));
  const officialCount = rows.filter((r) => r.official).length;
  return {
    mode: "batch",
    entries: rows,
    officialCount,
    thirdPartyCount: rows.length - officialCount,
  };
}
