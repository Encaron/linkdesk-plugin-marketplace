/**
 * OrderedCards — 排序序列 → 卡片网格/详细行（组头随内容渲染；同组挨一起、组间 A→Z）。
 * 唯一卡片渲染路径：分类页/搜索页都走这里（⛔ 各页再写一份 map 卡片）。
 */

import { useTranslation } from "react-i18next";
import { CardGrid } from "../cards/CardGrid";
import { CardRow } from "../cards/CardRow";
import type { OrderedNode } from "../storeData";
import { useStore } from "../StoreContext";

export function OrderedCards({ nodes, view }: { nodes: OrderedNode[]; view: "grid" | "list" }) {
  const { t } = useTranslation();
  const { data, actions } = useStore();
  return (
    <div className={view === "grid" ? "marketplace-store-grid" : "marketplace-store-rows"}>
      {nodes.map((node, i) =>
        node.kind === "group" ? (
          <div key={`g:${node.label}:${i}`} className="marketplace-store-group-h">
            <span className="marketplace-store-group-name">{node.label}</span>
            <span className="marketplace-store-group-n">{t("{{count}} 个插件", { count: node.count })}</span>
          </div>
        ) : view === "grid" ? (
          <CardGrid key={node.entry.id} entry={node.entry} ctx={data.ctxOf(node.entry)} handlers={actions} />
        ) : (
          <CardRow key={node.entry.id} entry={node.entry} ctx={data.ctxOf(node.entry)} handlers={actions} />
        ),
      )}
    </div>
  );
}

export default OrderedCards;
