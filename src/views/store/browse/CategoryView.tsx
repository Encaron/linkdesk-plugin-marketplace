/**
 * CategoryView — 分类页（统一池＋页头＋排序/视图工具行＋小类 chips；04 §七 / 08 §三·120）。
 *
 * 纪律：
 *   - 主分类归桶与「其他」兜底 = `primaryCategoryOf`（⛔ categories[0]）；
 *   - 小类 chips = **封闭名单有货即显（≥1）**＋「未标注小类」兜底（04 §5.1 二次拍板）；
 *   - chip 再点一次＝取消过滤回全量（保排序/视图——U5 修复）；
 *   - 排序/视图跨分类记忆（uiPrefs）；筛选可叠加（install filters）。
 */

import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../ui";
import { localizeCategory } from "../../../services/marketCategories";
import { OrderedCards } from "./OrderedCards";
import { BrowseToolbar } from "./BrowseToolbar";
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
  const { data, prefs, filters, subChip, setSubChip, keepScroll } = useStore();
  const label = localizeCategory((key) => t(key), slug);
  const descKey = CATEGORY_DESC[slug];
  const bucket = data.catalog.entries.filter((e) => primaryCategoryOf(e) === slug);
  const chips = chipsOf(bucket, slug);
  const untagged = untaggedCountOf(bucket, slug);
  const dlOf = (entry: { downloadUrl?: string }) =>
    entry.downloadUrl ? data.counts.get(entry.downloadUrl) : undefined;

  if (bucket.length === 0) {
    return (
      <>
        <div className="marketplace-store-cat-head" data-spec="04-7-category">
          <div className="marketplace-store-cat-title">{label}</div>
          <div className="marketplace-store-cat-sub">
            {t("{{count}} 个插件", { count: 0 })} · {descKey ? t(descKey) : ""}
          </div>
        </div>
        <EmptyState
          icon="dots"
          title={t("「{{name}}」暂无插件", { name: label })}
          sub={t("空抽屉在 rail 灰显；点入显示诚实空态——不伪装、不报错")}
        />
      </>
    );
  }

  const filtered = applyInstallFilters(bucket, filters, data.statusOf);
  const shown = subChip ? applySubcategory(filtered, subChip, slug) : filtered;
  const nodes = orderEntries(shown, prefs.catSort as CatSort, dlOf);
  const chipRowVisible = chips.length > 0 || untagged > 0;

  return (
    <>
      <div className="marketplace-store-cat-head" data-spec="04-7-category">
        <div className="marketplace-store-cat-title">{label}</div>
        <div className="marketplace-store-cat-sub">
          {t("{{count}} 个插件", { count: shown.length })} · {descKey ? t(descKey) : ""} ·{" "}
          {t("官方与第三方统一混排（单一统一池）")}
        </div>
      </div>
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
