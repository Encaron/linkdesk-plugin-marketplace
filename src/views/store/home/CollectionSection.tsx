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
  const { data, navigate } = useStore();
  const items = useMemo(() => {
    const byId = new Map(data.catalog.entries.map((e) => [e.id, e]));
    return collection.items.map((id) => byId.get(id)).filter((e): e is CatalogEntry => !!e);
  }, [collection, data.catalog.entries]);
  // 官方合集声明的「更多」也按页主范围落页：官方店 = official 源预过滤（2026-11-22 归一化拍板）
  const more = useMemo(() => {
    const label = collection.more?.label;
    const target = collection.more?.target;
    if (!label || !target) return undefined;
    if (target === "rank") return { label, onClick: () => navigate({ page: "rank" }) };
    if (target.startsWith("category:")) {
      const slug = target.slice("category:".length);
      if (!slug) return undefined;
      return {
        label,
        onClick: () => navigate({ page: "category", category: slug, official: true }),
      };
    }
    return undefined;
  }, [collection.more, navigate]);
  return <CollectionRenderer collection={collection} items={items} more={more} />;
}

export default CollectionSection;
