/**
 * OrderedCards — 排序序列 → 卡片网格/详细行（组头随内容渲染；同组挨一起、组间 A→Z）。
 * 唯一卡片渲染路径：分类页/搜索页都走这里（⛔ 各页再写一份 map 卡片）。
 */

import { useTranslation } from "react-i18next";
import { CardGrid } from "../cards/CardGrid";
import { CardRow } from "../cards/CardRow";
import { CardWall } from "../cards/variants/CardWall";
import type { OrderedNode } from "../storeData";
import { useStore } from "../StoreContext";
import { ChunkedReveal } from "../../../ui";

export function OrderedCards({
  nodes,
  view,
  cardVariant = "grid",
}: {
  nodes: OrderedNode[];
  view: "grid" | "list";
  /** 网格形态：grid（分类/搜索默认）| wall（THEMES 封面图墙）——列表视图不受影响 */
  cardVariant?: "grid" | "wall";
}) {
  const { t } = useTranslation();
  const { data, actions } = useStore();
  const gridClass = cardVariant === "wall" ? "marketplace-store-wall" : "marketplace-store-grid";
  return (
    <div className={view === "grid" ? gridClass : "marketplace-store-rows"}>
      {/* R4-5.3/I2：分块渐进（原语件唯一来源 = ui/ChunkedReveal）——500 条目首屏只挂首块 */}
      <ChunkedReveal
        items={nodes}
        renderItem={(node, i) =>
          node.kind === "group" ? (
            <div key={`g:${node.label}:${i}`} className="marketplace-store-group-h">
              <span className="marketplace-store-group-name">{node.label}</span>
              <span className="marketplace-store-group-n">{t("{{count}} 个插件", { count: node.count })}</span>
            </div>
          ) : view === "grid" ? (
            cardVariant === "wall" ? (
              <CardWall key={node.entry.id} entry={node.entry} ctx={data.ctxOf(node.entry)} handlers={actions} />
            ) : (
              <CardGrid key={node.entry.id} entry={node.entry} ctx={data.ctxOf(node.entry)} handlers={actions} />
            )
          ) : (
            <CardRow key={node.entry.id} entry={node.entry} ctx={data.ctxOf(node.entry)} handlers={actions} />
          )
        }
      />
    </div>
  );
}

export default OrderedCards;
