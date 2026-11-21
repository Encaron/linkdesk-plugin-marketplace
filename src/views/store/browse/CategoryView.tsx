/**
 * CategoryView — 分类页（统一池＋页头＋排序/视图工具行＋小类 chips；04 §七 / 08 §三·120）。
 *
 * 纪律：
 *   - 主分类归桶与「其他」兜底 = `primaryCategoryOf`（⛔ categories[0]）；
 *   - 小类 chips = **封闭名单有货即显（≥1）**＋「未标注小类」兜底（04 §5.1 二次拍板）；
 *   - chip 再点一次＝取消过滤回全量（保排序/视图——U5 修复）；
 *   - 排序/视图跨分类记忆（uiPrefs）；筛选可叠加（install filters）。
 */

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../ui";
import { useAuthorDomain } from "../../../services/authors";
import { localizeCategory } from "../../../services/marketCategories";
import { OrderedCards } from "./OrderedCards";
import { BrowseToolbar } from "./BrowseToolbar";
import { StickyBar } from "../StickyBar";
import { primaryCategoryOf } from "../../../services/marketCatalog";
import {
  applyInstallFilters,
  applySubcategory,
  CATEGORY_DESC,
  chipsOf,
  orderEntries,
  untaggedCountOf,
  type CatSort,
} from "../storeData";
import { useStore } from "../StoreContext";

export function CategoryView({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { data, prefs, filters, subChip, setSubChip, keepScroll, route, navigate } = useStore();
  const label = localizeCategory((key) => t(key), slug);
  const descKey = CATEGORY_DESC[slug];
  // 页主范围（2026-11-22 用户归一化拍板）：官方店 = official 源预过滤，作者店 = authorId 预过滤；
  // 两者都是「谁的页面只看谁的」；rail 重入（无范围）即全量。
  const officialOnly = route.page === "category" && route.official === true;
  const authorId = !officialOnly && route.page === "category" ? route.authorId : undefined;
  const { domain: authorDomain, loading: authorLoading } = useAuthorDomain(
    authorId ?? "",
    data.catalog.entries.length,
  );
  // R4-5.3/I2：归桶→筛选→排序链 memo 化（500 条目不随无关 tick 重排；nodes 身份稳定 ⇒ ChunkedReveal 不误重置）
  const allOfCategory = useMemo(
    () => data.catalog.entries.filter((e) => primaryCategoryOf(e) === slug),
    [data.catalog.entries, slug],
  );
  const officialEntries = useMemo(
    () => allOfCategory.filter((e) => e.official === true),
    [allOfCategory],
  );
  const authorEntries = useMemo(
    () =>
      authorDomain
        ? [...new Map(authorDomain.repos.flatMap((r) => r.plugins).map((e) => [e.id, e])).values()]
        : [],
    [authorDomain],
  );
  const bucket = useMemo(
    () =>
      officialOnly
        ? officialEntries
        : authorId
          ? authorEntries.filter((e) => primaryCategoryOf(e) === slug)
          : allOfCategory,
    [officialOnly, officialEntries, authorId, authorEntries, allOfCategory, slug],
  );
  const scoped = officialOnly || !!authorId;
  const scopedName = officialOnly ? t("官方 Plugin Store") : authorDomain?.name;
  const filtered = useMemo(
    () => applyInstallFilters(bucket, filters, data.statusOf),
    [bucket, filters, data.statusOf],
  );
  const shown = useMemo(
    () => (subChip ? applySubcategory(filtered, subChip, slug) : filtered),
    [filtered, subChip, slug],
  );
  const dlOf = useCallback(
    (entry: { downloadUrl?: string }) => (entry.downloadUrl ? data.counts.get(entry.downloadUrl) : undefined),
    [data.counts],
  );
  const nodes = useMemo(
    () => orderEntries(shown, prefs.catSort as CatSort, dlOf),
    [shown, prefs.catSort, dlOf],
  );
  const chips = chipsOf(bucket, slug);
  const untagged = untaggedCountOf(bucket, slug);

  if (authorId && authorLoading) {
    return (
      <div className="marketplace-store-state-card" role="status">
        <span className="marketplace-ui-spin" aria-hidden="true" />
        <div>
          <b>{t("正在加载该作者的插件…")}</b>
          <span>{t("读取作者域后按分类预过滤")}</span>
        </div>
      </div>
    );
  }
  if (authorId && authorDomain && authorEntries.length === 0) {
    // 作者块还没有可展示的插件（空仓/空源）——诚实空态＋逃生门常驻
    return (
      <>
        <div className="marketplace-store-cat-head" data-spec="04-7-category">
          <div className="marketplace-store-cat-title">{label}</div>
          <div className="marketplace-store-cat-sub">
            {t("{{name}} · {{count}} 个插件", { name: authorDomain.name, count: 0 })}
          </div>
        </div>
        <div className="marketplace-store-filterbar">
          <span className="marketplace-store-tb-label">{t("已过滤")}</span>
          <span className="marketplace-store-filter-chip">
            {authorDomain.name} · 0
            <button
              type="button"
              className="marketplace-store-filter-x"
              aria-label={t("清除过滤")}
              onClick={() => navigate({ page: "category", category: slug })}
            >
              ✕
            </button>
          </span>
          <button
            type="button"
            className="marketplace-ui-chip"
            onClick={() => navigate({ page: "category", category: slug })}
          >
            {t("显示全部")}
          </button>
        </div>
        <EmptyState
          icon="dots"
          title={t("「{{name}}」在「{{category}}」下暂无插件", {
            name: authorDomain.name,
            category: label,
          })}
          sub={t("点上方「显示全部」查看该分类全部插件——逃生门常驻不锁")}
        />
      </>
    );
  }
  if (bucket.length === 0) {
    return (
      <>
        <div className="marketplace-store-cat-head" data-spec="04-7-category">
          <div className="marketplace-store-cat-title">{label}</div>
          <div className="marketplace-store-cat-sub">
            {t("{{count}} 个插件", { count: 0 })} · {descKey ? t(descKey) : ""}
          </div>
        </div>
        {scoped && scopedName && (
          <div className="marketplace-store-filterbar">
            <span className="marketplace-store-tb-label">{t("已过滤")}</span>
            <span className="marketplace-store-filter-chip">
              {scopedName} · 0
              <button
                type="button"
                className="marketplace-store-filter-x"
                aria-label={t("清除过滤")}
                onClick={() => navigate({ page: "category", category: slug })}
              >
                ✕
              </button>
            </span>
            <button
              type="button"
              className="marketplace-ui-chip"
              onClick={() => navigate({ page: "category", category: slug })}
            >
              {t("显示全部")}
            </button>
          </div>
        )}
        <EmptyState
          icon="dots"
          title={
            scoped && scopedName
              ? t("「{{name}}」在「{{category}}」下暂无插件", { name: scopedName, category: label })
              : t("「{{name}}」暂无插件", { name: label })
          }
          sub={
            scoped
              ? t("点上方「显示全部」查看该分类全部插件——逃生门常驻不锁")
              : t("这个分类还没有插件")
          }
        />
      </>
    );
  }

  // filtered/shown/nodes 已在顶部 memo 化（R4-5.3/I2）——此处只取用
  const chipRowVisible = chips.length > 0 || untagged > 0;

  return (
    <>
      <div className="marketplace-store-cat-head" data-spec="04-7-category">
        <div className="marketplace-store-cat-title">{label}</div>
        <div className="marketplace-store-cat-sub">
          {t("{{count}} 个插件", { count: shown.length })}
          {scoped ? `（${t("全分类 {{count}}", { count: allOfCategory.length })}）` : ""} ·{" "}
          {descKey ? t(descKey) : ""}
        </div>
      </div>
      <StickyBar group>
        {scoped && scopedName && (officialOnly || authorDomain) && (
          <div className="marketplace-store-filterbar">
            <span className="marketplace-store-tb-label">{t("已过滤")}</span>
            <span className="marketplace-store-filter-chip">
              {scopedName} · {bucket.length}
              <button
                type="button"
                className="marketplace-store-filter-x"
                aria-label={t("清除过滤")}
                onClick={() => navigate({ page: "category", category: slug })}
              >
                ✕
              </button>
            </span>
            <button
              type="button"
              className="marketplace-ui-chip"
              onClick={() => navigate({ page: "category", category: slug })}
            >
              {t("显示全部")}
            </button>
          </div>
        )}
        <BrowseToolbar />
        {chipRowVisible && (
          <div className="marketplace-store-chiprow">
            {chips.map((chip) => (
              <button
                type="button"
                key={chip}
                className={`marketplace-ui-chip ${subChip === chip ? "is-on" : ""}`}
                onClick={() => keepScroll(() => setSubChip(subChip === chip ? null : chip))}
              >
                {t(`tag.${chip}` as string)}
              </button>
            ))}
            {untagged > 0 && (
              <button
                type="button"
                className={`marketplace-ui-chip ${subChip === "__none" ? "is-on" : ""}`}
                data-hint={t("只声明了大类、没有声明小类的插件——不强行归类")}
                onClick={() => keepScroll(() => setSubChip(subChip === "__none" ? null : "__none"))}
              >
                {t("未标注小类 · {{count}}", { count: untagged })}
              </button>
            )}
            <span className="marketplace-store-chip-hint">{t("小类有货即显（≥1）")}</span>
          </div>
        )}
      </StickyBar>
      {filtered.length === 0 ? (
        <EmptyState
          icon="funnel"
          title={t("没有符合筛选条件的插件")}
          sub={t("试着放宽筛选，或点排序旁的「筛选」清除条件")}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="funnel"
          title={subChip === "__none" ? t("该分类下没有未标注的插件") : t("该标签下暂无插件")}
          sub={t("再点一次该 chip 可取消过滤")}
          className="marketplace-store-cat-empty"
        />
      ) : (
        <OrderedCards nodes={nodes} view={prefs.catView} />
      )}
    </>
  );
}

export default CategoryView;
