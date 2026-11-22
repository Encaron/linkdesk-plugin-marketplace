/**
 * mediaModel — 媒体**选帧**的唯一纯函数（17 §3.2；批次 A1）。
 *
 * 唯一数据源 = `CatalogEntry.screenshots[]`（string 图片 / 首位视频对象）＋ `CatalogEntry.cover`。
 * 本件只回答「画什么」：不碰 DOM、不碰状态、不知道卡型——卡型只把结果交给 `Art` 排版。
 * ⛔ 不按插件 id 挑图；⛔ 不替作者挑「最好看的那张」；⛔ 不建第二套媒体字段。
 *
 * 选帧规则（设计定稿）：
 *   1. 封面视频海报 → `cover` → 静帧（按声明顺序）；
 *   2. 去重；上限 `MEDIA_MAX_FRAMES`；
 *   3. 非 https 绝对 URL 不参与渲染（未装用户必 404 / 明文不安全），记 issue 供解析层告警。
 */

import type { CatalogEntry } from "../../../services/marketCatalog";

/** 卡内/首屏轮播帧上限——规则常量，不是图片清单（设计 §3.2；⛔ 按插件写死） */
export const MEDIA_MAX_FRAMES = 3;

export type MediaKind = "video" | "image" | "generated";

/** 媒体声明问题（解析层折算成声明警告；渲染层只做兜底，不弹窗） */
export interface MediaIssue {
  code: "relative-url" | "insecure-url";
  /** 人读字段路径：screenshots[0] / screenshots[2].url / cover / screenshots[0].poster */
  field: string;
  value: string;
}

export interface MediaVideo {
  url: string;
  poster?: string;
}

export interface MediaModel {
  kind: MediaKind;
  /** 静帧（已去重、已截断）——封面帧在前 */
  frames: string[];
  /** 合法封面视频（至多 1 段；越位/多段在 parse 期已裁） */
  video: MediaVideo | null;
  issues: MediaIssue[];
}

/** https 绝对 URL 判据（唯一口径；与 schema/validate 的期望一致） */
export function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(value);
}

function issueOf(value: string, field: string): MediaIssue | null {
  if (isHttpsUrl(value)) return null;
  return { code: /^https?:/i.test(value) ? "insecure-url" : "relative-url", field, value };
}

/**
 * 条目媒体选择——纯函数（同输入同输出）。
 * 坏值不抛出：跳过并记 issue（旧目录/手改目录只降级，不让整店崩）。
 */
export function mediaOf(
  entry: Pick<CatalogEntry, "screenshots"> & { cover?: string },
): MediaModel {
  const issues: MediaIssue[] = [];
  const shots = Array.isArray(entry.screenshots) ? entry.screenshots : [];
  const collect = (value: string, field: string): string | null => {
    const issue = issueOf(value, field);
    if (issue) {
      issues.push(issue);
      return null;
    }
    return value;
  };

  let video: MediaVideo | null = null;
  const stills: string[] = [];
  for (let i = 0; i < shots.length; i++) {
    const item = shots[i];
    if (typeof item === "string") {
      const url = collect(item.trim(), `screenshots[${i}]`);
      if (url) stills.push(url);
      continue;
    }
    if (!item || item.type !== "video" || typeof item.url !== "string") continue;
    // parse 期已保证「至多 1 段且排第一」；这里仍取第一个合法视频（旧/手改目录的防御读）
    if (video) continue;
    const url = collect(item.url.trim(), `screenshots[${i}].url`);
    if (!url) continue;
    const poster =
      typeof item.poster === "string" && item.poster.trim()
        ? collect(item.poster.trim(), `screenshots[${i}].poster`) ?? undefined
        : undefined;
    video = poster ? { url, poster } : { url };
  }

  const cover = typeof entry.cover === "string" && entry.cover.trim()
    ? collect(entry.cover.trim(), "cover")
    : null;

  const frames = [...new Set([video?.poster, cover, ...stills].filter((f): f is string => !!f))]
    .slice(0, MEDIA_MAX_FRAMES);
  const kind: MediaKind = video ? "video" : frames.length > 0 ? "image" : "generated";
  return { kind, frames, video, issues };
}

/** 卡内轮播帧数（`data-frames` 的**唯一来源**）：视频卡卡内只轮静帧，故按 frames 计 */
export function frameCountOf(model: MediaModel): number {
  return model.frames.length;
}
