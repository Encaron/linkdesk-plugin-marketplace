/**
 * avatarHue — 头像/图标底色的**唯一生成器**（蓝图 `hueBG()` 的 R4 落位，10 §一「头像/图标底色」）。
 *
 * 真机没有蓝图里的作者 `hue` 字段（目录条目只带 icon/marketIcon）——按稳定种子（pluginId/authorId）
 * 从固定色板取一色。同一 id 永远同色（跨重启/跨表面一致），⛔ 各卡各自随机。
 *
 * 颜色是**数据派生值**（等同作者声明的 hue），不是主题令牌；CSS 里仍只经 `--marketplace-hue`
 * 变量消费，不把 hex 写进样式表。
 */

/* eslint-disable linkdesk/no-hardcoded-hex -- 作者色板（数据派生色，等同作者声明的 hue；主题令牌不适用——色随插件身份而非主题） */
import type { CSSProperties } from "react";

/** 12 色板（取蓝图演示色 + 官方主题邻近色；深/浅主题下均保持可读） */
const HUES = [
  "#2563A8",
  "#0E7490",
  "#6B46C1",
  "#B45309",
  "#2F855A",
  "#7C3AED",
  "#0E639C",
  "#B25B1F",
  "#38B2AC",
  "#9B59D0",
  "#DD6B20",
  "#3D6B4F",
] as const;

/** 稳定散列（FNV-1a 32 位）——同一 seed 恒同色；不引入依赖 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 种子 → 色值（pluginId / authorId / repoId 都可当种子） */
export function hueOf(seed: string): string {
  if (!seed) return HUES[0];
  return HUES[hash(seed) % HUES.length];
}

/** 头像底：135° 双档渐变（蓝图 `hueBG` 同形；`C8` = 78% alpha） */
export function hueBG(hue: string): CSSProperties {
  return { background: `linear-gradient(135deg, ${hue}, ${hue}C8)` };
}

/** 封面/大图底：128° 三段渐变（蓝图 `artBG` 同形） */
export function artBG(hue: string): CSSProperties {
  return { background: `linear-gradient(128deg, ${hue} 0%, ${hue}B8 55%, ${hue}70 100%)` };
}

/** 条目种子——优先 pluginId（同一插件各卡同色），没有则退名字 */
export function entryHue(entry: { id?: string; name?: string }): string {
  return hueOf(entry.id || entry.name || "plugin");
}
