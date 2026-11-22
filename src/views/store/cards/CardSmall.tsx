/**
 * CardSmall — 装机必备小卡（236×84 · 10:3.6；hover 原位放大 1.1＋展开层）。
 * 主面＝图标＋名＋分类＋唯一状态角标；hover 层＝动作＋简介＋全徽标＋⋯（五卡同构，08 §二·v3.65）。
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
  jobLabelOf,
  menuOfCard,
  statusOfCard,
  tCategory,
  Tile,
  type StoreCardContext,
  type StoreCardHandlers,
} from "./cardParts";
import { useStickyClearance } from "./useStickyClearance";

/** memo 化（R4-5.3/I2）：卡片 props 全量判等——状态 tick 只重渲真实变化的那几张 */
export const CardSmall = memo(function CardSmall({
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
  const label = t("{{name}}——查看详情", { name: entry.name });
  return (
    <div
      ref={clearance.ref}
      onPointerEnter={clearance.onPointerEnter}
      onPointerLeave={clearance.onPointerLeave}
      onFocus={clearance.onFocus}
      onBlur={clearance.onBlur}
      className="marketplace-store-card is-small"
      role="button"
      tabIndex={0}
      aria-label={label}
      data-entry={entry.id}
      style={{ ["--marketplace-hue" as string]: entryHue(entry) }}
      onClick={open}
      onKeyDown={(e) => cardKeyDown(e, open)}
    >
      {/* 单面（F39）：卡体只是占位，头部与新增信息都在同一个面里——面居中、高度随内容 */}
      <div className="marketplace-store-x-over">
        <div className="marketplace-store-cs-top">
          <Tile entry={entry} identity={ctx.installedIdentity} className="is-lg" />
          <div className="marketplace-store-fx1">
            {/* 标题独占一行（长价格不再抢宽）；角标下沉到分类行，长文案省略 */}
            <div className="marketplace-store-cs-name">{t(entry.name)}</div>
            <div className="marketplace-store-cs-meta">
              <span className="marketplace-store-cs-cat">{tCategory(t, entry)}</span>
              <CornerTag stacked baseClass="marketplace-ui-corner marketplace-store-cs-free" tag={status} />
            </div>
          </div>
        </div>
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

export default CardSmall;
