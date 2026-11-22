/**
 * officialRepo — 官方核心仓的**叶子常量与判据**（无 React / 无 store 依赖）。
 *
 * 为什么单独一条：`sourceOrder` / `authors` / `repoContext` 三方都要用「官方核心仓 id」与
 * 「这是不是官方核心仓」，但 `authors` 是重模块（React + 缓存 + 拉取）——让顺序模型反向
 * import 它会成环。本文件只依赖 `marketCatalog/sourceUrl`，谁都能安全引用。
 *
 * D5（2026-11-22）：唯一不可删/不可停用/锁官方组第一的仓 = 官方源指向的那个目录仓。
 */

import { urlSourceKey } from "@linkdesk/ui";
import { OFFICIAL_SOURCE_URL, githubOwnerRepoOf } from "./marketCatalog";

/** 官方核心仓的仓库 id（由官方源 URL 推出；推不出 = 生态里唯一一个官方目录仓名兜底） */
export const OFFICIAL_CORE_REPO_ID: string =
  githubOwnerRepoOf(OFFICIAL_SOURCE_URL)?.repo ?? "linkdesk-marketplace";

/** 官方作者聚合键（官方目录条目没有 authorId；合成域用这个） */
export const OFFICIAL_AUTHOR_ID = "official";

/** 官方源身份判定（URL owner/repo 形态，分支无关） */
export function isOfficialSourceUrl(url: string | undefined): boolean {
  if (!url) return false;
  const a = urlSourceKey(url);
  const b = urlSourceKey(OFFICIAL_SOURCE_URL);
  return a !== null && a === b;
}

/** 官方核心仓判定（D5：唯一不可删/不可停用/锁组内第一的仓） */
export function isOfficialCoreRepo(authorId: string, repoId: string): boolean {
  return authorId.toLowerCase() === OFFICIAL_AUTHOR_ID && repoId === OFFICIAL_CORE_REPO_ID;
}
