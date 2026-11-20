/**
 * StoreHeader — 商店页头（标题/搜索/检查更新/刷新内容/添加源）。
 *
 * 搜索框**常驻**（商店内一切页面可达；键入即搜索、清空回原视图、焦点保持——因为输入框不随页面重绘
 * 换节点）；「/」聚焦由 StoreView 绑。
 */

import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../ui";
import { useStore } from "./StoreContext";

export function StoreHeader({ searchRef }: { searchRef: RefObject<HTMLInputElement> }) {
  const { t } = useTranslation();
  const { data, searchInput, setSearchInput, clearSearch, checkUpdates, refreshContent, addSource } = useStore();
  const updateCount = data.updateCount;
  return (
    <div className="marketplace-store-head">
      <div className="marketplace-store-head-title">
        <h1>Plugin Store</h1>
        <div className="marketplace-store-head-sub">{t("发现、安装和管理插件")}</div>
      </div>
      <div className="marketplace-store-head-acts">
        <div className="marketplace-store-search">
          <Icon name="search" size="sm" />
          <input
            ref={searchRef}
            type="text"
            value={searchInput}
            placeholder={t("搜索名称、ID 或标签…")}
            aria-label={t("搜索插件")}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                clearSearch();
                searchRef.current?.blur();
              }
            }}
          />
          {searchInput && (
            <button
              type="button"
              className="marketplace-store-search-clear"
              aria-label={t("清除搜索")}
              data-hint={t("清除搜索")}
              onClick={() => {
                clearSearch();
                searchRef.current?.focus();
              }}
            >
              <Icon name="x" size="sm" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="marketplace-store-head-check"
          data-hint={t("检查所有插件的更新")}
          onClick={checkUpdates}
        >
          <Icon name="refresh" size="sm" />
          {t("检查更新")}
          {updateCount > 0 && <span className="marketplace-store-head-count">{updateCount}</span>}
        </button>
        <button
          type="button"
          className="marketplace-store-head-check"
          data-hint={t("重新拉取目录内容（首页/合集/顺序）——不影响插件版本")}
          onClick={refreshContent}
        >
          <Icon name="refresh" size="sm" />
          {t("刷新内容")}
        </button>
        <button
          type="button"
          className="marketplace-store-head-add"
          aria-label={t("添加市场源")}
          data-hint={t("添加市场源（粘贴 GitHub 仓库地址或 marketplace.json 直链）")}
          onClick={addSource}
        >
          <Icon name="plus" size="sm" />
        </button>
      </div>
    </div>
  );
}

export default StoreHeader;
