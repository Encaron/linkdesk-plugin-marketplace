/**
 * Hero — 官方首页英雄横幅（数据源 = `collections[layout:"banner"]`，3~5 张封顶）。
 *
 * 视觉/滚轮/箭头/圆点唯一实现在 `HeroCarousel`（与作者店 hero 共用）；本件只负责选数据。
 * 无 banner 声明 ⇒ 槽 1 空着（不占位不留白）。
 */

import { useMemo } from "react";
import type { CatalogEntry } from "../../../services/marketCatalog";
import { HeroCarousel } from "../HeroCarousel";
import { lt } from "../../../services/i18nText";
import { useStore } from "../StoreContext";

export function Hero() {
  const { data } = useStore();
  const banner = data.catalog.collections.find((c) => c.official === true && c.layout === "banner");
  const slides = useMemo(() => {
    if (!banner) return [];
    const byId = new Map(data.catalog.entries.map((e) => [e.id, e]));
    return banner.items
      .map((id) => byId.get(id))
      .filter((e): e is CatalogEntry => !!e)
      .slice(0, 5)
      .map((entry) => ({ entry, tag: lt(banner, "title") }));
  }, [banner, data.catalog.entries]);

  if (slides.length === 0) return null;
  return (
    <section className="marketplace-store-sec" data-spec="04-6">
      <HeroCarousel slides={slides} />
    </section>
  );
}

export default Hero;
