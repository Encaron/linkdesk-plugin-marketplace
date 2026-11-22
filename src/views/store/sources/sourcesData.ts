/**
 * sourcesData — 来源管理页的**纯推导层**（R4-3.14）：条目按仓库、展示按作者聚合。
 *
 * 语义（09 §二 / 08 §三·113）：
 *   - 一条源 = 一个仓库 URL（`{url, authorId, repoId, enabled, status, fetchedAt}`）；
 *   - 展示按 authorId 聚合成作者组（同作者多仓一行组头 + 逐仓行）；顺序 = 配置数组顺序（作者卡顺序）；
 *   - 本层只归组/算计数，⛔ 不写配置（写路径 = `services/sourceAdmin`）。
 */

import { urlSourceKey } from "@linkdesk/ui";
import type { AuthorDomain } from "../../../services/authors";
import type { CatalogEntry, CatalogWarning } from "../../../services/marketCatalog";
import { normalizeSourceUrl, sourceNameOfUrl } from "../../../services/marketCatalog";
import type { SourceRecord } from "../../../services/marketSources";
import { authorHueOf } from "../authors/authorHue";

export interface SourceRowView {
  record: SourceRecord;
  /** 该源的目录拉取结果（本趟；undefined = 未参与本趟/已停用） */
  status?: "ok" | "error";
  reason?: string;
}

export interface AuthorSourceGroup {
  authorId: string;
  name: string;
  hue: string;
  official: boolean;
  rows: SourceRowView[];
  /** 启用仓数 / 插件数（作者域聚合；停用仓不计插件） */
  repoCount: number;
  pluginCount: number;
  warnings: AuthorDomain["warnings"];
  /** R4-3.18：本组各源条目带来的目录声明警告（含「目录缺抓取字段」）——与作者块警告同处展示 */
  catalogWarnings: CatalogWarning[];
}

function keyOfUrl(url: string): string | null {
  return urlSourceKey(url);
}

/** 分组（remote only；本地条目由调用方单独成组）。
 *  R4-3.18：`catalogWarnings` = 目录 parse 警告（含 missing-entry-field）——按警告的 `source` 落到
 *  对应作者组，与作者块警告并排展示（详情页「不画行」的异常在这里留痕）。 */
export function groupRemoteSources(
  records: readonly SourceRecord[],
  domains: readonly AuthorDomain[],
  sourceStatus: ReadonlyArray<{ url: string; ok: boolean; reason?: string }> | undefined,
  entries: readonly CatalogEntry[] = [],
  catalogWarnings: readonly CatalogWarning[] = [],
): AuthorSourceGroup[] {
  // 聚合键以**条目声明的 authorId** 为准（09 §二身份正典；record.authorId 只是 GitHub owner 兜底）
  const declaredAuthorBySource = new Map<string, string>();
  for (const e of entries) {
    if (e.sourceName && e.authorId) declaredAuthorBySource.set(e.sourceName, e.authorId);
  }
  const domainById = new Map(domains.map((d) => [d.authorId.toLowerCase(), d]));
  const byStatus = new Map<string, { ok: boolean; reason?: string }>();
  for (const s of sourceStatus ?? []) {
    const key = keyOfUrl(s.url);
    if (key) byStatus.set(key, { ok: s.ok, reason: s.reason });
  }

  const groups = new Map<string, AuthorSourceGroup>();
  const order: string[] = [];
  /** 组 → 该组各源的 sourceName（目录警告按它归组） */
  const sourceNamesByGroup = new Map<string, Set<string>>();
  for (const rec of records) {
    if (rec.kind !== "remote" || !rec.url) continue;
    const sourceName = sourceNameOfUrl(normalizeSourceUrl(rec.url) ?? rec.url);
    const id = declaredAuthorBySource.get(sourceName) ?? rec.authorId ?? "—";
    const groupKey = id.toLowerCase();
    let group = groups.get(groupKey);
    if (!group) {
      const domain = domainById.get(groupKey);
      group = {
        authorId: id,
        name: domain?.name ?? id,
        hue: authorHueOf(id),
        official: domain?.official ?? false,
        rows: [],
        repoCount: 0,
        pluginCount: 0,
        warnings: domain?.warnings ?? [],
        catalogWarnings: [],
      };
      groups.set(groupKey, group);
      order.push(groupKey);
      sourceNamesByGroup.set(groupKey, new Set());
    }
    sourceNamesByGroup.get(groupKey)!.add(sourceName);
    const key = keyOfUrl(rec.url);
    const status = key ? byStatus.get(key) : undefined;
    group.rows.push({
      record: rec,
      status: status ? (status.ok ? "ok" : "error") : undefined,
      reason: status?.reason,
    });
  }

  for (const gid of order) {
    const g = groups.get(gid)!;
    const domain = domainById.get(gid);
    g.repoCount = g.rows.filter((r) => r.record.enabled).length;
    g.pluginCount = domain
      ? domain.repos
          .filter((repo) =>
            g.rows.some((row) => row.record.enabled && repo.id === row.record.repoId),
          )
          .reduce((n, repo) => n + repo.plugins.length, 0)
      : 0;
    /* R4-3.18：目录警告按 source 归组（同一警告只留一条——多源同名的重复声明不刷屏） */
    const names = sourceNamesByGroup.get(gid);
    const seen = new Set<string>();
    g.catalogWarnings = names
      ? catalogWarnings.filter((w) => {
          if (!w.source || !names.has(w.source)) return false;
          const key = `${w.code}:${w.entryId ?? ""}:${w.detail ?? ""}:${w.source}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      : [];
  }
  return order.map((id) => groups.get(id)!);
}

/** 相对时刻文案（来源页行「目录拉取 X 分钟前」；调用方给 now 便于测试） */
export function agoText(
  t: (key: string, opts?: Record<string, unknown>) => string,
  at: number | undefined,
  now = Date.now(),
): string {
  if (!at) return t("未拉取");
  const min = Math.max(0, Math.floor((now - at) / 60_000));
  if (min < 1) return t("刚刚");
  if (min < 60) return t("{{count}} 分钟前", { count: min });
  return t("{{count}} 小时前", { count: Math.floor(min / 60) });
}
