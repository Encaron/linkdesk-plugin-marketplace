/**
 * ContentBar — 内容热更新的**常驻条**（R4-3.7 · #12 的 UI 壳；06 §六/08 §三·99）。
 *
 * 分层（棒 15 接完整机制，本棒只落壳）：
 *   - 浏览中内容变了 → 常驻条（⛔ 静默跳动；⛔ 只靠 3 秒 Toast）；
 *   - 点「刷新」= 应用最新内容（rail/滚动位/筛选/排序保留——目录 store 已更新，这里只清标记）；
 *   - 点「忽略」= 清本次提示（面板记录保留 -> 棒 15）。
 */

import { useTranslation } from "react-i18next";
import { Icon } from "../../../ui";
import { useStore } from "../StoreContext";

export function ContentBar() {
  const { t } = useTranslation();
  const { contentPending, refreshContent, dismissContent } = useStore();
  if (!contentPending) return null;
  return (
    <div className="marketplace-store-content-bar" role="status">
      <Icon name="refresh" size="sm" />
      <span className="marketplace-store-content-bar-text">
        {t("首页内容已更新——刷新后显示最新轮播与合集；你的滚动位置、筛选与排序会保留")}
      </span>
      <button type="button" className="marketplace-ui-btn is-primary" onClick={refreshContent}>
        {t("刷新")}
      </button>
      <button type="button" className="marketplace-store-sbtn" onClick={dismissContent}>
        {t("忽略")}
      </button>
    </div>
  );
}

export default ContentBar;
