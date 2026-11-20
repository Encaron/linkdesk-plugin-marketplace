/**
 * CollectionSection — 合集槽的**声明驱动渲染器**（04 §六：布局=卡片变体；聚合/顺序/缺失引用都归数据）。
 *
 * `layout` 映射（06 §二·3 / 09 §二）：strip→small 横排（恒两行）· duo→双大卡 · mega→超大卡 ·
 * grid→网格 · banner→hero（由 Hero 消费，本件跳过）。引用缺失 id **静默跳过**（防御，照目录 merge）。
 * ⛔ 本件不造「更多」——合集声明没有 more 字段；跳转字属作者店 sections（棒 7）。
 */

import type { CatalogEntry, CollectionDecl } from "../../../services/marketCatalog";
import { CardDuo } from "../cards/CardDuo";
import { CardGrid } from "../cards/CardGrid";
import { CardSmall } from "../cards/CardSmall";
import { useStore } from "../StoreContext";
import { Strip } from "../Strip";
import { SectionHead } from "./SectionHead";

export function CollectionSection({ collection }: { collection: CollectionDecl }) {
  const { data, actions } = useStore();
  const byId = new Map(data.catalog.entries.map((e) => [e.id, e]));
  const items = collection.items.map((id) => byId.get(id)).filter((e): e is CatalogEntry => !!e);
  if (collection.layout === "banner" || items.length === 0) return null;

  return (
    <section className="marketplace-store-sec" data-spec="04-6">
      <SectionHead title={collection.title} hint={collection.hint ?? collection.subtitle} />
      {collection.layout === "duo" ? (
        <Strip variant="duo" ariaLabel={collection.title}>
          {items.slice(0, 2).map((entry) => (
            <CardDuo key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} tag={collection.title} />
          ))}
        </Strip>
      ) : collection.layout === "grid" ? (
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

export default CollectionSection;
