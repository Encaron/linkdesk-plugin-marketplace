/**
 * CategoryTiles — 首页「按分类浏览」瓷片区（只列**有货**分类；空分类不出瓷片，两店同规——04 §七）。
 *
 * 顺序走 `groupByPrimaryCategory(entries, railOrder)`（声明序，other 恒末位）；计数同源。
 */

import { useTranslation } from "react-i18next";
import { groupByPrimaryCategory } from "../../../services/marketCatalog";
import { localizeCategory } from "../../../services/marketCategories";
import { CategoryTile } from "../cards/CategoryTile";
import { categoryIcon } from "../categoryIcon";
import { CATEGORY_DESC } from "../storeData";
import { useStore } from "../StoreContext";
import { SectionHead } from "./SectionHead";

export function CategoryTiles() {
  const { t } = useTranslation();
  const { data, navigate } = useStore();
  const buckets = groupByPrimaryCategory(data.catalog.entries, data.catalog.railOrder);
  if (buckets.length === 0) return null;
  return (
    <section className="marketplace-store-sec" data-spec="04-7">
      <SectionHead
        title={t("按分类浏览")}
        hint={t("只列出有插件的分类——官方店与作者店同一规则（空分类不出瓷片）")}
      />
      <div className="marketplace-store-tiles">
        {buckets.map(({ slug, entries }) => {
          const desc = CATEGORY_DESC[slug];
          return (
            <CategoryTile
              key={slug}
              slug={slug}
              label={localizeCategory((key) => t(key), slug)}
              count={entries.length}
              desc={desc ? t(desc) : undefined}
              icon={categoryIcon(slug)}
              onOpen={(s) =>
                navigate({
                  page: "category",
                  category: s,
                  authorId: data.repo.authorId,
                  repoId: data.repo.repoId,
                })
              }
            />
          );
        })}
      </div>
    </section>
  );
}

export default CategoryTiles;
