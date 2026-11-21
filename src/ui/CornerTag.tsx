/**
 * CornerTag — 单角标（主面右上/行尾的**唯一状态位**；蓝图 v3.65b「两系样式」的 R4 落位）。
 *
 * 两系：实底（paid 蓝 / update 橙 / expired 红 / soon 黄）与纯字（installed / free 灰字无底无框）。
 * 状态由 `statusTag()` 判定——⛔ 本件不自己判状态，只画传入的 `{key, params, kind}`。
 * React 就地改 text/class（节点不换 ⇒ hover 放大不中断；08 §二·单角标状态机）。
 */

import { useTranslation } from "react-i18next";
import type { StatusTag } from "./statusTag";

export function CornerTag({
  tag,
  baseClass,
  className,
  stacked,
}: {
  tag: StatusTag;
  /** 语境基类（如 `marketplace-store-cs-free`）——修饰类由状态 kind 追加 */
  baseClass: string;
  className?: string;
  /** 两行呈现（卡片头部窄位）：模型词 / 金额分开——金额完整显示，⛔ 省略号 */
  stacked?: boolean;
}) {
  const { t } = useTranslation();
  const label = t(tag.key, tag.params);
  if (stacked && tag.modelKey && tag.amount) {
    return (
      <span
        className={`${baseClass} is-${tag.kind} is-stacked ${className ?? ""}`.trim()}
        data-hint={label}
      >
        <span className="marketplace-ui-corner-model">{t(tag.modelKey)}</span>
        <span className="marketplace-ui-corner-amount">{t(tag.amount.key, tag.amount.params)}</span>
      </span>
    );
  }
  return (
    <span className={`${baseClass} is-${tag.kind} ${className ?? ""}`.trim()}>
      {label}
    </span>
  );
}

export default CornerTag;
