/**
 * CollectionRenderer — **合集槽的唯一渲染器**（官方首页＋作者店共用）。
 *
 * 为什么抽出来（2026-11-22 用户追问「作者主页会不会再遇到同型 bug」）：此前官方 `CollectionSection`
 * 与作者店 `CollectionBlock` 各写一份 layout 分发（duo/grid/small，作者店还多 mega/more/glow）——
 * Hero 已经是两份实现出过「官方正常、作者店坏」的事故，合集不能重演。
 *
 * 数据差异留给调用方：
 *   - 官方：items 从 `catalog.entries` 解析，无 section/more；
 *   - 作者店：items 从 `repo.plugins` 解析，`section.layout` 可覆盖、`more` 由 caller 解析。
 * 本件只负责「一份 layout → 一张卡型表」＋ SectionHead/noGlow。
 */

import type { CatalogEntry, CollectionDecl } from "../../services/marketCatalog";
import type { AuthorSectionDecl } from "../../services/authors";
import { CardDuo } from "./cards/CardDuo";
import { CardGrid } from "./cards/CardGrid";
import { CardMega } from "./cards/CardMega";
import { CardSmall } from "./cards/CardSmall";
import { CardWall } from "./cards/variants/CardWall";
import { collectionLayoutOf } from "./collectionLayout";
import { SectionHead } from "./home/SectionHead";
import { Strip } from "./Strip";
import { useStore } from "./StoreContext";

export interface CollectionRendererProps {
  collection: CollectionDecl;
  items: CatalogEntry[];
  /** 作者店板块覆盖（layout/more/glow）；官方首页不传 */
  section?: AuthorSectionDecl;
  /** 已解析的跳转字（官方首页不传） */
  more?: { label: string; onClick: () => void } | null;
}

export function CollectionRenderer({ collection, items, section, more }: CollectionRendererProps) {
  const { data, actions } = useStore();
  const layout = collectionLayoutOf(collection, section);
  if (layout === "banner" || items.length === 0) return null; // banner 归 Hero 槽，不在合集区重复
  const noGlow = section?.glow === false || collection.glow === false;

  return (
    <section className={`marketplace-store-sec ${noGlow ? "is-no-glow" : ""}`.trim()} data-spec="04-6">
      <SectionHead
        title={collection.title}
        hint={collection.hint ?? collection.subtitle}
        more={more ?? undefined}
      />
      {layout === "mega" ? (
        <Strip variant="mega" ariaLabel={collection.title}>
          {items.map((entry) => (
            <CardMega key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
          ))}
        </Strip>
      ) : layout === "duo" ? (
        <Strip variant="duo" ariaLabel={collection.title}>
          {items.slice(0, 2).map((entry) => (
            <CardDuo key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} tag={collection.title} />
          ))}
        </Strip>
      ) : layout === "split" ? (
        <div className="marketplace-store-split-list">
          {items.map((entry) => (
            <CardDuo
              key={entry.id}
              entry={entry}
              ctx={data.ctxOf(entry)}
              handlers={actions}
              tag={collection.title}
              split
            />
          ))}
        </div>
      ) : layout === "wall" ? (
        <div className="marketplace-store-wall">
          {items.map((entry) => (
            <CardWall key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
          ))}
        </div>
      ) : layout === "grid" ? (
        <div className="marketplace-store-grid">
          {items.map((entry) => (
            <CardGrid key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
          ))}
        </div>
      ) : (
        <Strip variant="rows2" ariaLabel={collection.title}>
          {items.map((entry) => (
            <CardSmall key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
          ))}
        </Strip>
      )}
    </section>
  );
}

export default CollectionRenderer;
