/**
 * RankRow — 热门下载名次行（主面＝名次＋图标＋名/分类/作者＋单角标＋下载量）。
 * hover＝**原位替换**：下载量淡出、动作钮同一位置浮现（几何不动，05 §二）。
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, restatesState, CornerTag, entryHue, MoreMenu } from "../../../ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import {
  actionOfCard,
  cardKeyDown,
  cardPropsEqual,
  dlText,
  jobLabelOf,
  menuOfCard,
  statusOfCard,
  tAuthor,
  tCategory,
  Tile,
  type StoreCardContext,
  type StoreCardHandlers,
} from "./cardParts";

type RankRowProps = {
  entry: CatalogEntry;
  index: number;
  ctx: StoreCardContext;
  handlers: StoreCardHandlers;
};

/** memo 化（R4-5.3/I2）：cardPropsEqual ＋ index 判等——名次行 props 全量判等 */
export const RankRow = memo(function RankRow({
  entry,
  index,
  ctx,
  handlers,
}: {
  entry: CatalogEntry;
  index: number;
  ctx: StoreCardContext;
  handlers: StoreCardHandlers;
}) {
  const { t } = useTranslation();
  const open = () => handlers.onOpen(entry);
  const status = statusOfCard(entry, ctx);
  const action = actionOfCard(entry, ctx, jobLabelOf(t, ctx.job));
  const items = menuOfCard(entry, ctx);
  const dl = dlText(ctx.dl);
  return (
    <div
      className="marketplace-store-rank-row"
      role="button"
      tabIndex={0}
      aria-label={t("{{name}}——查看详情", { name: entry.name })}
      data-entry={entry.id}
      style={{ ["--marketplace-hue" as string]: entryHue(entry) }}
      onClick={open}
      onKeyDown={(e) => cardKeyDown(e, open)}
    >
      <span className="marketplace-store-rk">{index}</span>
      <Tile entry={entry} identity={ctx.installedIdentity} />
      <div className="marketplace-store-rr-mid">
        <div className="marketplace-store-rr-name">{entry.name}</div>
        <div className="marketplace-store-rr-cat">
          {tCategory(t, entry)} · {tAuthor(entry)}
        </div>
      </div>
      <CornerTag baseClass="marketplace-ui-corner marketplace-store-rr-corner" tag={status} />
      {/* F26 单槽：下载量与动作钮在同一个槽里互斥——⛔ 不再绝对定位压到价格角标上 */}
      <span className="marketplace-store-rr-slot">
        {dl && <span className="marketplace-store-rr-dl">▾ {dl}</span>}
        <span className="marketplace-store-rr-act">
          {!(ctx.state === "installed" && restatesState(action)) && (
            <ActionButton action={action} onAct={(id) => handlers.onAct(entry, id)} />
          )}
          <MoreMenu
            pluginId={entry.id}
            disabled={ctx.state === "disabled"}
            items={items}
            onSelect={(id) => (id === "open" ? open() : handlers.onAct(entry, id))}
          />
        </span>
      </span>
    </div>
  );
}, (a: RankRowProps, b: RankRowProps) => a.index === b.index && cardPropsEqual(a, b));

export default RankRow;
