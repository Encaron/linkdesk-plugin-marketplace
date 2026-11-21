/**
 * CardGrid — 分类网格卡（≥260 自适应；主面＝图标＋名＋作者＋下载＋单角标；hover 同款展开）。
 * 蓝图 v3.65：grid 主面全家徽标区**拆掉**——只留唯一状态角标；全量徽标在 hover 层。
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, restatesState, BadgeRow, CornerTag, entryHue, MoreMenu } from "../../../ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import {
  actionOfCard,
  badgesOfCard,
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
import { useStickyClearance } from "./useStickyClearance";

/** memo 化（R4-5.3/I2）：卡片 props 全量判等——500 条目分块挂载后，状态 tick 只重渲真实变化的那几张 */
export const CardGrid = memo(function CardGrid({
  entry,
  ctx,
  handlers,
}: {
  entry: CatalogEntry;
  ctx: StoreCardContext;
  handlers: StoreCardHandlers;
}) {
  const { t } = useTranslation();
  const clearance = useStickyClearance<HTMLDivElement>();
  const open = () => handlers.onOpen(entry);
  const status = statusOfCard(entry, ctx);
  const action = actionOfCard(entry, ctx, jobLabelOf(t, ctx.job));
  const items = menuOfCard(entry, ctx);
  const dl = dlText(ctx.dl);
  return (
    <div
      ref={clearance.ref}
      onPointerEnter={clearance.onPointerEnter}
      onPointerLeave={clearance.onPointerLeave}
      onFocus={clearance.onFocus}
      onBlur={clearance.onBlur}
      className="marketplace-store-card is-grid"
      role="button"
      tabIndex={0}
      aria-label={t("{{name}}——查看详情", { name: entry.name })}
      data-entry={entry.id}
      style={{ ["--marketplace-hue" as string]: entryHue(entry) }}
      onClick={open}
      onKeyDown={(e) => cardKeyDown(e, open)}
    >
      {/* 单面（F39）：卡体只是占位，头部/统计/新增信息都在同一个面里——面居中、高度随内容 */}
      <div className="marketplace-store-x-over">
        <div className="marketplace-store-cg-top">
          <Tile entry={entry} identity={ctx.installedIdentity} />
          <div className="marketplace-store-fx1">
            {/* 标题独占一行；角标下沉到作者行，长文案省略 */}
            <div className="marketplace-store-cg-name">{entry.name}</div>
            <div className="marketplace-store-cg-meta">
              <span className="marketplace-store-cg-author">{tAuthor(entry)}</span>
              <CornerTag baseClass="marketplace-ui-corner marketplace-store-cg-corner" tag={status} />
            </div>
          </div>
        </div>
        {dl && (
          <div className="marketplace-store-cg-stats">
            <span className="marketplace-store-cg-dl" data-hint={t("下载量")}>
              ▾ {dl}
            </span>
          </div>
        )}
        {/* 展开只放新增信息（简介/徽标/动作），头部只有一份 */}
        <div className="marketplace-store-x-more">
          <div className="marketplace-store-x-more-inner">
            {entry.description && <div className="marketplace-store-x-desc">{entry.description}</div>}
            <div className="marketplace-store-x-foot">
              <BadgeRow badges={badgesOfCard(entry, ctx)} />
              <div className="marketplace-store-x-acts">
                {!(ctx.state === "installed" && restatesState(action)) && (
                  <ActionButton action={action} onAct={(id) => handlers.onAct(entry, id)} />
                )}
                <MoreMenu
                  pluginId={entry.id}
                  disabled={ctx.state === "disabled"}
                  items={items}
                  onSelect={(id) => (id === "open" ? open() : handlers.onAct(entry, id))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}, cardPropsEqual);

export default CardGrid;
