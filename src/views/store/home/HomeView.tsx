/**
 * HomeView — 首页板块流（槽位顺序＝蓝图 03）：hero → 作者卡片区 → 合集槽（声明序）→
 * 主题专区（计算位：themes 分类）→ 热门下载 top8（计算位）→ 按分类浏览。
 *
 * 付费板块（六态陈列/购买流）属棒 10（R4-3.20–3.22）；此处**不渲染**（⛔ 用演示数据占位）。
 * 目录三态由 CatalogGate 统一处理（加载/失败/空），本页只在有目录时渲染。
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogEntry } from "../../../services/marketCatalog";
import { officialCollections, primaryCategoryOf } from "../../../services/marketCatalog";
import { CardMega } from "../cards/CardMega";
import { useStore } from "../StoreContext";
import { Strip } from "../Strip";
import { AuthorSection } from "./AuthorSection";
import { CategoryTiles } from "./CategoryTiles";
import { CollectionSection } from "./CollectionSection";
import { Hero } from "./Hero";
import { RankSection } from "./RankSection";
import { SectionHead } from "./SectionHead";

export function HomeView() {
  const { t } = useTranslation();
  const { data, actions, navigate } = useStore();
  const collections = useMemo(
    () =>
      // 策展位只吃官方目录（09 §三·补3）；作者源合集只进作者店，⛔ 不漏到官方首页
      [...officialCollections(data.catalog.collections)]
        .filter((c) => c.layout !== "banner")
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [data.catalog.collections],
  );
  // 主题专区同为官方策展位：只列官方源主题（全量主题走「全部主题」分类页）
  const themes = data.catalog.entries.filter(
    (e) => e.official === true && primaryCategoryOf(e) === "themes",
  );

  return (
    <>
      <Hero />
      <AuthorSection />
      {collections.map((c) => (
        <CollectionSection key={c.id} collection={c} />
      ))}
      {themes.length > 0 && (
        <section className="marketplace-store-sec" data-spec="04-6">
          <SectionHead
            title={t("主题专区")}
            hint={t("一套配方换一个心情")}
            more={{ label: t("全部主题"), onClick: () => navigate({ page: "category", category: "themes", official: true }) }}
          />
          <Strip variant="mega" ariaLabel={t("主题专区")}>
            {themes.map((entry: CatalogEntry) => (
              <CardMega key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
            ))}
          </Strip>
        </section>
      )}
      <RankSection />
      <CategoryTiles />
    </>
  );
}

export default HomeView;
