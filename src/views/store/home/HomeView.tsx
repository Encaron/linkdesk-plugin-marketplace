/**
 * HomeView — 首页板块流（槽位顺序＝蓝图 03）：hero → 作者卡片区 → 合集槽（声明序）→
 * 热门下载 top8（计算位）→ 按分类浏览。
 *
 * D1（2026-11-22）：主题专区不再硬渲染——官方目录用 `collections[]` 的 mega 槽声明，
 * 「换谁上大屏/横排」只改 JSON；本件只按 `order` 渲染声明。
 *
 * 付费板块（六态陈列/购买流）属棒 10（R4-3.20–3.22）；此处**不渲染**（⛔ 用演示数据占位）。
 * 目录三态由 CatalogGate 统一处理（加载/失败/空），本页只在有目录时渲染。
 */

import { useMemo } from "react";
import { officialCollections } from "../../../services/marketCatalog";
import { useStore } from "../StoreContext";
import { AuthorSection } from "./AuthorSection";
import { CategoryTiles } from "./CategoryTiles";
import { CollectionSection } from "./CollectionSection";
import { Hero } from "./Hero";
import { RankSection } from "./RankSection";

export function HomeView() {
  const { data } = useStore();
  const collections = useMemo(
    () =>
      // 策展位只吃官方目录（09 §三·补3）；作者源合集只进作者店，⛔ 不漏到官方首页
      [...officialCollections(data.catalog.collections)]
        .filter((c) => c.layout !== "banner")
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [data.catalog.collections],
  );

  return (
    <>
      <Hero />
      <AuthorSection />
      {collections.map((c) => (
        <CollectionSection key={c.id} collection={c} />
      ))}
      <RankSection />
      <CategoryTiles />
    </>
  );
}

export default HomeView;
