/**
 * CollectionSection — 官方首页合集槽的**数据适配器**（渲染唯一在 `CollectionRenderer`）。
 *
 * 官方合集从 `catalog.entries` 解析 items；作者店从 `repo.plugins` 解析（见 AuthorStoreView）。
 * layout 分发/more/noGlow 全部归共享渲染器，⛔ 本件不再自己拼卡片。
 */

import { useMemo } from "react";
import type { CatalogEntry, CollectionDecl } from "../../../services/marketCatalog";
import { CollectionRenderer } from "../CollectionRenderer";
import { useStore } from "../StoreContext";

export function CollectionSection({ collection }: { collection: CollectionDecl }) {
  const { data } = useStore();
  const items = useMemo(() => {
    const byId = new Map(data.catalog.entries.map((e) => [e.id, e]));
    return collection.items.map((id) => byId.get(id)).filter((e): e is CatalogEntry => !!e);
  }, [collection, data.catalog.entries]);
  return <CollectionRenderer collection={collection} items={items} />;
}

export default CollectionSection;
