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
}: {
  tag: StatusTag;
  /** 语境基类（如 `marketplace-store-cs-free`）——修饰类由状态 kind 追加 */
  baseClass: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={`${baseClass} is-${tag.kind} ${className ?? ""}`.trim()}>
      {t(tag.key, tag.params)}
    </span>
  );
}

export default CornerTag;
