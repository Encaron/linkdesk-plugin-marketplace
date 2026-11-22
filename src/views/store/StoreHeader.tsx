/**
 * StoreHeader — 商店页头（标题/搜索/检查更新/刷新内容/添加源）。
 *
 * 搜索框**常驻**（商店内一切页面可达；键入即搜索、清空回原视图、焦点保持——因为输入框不随页面重绘
 * 换节点）；「/」聚焦由 StoreView 绑。
 */

import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../ui";
import { useAuthorDomain } from "../../services/authors";
import { useStore } from "./StoreContext";
import { StickyBar } from "./StickyBar";
import { CatalogNote } from "./home/CatalogState";

export function StoreHeader({ searchRef }: { searchRef: RefObject<HTMLInputElement> }) {
  const { t } = useTranslation();
  const { data, route, searchInput, setSearchInput, clearSearch, checkUpdates, refreshContent, addSource } =
    useStore();
  // 作者店不提供「添加源」入口（蓝图 head(..., canAdd=false)：店内不出现第四方/外部动作）
  const canAdd = route.page !== "author";
  // 店名作者自定（09 §二 storeTitle；缺省「〈作者名〉的 Plugin Store」）——作者店头随域换
  const { domain } = useAuthorDomain(
    route.page === "author" ? (route.authorId ?? "") : "",
    data.catalog.entries.length,
  );
  // D1（19 §2.1）：首页/分类/搜索/排行的头部 = **当前仓库**的 storeTitle（官方市场可显示 Plugin Store）
  const repoName = data.repo.repo?.name ?? data.repo.name;
  const authorName = data.repo.domain?.name ?? data.repo.authorId;
  const title =
    route.page === "author"
      ? (domain?.storeTitle ?? (domain ? t("{{name}} 的 Plugin Store", { name: domain.name }) : t("作者主页")))
      : data.repo.core
        ? "Plugin Store"
        : (data.repo.storeTitle ?? repoName);
  const sub =
    route.page === "author"
      ? (domain?.intro ?? t("第三方作者店"))
      : t("{{author}} · {{repo}} · {{count}} 个插件", {
          author: authorName,
          repo: repoName,
          count: data.repo.entries.length,
        });
  const updateCount = data.updateCount;
  return (
    <StickyBar placement="head" className="marketplace-store-head">
      <div className="marketplace-store-head-title">
        <h1>{title}</h1>
        <div className="marketplace-store-head-sub">{sub}</div>
      </div>
      <div className="marketplace-store-head-acts">
        <div className="marketplace-store-search">
          <Icon name="search" size="sm" />
          <input
            ref={searchRef}
            type="text"
            value={searchInput}
            placeholder={t("搜索「{{repo}}」中的插件…", { repo: repoName })}
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
        <CatalogNote />
        <button
          type="button"
          className="marketplace-store-head-check"
          data-hint={t("检查所有插件的更新")}
          onClick={checkUpdates}
        >
          <Icon name="refresh" size="sm" />
          <span className="marketplace-store-head-check-t">{t("检查更新")}</span>
          {updateCount > 0 && <span className="marketplace-store-head-count">{updateCount}</span>}
        </button>
        <button
          type="button"
          className="marketplace-store-head-check"
          data-hint={t("重新拉取目录内容（首页/合集/顺序）——不影响插件版本")}
          onClick={refreshContent}
        >
          <Icon name="refresh" size="sm" />
          <span className="marketplace-store-head-check-t">{t("刷新内容")}</span>
        </button>
        {canAdd && (
          <button
            type="button"
            className="marketplace-store-head-add"
            aria-label={t("添加市场源")}
            data-hint={t("添加市场源（粘贴 GitHub 仓库地址或 marketplace.json 直链）")}
            onClick={addSource}
          >
            <Icon name="plus" size="sm" />
          </button>
        )}
      </div>
    </StickyBar>
  );
}

export default StoreHeader;
