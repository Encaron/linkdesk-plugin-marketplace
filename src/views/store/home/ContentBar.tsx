/**
 * ContentBar — 内容热更新的**提示条**（#12；06 §六 §3/§4 双形态）。
 *
 *   - 常驻条（浏览中内容变了）：⛔ 静默跳动；点「刷新」= 应用最新内容（rail/滚动位/筛选/排序保留）；
 *     点「忽略」= 清本次提示（面板记录保留）。
 *   - 一次性信息行（变更到达时商店不可见 → 下次打开已直接应用）：「内容已更新于 HH:MM」，
 *     可关闭、不阻挡（06 §六 §4）——应用由服务侧完成，这里只告知。
 */

import { useTranslation } from "react-i18next";
import { Icon } from "../../../ui";
import { useStore } from "../StoreContext";

export function ContentBar() {
  const { t } = useTranslation();
  const { contentPending, contentAppliedAt, refreshContent, dismissContent, dismissApplied } = useStore();
  if (contentPending) {
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
  if (contentAppliedAt) {
    return (
      <div className="marketplace-store-content-bar" role="status">
        <Icon name="check" size="sm" />
        <span className="marketplace-store-content-bar-text">
          {t("内容已更新于 {{time}}", { time: contentAppliedAt })}
        </span>
        <button type="button" className="marketplace-store-sbtn" onClick={dismissApplied}>
          {t("关闭")}
        </button>
      </div>
    );
  }
  return null;
}

export default ContentBar;
