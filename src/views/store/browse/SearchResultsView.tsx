/**
 * SearchResultsView — 商店搜索页（04 §七 / 08 §三·121）。
 *
 * 与分类页同工具行（归一化）；搜索命中 = 名/ID/标签（蓝图口径）；
 * D1（19 §5.3）：**只搜 currentRepo**——⛔ 全源合并。副题写明当前仓库（用户知道自己在搜哪）。
 * 输入焦点由常驻搜索框保持（StoreHeader 不随页面重绘换节点）；清空回原视图（StoreView 导航层）。
 */

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../ui";
import { OrderedCards } from "./OrderedCards";
import { BrowseToolbar } from "./BrowseToolbar";
import { StickyBar } from "../StickyBar";
import { applyInstallFilters, orderEntries, searchEntries, type CatSort } from "../storeData";
import { useStore } from "../StoreContext";

export function SearchResultsView() {
  const { t } = useTranslation();
  const { data, prefs, filters, route, searchInput } = useStore();
  const query = (route.query ?? searchInput).trim();
  const repoName = data.repo.repo?.name ?? data.repo.name;
  // R4-5.3/I2：命中链 memo 化——500 条目不随无关状态 tick 重排；nodes 身份稳定 ⇒ ChunkedReveal 不误重置
  const hits = useMemo(() => searchEntries(data.repo.entries, query), [data.repo.entries, query]);
  const filtered = useMemo(
    () => applyInstallFilters(hits, filters, data.statusOf),
    [hits, filters, data.statusOf],
  );
  const dlOf = useCallback(
    (entry: { downloadUrl?: string }) => (entry.downloadUrl ? data.counts.get(entry.downloadUrl) : undefined),
    [data.counts],
  );
  const nodes = useMemo(
    () => orderEntries(filtered, prefs.catSort as CatSort, dlOf),
    [filtered, prefs.catSort, dlOf],
  );

  return (
    <>
      <div className="marketplace-store-cat-head" data-spec="04-7-search">
        <div className="marketplace-store-cat-title">{t("搜索")}</div>
        <div className="marketplace-store-cat-sub">
          {t("{{count}} 个结果", { count: hits.length })} · 「{query}」 · {repoName}
        </div>
      </div>
      {hits.length === 0 ? (
        <EmptyState
          icon="search"
          title={t("未找到匹配插件")}
          sub={t("试试更短的关键词，或按分类浏览——搜索只涉及「{{repo}}」", { repo: repoName })}
        />
      ) : (
        <>
          <StickyBar group>
            <BrowseToolbar />
          </StickyBar>
          {filtered.length === 0 ? (
            <EmptyState icon="funnel" title={t("没有符合筛选条件的插件")} sub={t("试着放宽筛选条件")} />
          ) : (
            <OrderedCards nodes={nodes} view={prefs.catView} />
          )}
        </>
      )}
    </>
  );
}

export default SearchResultsView;
