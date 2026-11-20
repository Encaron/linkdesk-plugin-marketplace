/**
 * merge — 多源目录合并去重（同 id 取版本高者，来源身份随胜出条目携带）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketCatalog.ts` 原样搬出，零行为变更。
 *
 * R4-2.2（Marketplace-Store v2）：调用方按**三源合并序**装数组——官方 → 收录（官方目录根
 * `sources[]`）→ 用户配置；本函数按数组顺序处理，版本平手先到者胜 ⇒ 序即优先级。
 * 冲突回执走 `mergeCatalogsWithReceipt`（诊断/来源页用，⛔ 不改变胜出规则）。
 */

import type { CatalogEntry } from "./types";
import { isVersionNewer } from "./semver";

/** 同 id 冲突回执——kept/dropped 都是来源名（owner/repo），来源页诊断用 */
export interface MergeConflict {
  id: string;
  kept: string;
  keptVersion: string;
  dropped: string;
  droppedVersion: string;
}

type CatalogSource = { sourceName: string; sourceUrl?: string; official?: boolean; entries: CatalogEntry[] };

/** 多源合并去重——同 id 取 semver 高者；版本平手用先出现的源（官方排前 → 官方胜出）。
 *  E6#30.8f：来源记录可带 official 标记，胜出条目的来源身份（sourceName + official）随条目携带——UI 读
 *  单一字段即可显示「官方发布」徽标，不把官方身份跟"源 URL 长啥样"耦合回视图层。
 *  E6#71k：连带携带 sourceUrl（同时注入，同一条记录的两个面）——信任门判 http 明文源需要它，
 *  sourceName 对 http/https 同形判不出。 */
export function mergeCatalogs(sources: CatalogSource[]): CatalogEntry[] {
  return mergeCatalogsWithReceipt(sources).entries;
}

/** 合并 + 冲突回执（R4-2.2）——回执只记「同 id 出现过多次」的事实，胜出判据与 `mergeCatalogs` 同一份。 */
export function mergeCatalogsWithReceipt(sources: CatalogSource[]): {
  entries: CatalogEntry[];
  deduped: MergeConflict[];
} {
  const byId = new Map<string, CatalogEntry>();
  const deduped: MergeConflict[] = [];
  for (const src of sources) {
    for (const e of src.entries) {
      const prev = byId.get(e.id);
      const carried: CatalogEntry = { ...e, sourceName: src.sourceName, sourceUrl: src.sourceUrl };
      if (src.official) carried.official = true;
      if (!prev) {
        byId.set(e.id, carried);
        continue;
      }
      const incoming = isVersionNewer(e.version, prev.version);
      if (incoming) {
        byId.set(e.id, carried);
        deduped.push({
          id: e.id,
          kept: src.sourceName,
          keptVersion: e.version,
          dropped: prev.sourceName ?? "",
          droppedVersion: prev.version,
        });
      } else {
        deduped.push({
          id: e.id,
          kept: prev.sourceName ?? "",
          keptVersion: prev.version,
          dropped: src.sourceName,
          droppedVersion: e.version,
        });
      }
    }
  }
  return { entries: [...byId.values()], deduped };
}
