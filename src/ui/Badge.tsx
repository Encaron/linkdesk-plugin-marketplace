/**
 * Badge — 目录徽标的**唯一渲染件**（蓝图 `badge(kind,text)` 的 R4 落位，10 §一「Badge」）。
 *
 * ⚠️ 与 `@linkdesk/ui` 的通用 Badge 分工（判据 A）：
 *   - `@linkdesk/ui` Badge = 壳层通用小胶囊（accent 底色，任何插件可用的形状基础件）；
 *   - 本件 = **目录语义徽标**（来源/付费/安装态十类，色义由市场域定义）——只在本插件商店面消费。
 *   本插件商店内同一种徽标只有这一件；旧详情页仍用共享 Badge 属既有面（棒 9 统一时再收）。
 *
 * 色义照 mockups/03 `.badge.*`：⛔ 一切描边冒充实底（v3.65b）；实底系 price/soon/expired/owned/update，
 * 纯字系 installed/free，来源系 official/third/local/core。
 */

import { useTranslation } from "react-i18next";
import type { BadgeDesc, BadgeKind } from "./statusTag";

const KIND_CLASS: Record<BadgeKind, string> = {
  official: "is-official",
  third: "is-third",
  local: "is-local",
  core: "is-core",
  price: "is-price",
  soon: "is-soon",
  expired: "is-expired",
  owned: "is-owned",
  installed: "is-installed",
  update: "is-update",
  fail: "is-fail",
  muted: "is-muted",
};

export function Badge({ desc, title }: { desc: BadgeDesc; title?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`marketplace-ui-badge ${KIND_CLASS[desc.kind]}`} data-hint={title}>
      {t(desc.key, desc.params)}
    </span>
  );
}

/** 多枚徽标一行（hover 层 / 详情全量）——空数组不占位 */
export function BadgeRow({ badges }: { badges: BadgeDesc[] }) {
  if (!badges.length) return null;
  return (
    <span className="marketplace-ui-badge-row">
      {badges.map((b, i) => (
        <Badge key={`${b.kind}:${b.key}:${i}`} desc={b} />
      ))}
    </span>
  );
}

export default Badge;
