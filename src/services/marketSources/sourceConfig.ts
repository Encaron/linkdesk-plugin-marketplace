/**
 * sourceConfig — 从配置里读出「本次要拉哪些源」（官方恒在 + 作者源，按身份去重）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketSources.ts` 原样搬出，零行为变更。
 *
 * R4-2.1（#10 源记录形态升级）：配置值形状 `string → {kind,url,path,authorId,repoId,enabled,status,fetchedAt}[]`。
 * **本棒只升级读侧**——旧 `string` 与 `{url}` 两形态照读、行为零差异；写侧（来源管理页落盘）属棒 8。
 * 停用（`enabled:false`）的 remote 记录不参与拉取，但仍保留在记录列里供来源页展示。
 */

import { OFFICIAL_SOURCE_URL, githubOwnerRepoOf, normalizeSourceUrl } from "../marketCatalog";
import { urlSourceKey } from "@linkdesk/ui"; // E6#30c：URL 源身份（owner/repo、分支无关）——@linkdesk/ui 共享单一实现（设置行内判重同此钥匙）
import type { SourceRecord } from "./types";

/** 源记录配置键——真相源 = 本仓 plugin.json contributes.configuration 同名键 */
const CONFIG_KEY = "marketplace.marketplaceSources";

/** 本地记录的 authorId 固定值（09 §十：本地条目无作者身份，进统一池但不产生作者卡） */
export const LOCAL_AUTHOR_ID = "__local";

/** 单条配置值 → 源记录（旧 string / {url} / 全记录三形态归一；认不出返回 null）。
 *  ⚠️ 只归一形状、不改身份：URL 原样保留（新增源时原样回写、只此一份落盘的既有纪律不变）。 */
export function normalizeSourceRecord(raw: unknown): SourceRecord | null {
  if (typeof raw === "string") {
    const url = raw.trim();
    if (!url) return null;
    const ids = githubOwnerRepoOf(url);
    return {
      kind: "remote",
      url,
      authorId: ids?.owner ?? "",
      repoId: ids?.repo ?? "",
      enabled: true,
      status: "unknown",
    };
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<SourceRecord> & { url?: unknown; path?: unknown };
  const url = typeof r.url === "string" && r.url.trim() ? r.url.trim() : undefined;
  const path = typeof r.path === "string" && r.path.trim() ? r.path.trim() : undefined;
  if (!url && !path) return null;
  const kind = r.kind === "local" || r.kind === "remote" ? r.kind : url ? "remote" : "local";
  const ids = kind === "remote" && url ? githubOwnerRepoOf(url) : null;
  const authorId =
    typeof r.authorId === "string" && r.authorId
      ? r.authorId
      : (ids?.owner ?? (kind === "local" ? LOCAL_AUTHOR_ID : ""));
  const repoId =
    typeof r.repoId === "string" && r.repoId
      ? r.repoId
      : (ids?.repo ?? (kind === "local" && path ? path.split(/[\\/]/).filter(Boolean).pop() ?? "" : ""));
  return {
    kind,
    url: kind === "remote" ? url : undefined,
    path: kind === "local" ? path : undefined,
    authorId,
    repoId,
    enabled: r.enabled !== false,
    status: r.status === "ok" || r.status === "error" ? r.status : "unknown",
    fetchedAt: typeof r.fetchedAt === "number" ? r.fetchedAt : undefined,
  };
}

/** 读配置源记录（全部形态归一、排除官方身份、同身份去重保序）——来源页/拉取编排共用唯一读取口 */
export async function readSourceRecords(): Promise<SourceRecord[]> {
  let raw: unknown;
  try {
    raw = await window.linkdesk?.configuration?.get<unknown>(CONFIG_KEY);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const officialKey = urlSourceKey(OFFICIAL_SOURCE_URL);
  const seen = new Set<string>();
  const out: SourceRecord[] = [];
  for (const it of raw) {
    const rec = normalizeSourceRecord(it);
    if (!rec) continue;
    const key = rec.url ? urlSourceKey(rec.url) : null;
    if (key && (officialKey !== null && key === officialKey)) continue; // 官方残留（历史污染）滤除
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(rec);
  }
  return out;
}

/** 官方源恒在 + 配置 marketplace.marketplaceSources 作者源（URL-string / {url} / 源记录三形态兼容归一）
 *  ——去重，官方排前；`enabled:false` 的源不拉取（源级停用）。
 *  官方/去重判别走 urlSourceKey（owner/repo 身份、分支无关）——仓库主页形态的官方（归一成 HEAD）与官方
 *  main 直链是同一源，精确串比较会漏判导致官方被二次拉取（E6#30c 实测）。 */
export async function getSourceUrls(): Promise<string[]> {
  const officialKey = urlSourceKey(OFFICIAL_SOURCE_URL);
  const urls: string[] = [OFFICIAL_SOURCE_URL];
  const seen = new Set<string>(officialKey ? [officialKey] : []);
  for (const rec of await readSourceRecords()) {
    if (rec.kind !== "remote" || !rec.enabled || !rec.url) continue;
    const norm = normalizeSourceUrl(rec.url);
    const key = norm ? urlSourceKey(norm) : null;
    if (!norm || !key || seen.has(key)) continue;
    seen.add(key);
    urls.push(norm);
  }
  return urls;
}

/** 读配置作者源（原始 URL 串、排除官方项、按身份去重）——marketplace 弹窗/设置行读当前列表用。
 *  config.get 返回 effective（无 override 时 = default [官方源]）——官方恒不入存盘（读侧 getSourceUrls 前置），
 *  故此处按 owner/repo 身份滤官方（任何形态：main/HEAD 直链、仓库主页）；残留（历史污染）在此滤除，
 *  且 SearchView 下次弹窗添加时 current 不带残留 → 重写配置自动清污。返回用户粘的原始形态（仓库主页 URL
 *  保持原样），新增时原样回写、只此一份落盘。 */
export async function readConfiguredAuthorSources(): Promise<string[]> {
  const records = await readSourceRecords();
  return records.filter((r) => r.kind === "remote" && !!r.url).map((r) => r.url as string);
}
