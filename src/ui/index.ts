/**
 * src/ui — 市场商店的 UI 原语件（R4-3.1–3.3）**唯一入口**。
 *
 * 纪律（10 §一）：同一种角色只此一件——页面只组装，⛔ 自拼 seg/chips/空态/badge/动作钮/⋯菜单。
 * 依赖方向：`views → ui → services`；本夹不 import 任何 view，也不碰 window.linkdesk。
 */

export { Icon, type IconName } from "./icons";
export { hueOf, hueBG, entryHue } from "./avatarHue";
export {
  statusTag,
  allBadges,
  licenseBadges,
  licenseBadgeOf,
  sourceBadge,
  sourceKind,
  isPaid,
  licenseDaysLeft,
  type BadgeDesc,
  type BadgeKind,
  type CornerKind,
  type LicenseView,
  type StatusContext,
  type StatusTag,
} from "./statusTag";
export { Badge, BadgeRow } from "./Badge";
export { CornerTag } from "./CornerTag";
export { ViewSeg, type ViewMode } from "./ViewSeg";
export { SortSelect, SORT_SETS, sortOptionsOf, type SortContext, type SortOption } from "./SortSelect";
export { EmptyState } from "./EmptyState";
export { ChunkedReveal, CHUNK_SIZE_DEFAULT } from "./ChunkedReveal";
export {
  ActionButton,
  resolveAction,
  moreMenuItems,
  restatesState,
  type ActionContext,
  type ActionId,
  type MoreItem,
  type ResolvedAction,
} from "./ActionButton";
export { MoreMenu } from "./MoreMenu";
