/**
 * manifestEntry — K5 源解析回落链的末段：**仓库根没有 marketplace.json 时，用 plugin.json 合成 1 条目录**。
 *
 * 正典 = 11 §二「来源回落链」（市场插件侧实现）：
 *   源 URL → 根 marketplace.json？（L1/L2）→ 否则 plugin.json？（L0 单插件，合成一条）→ 否则报错＋模板链接。
 * 本模块只做纯变换（manifest 文本 → CatalogEntry）；拉取与回落判定在 marketSources/load.ts。
 *
 * 🔴 为什么 downloadUrl 是**推出来的**：目录条目装未装态只认绝对 URL，而 plugin.json 不含分发地址。
 *   约定与 `@linkdesk/plugin-sdk` publish 同形（`releaseTagForVersion` = `v<version>`、
 *   `assetNameForId` = `<pluginId>.linkdesk-plugin`）——L0 作者按 SDK 正常 build/publish 即命中；
 *   没有对应 Release 时安装段如实失败（比编一个不存在的直链更诚实）。
 * 🔴 图标只收绝对 URL：包内相对路径（`resources/icon.svg`）在未装态恒 404（`linkdesk://` 只在
 *   本地已装根里找文件）——推不出就不给，UI 落统一默认块。
 */

import { githubOwnerRepoOf } from "./sourceUrl";
import type { CatalogEntry } from "./types";

/** plugin.json 文本 + 源 URL → 单条目录（缺 pluginId/name/version = 不是插件清单，返回 null） */
export function synthesizeEntryFromManifest(text: string, sourceUrl: string): CatalogEntry | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const m = json as Record<string, unknown>;
  // 硬约束 11：插件身份顶层字段 = pluginId；`id` 兜底只为兼容旧形态（derivePluginId 同源语义）
  const id = typeof m.pluginId === "string" && m.pluginId ? m.pluginId : typeof m.id === "string" ? m.id : "";
  const name = typeof m.name === "string" ? m.name : "";
  const version = typeof m.version === "string" ? m.version : "";
  if (!id || !name || !version) return null;

  const repo = githubOwnerRepoOf(sourceUrl);
  const repoHome = repo ? `https://github.com/${repo.owner}/${repo.repo}` : undefined;

  return {
    id,
    name,
    version,
    description: typeof m.description === "string" ? m.description : undefined,
    author: normalizeAuthor(m.author),
    icon: absoluteUrlOrUndefined(m.icon),
    iconSource: typeof m.iconSource === "string" ? (m.iconSource as CatalogEntry["iconSource"]) : undefined,
    marketIcon: absoluteUrlOrUndefined(m.marketIcon),
    marketIconSource:
      typeof m.marketIconSource === "string" ? (m.marketIconSource as CatalogEntry["marketIconSource"]) : undefined,
    category: typeof m.category === "string" ? m.category : undefined,
    categories: Array.isArray(m.categories)
      ? m.categories.filter((c): c is string => typeof c === "string")
      : undefined,
    downloadUrl: repo
      ? `https://github.com/${repo.owner}/${repo.repo}/releases/download/v${version}/${id}.linkdesk-plugin`
      : undefined,
    minAppVersion: typeof m.minAppVersion === "string" ? m.minAppVersion : undefined,
    repository: repoHome,
    sourceName: undefined, // 合并注入
    official: undefined,
  };
}

/** manifest.author 兼容两种形态（文档形态 {name,url} / 旧平铺 string） */
function normalizeAuthor(raw: unknown): CatalogEntry["author"] {
  if (typeof raw === "string") return raw ? { name: raw } : undefined;
  if (typeof raw === "object" && raw !== null) return raw as { name?: string; url?: string };
  return undefined;
}

/** 未装态图标只认绝对 URL（相对路径在目录里恒 404；见文件头注） */
function absoluteUrlOrUndefined(raw: unknown): string | undefined {
  return typeof raw === "string" && /^https?:\/\//i.test(raw.trim()) ? raw.trim() : undefined;
}
