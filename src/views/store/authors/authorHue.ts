/**
 * authorHueOf —— 作者色相的**唯一来源**（2026-11-23 用户实机）。
 *
 * 问题：此前每个渲染点各自 `hueOf(authorId)` 哈希——`hueOf("official")` 恰好落在蓝色，
 * 于是官方作者的光环/底纹永远是蓝的，换头像也不会变。
 *
 * 现在：
 *   - **有头像** ⇒ 用图片主色（`useAvatarSrc().hue`，见 services/avatarCache.ts）；
 *   - **没头像** ⇒ 官方 = 品牌橙（与市场图标同色），其余 = 哈希色相。
 * 本函数只负责「没图时的回落」，有图时的色由调用方优先使用 hook 返回的 hue。
 */

import { hueOf } from "../../../ui";
import { OFFICIAL_AUTHOR_ID } from "../../../services/authors";

/** 官方作者回落色 = 市场品牌橙（与 shopping-bag 图标同族） */
// eslint-disable-next-line linkdesk/no-hardcoded-hex -- 品牌身份数据（与 icon-brand.svg 同色），不是主题皮肤色；不随主题变
export const BRAND_AUTHOR_HUE = "#FB923C";

export function authorHueOf(authorId: string): string {
  return authorId.toLowerCase() === OFFICIAL_AUTHOR_ID ? BRAND_AUTHOR_HUE : hueOf(authorId);
}
