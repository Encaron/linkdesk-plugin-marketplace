/**
 * CardSmall — 装机必备小卡（236×84 · 10:3.6；hover 原位放大 1.1＋展开层）。
 * 主面＝图标＋名＋分类＋唯一状态角标；hover 层＝动作＋简介＋全徽标＋⋯（五卡同构，08 §二·v3.65）。
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, BadgeRow, CornerTag, entryHue, MoreMenu } from "../../../ui";
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
  const open = () => handlers.onOpen(entry);
  const status = statusOfCard(entry, ctx);
  const action = actionOfCard(entry, ctx, jobLabelOf(t, ctx.job));
  const items = menuOfCard(entry, ctx);
  const label = t("{{name}}——查看详情", { name: entry.name });
  return (
    <div
      className="marketplace-store-card is-small"
      role="button"
      tabIndex={0}
      aria-label={label}
      data-entry={entry.id}
      style={{ ["--marketplace-hue" as string]: entryHue(entry) }}
      onClick={open}
      onKeyDown={(e) => cardKeyDown(e, open)}
    >
      <div className="marketplace-store-cs-top">
        <Tile entry={entry} identity={ctx.installedIdentity} className="is-lg" />
        <div className="marketplace-store-fx1">
          <div className="marketplace-store-cs-name">{entry.name}</div>
          <div className="marketplace-store-cs-cat">{tCategory(t, entry)}</div>
        </div>
        <CornerTag baseClass="marketplace-ui-corner marketplace-store-cs-free" tag={status} />
      </div>
      <div className="marketplace-store-x-over">
        <div className="marketplace-store-x-head">
          <Tile entry={entry} identity={ctx.installedIdentity} className="is-lg" />
          <div className="marketplace-store-fx1">
            <div className="marketplace-store-x-name">{entry.name}</div>
            <div className="marketplace-store-x-cat">{tCategory(t, entry)}</div>
          </div>
          <ActionButton action={action} onAct={(id) => handlers.onAct(entry, id)} />
          <MoreMenu items={items} onSelect={(id) => (id === "open" ? open() : handlers.onAct(entry, id))} />
        </div>
        {entry.description && <div className="marketplace-store-x-desc">{entry.description}</div>}
        <div className="marketplace-store-x-badges">
          <BadgeRow badges={badgesOfCard(entry, ctx)} />
        </div>
      </div>
    </div>
  );
}, cardPropsEqual);

export default CardSmall;
