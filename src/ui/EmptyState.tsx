/**
 * EmptyState — 空态的**唯一来源**（蓝图 `emptyView({icon,title,sub,action,cls,attrs})` 的 R4 落位）。
 *
 * 🔴 类名纪律（08 §二·26 教训）：根类 = 语义名 `.marketplace-ui-empty-state`（⛔ 裸 `.empty`——
 *   HTML 曾撞全局空态撑爆瓷片）；修饰类一律带语境前缀（调用方传 `className`，如 `marketplace-store-cat-empty`）。
 *
 * 各页只给参数（icon / 标题 / 说明 / 可选动作 / 跨列修饰），⛔ 不手拼空态。
 */

import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function EmptyState({
  icon,
  title,
  sub,
  action,
  className,
  attrs,
}: {
  icon?: IconName;
  title: string;
  sub?: string;
  /** 可选动作（按钮等）——由调用方给已 t() 的节点 */
  action?: ReactNode;
  /** 跨列/语境修饰类（如 `marketplace-store-cat-empty`） */
  className?: string;
  /** 透传锚点（data-spec 等） */
  attrs?: Record<string, string>;
}) {
  return (
    <div className={`marketplace-ui-empty-state ${className ?? ""}`.trim()} {...attrs}>
      {icon && <Icon name={icon} className="marketplace-ui-empty-icon" />}
      <span className="marketplace-ui-empty-title">{title}</span>
      {sub && <span className="marketplace-ui-empty-sub">{sub}</span>}
      {action}
    </div>
  );
}

export default EmptyState;
