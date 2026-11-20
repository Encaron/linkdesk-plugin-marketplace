/**
 * CardGrid — 分类网格卡（≥260 自适应；主面＝图标＋名＋作者＋下载＋单角标；hover 同款展开）。
 * 蓝图 v3.65：grid 主面全家徽标区**拆掉**——只留唯一状态角标；全量徽标在 hover 层。
 */

import { useTranslation } from "react-i18next";
import { ActionButton, BadgeRow, CornerTag, entryHue, MoreMenu } from "../../../ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import {
  actionOfCard,
  badgesOfCard,
  cardKeyDown,
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

export function CardGrid({
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
  const dl = dlText(ctx.dl);
  return (
    <div
      className="marketplace-store-card is-grid"
      role="button"
      tabIndex={0}
      aria-label={t("{{name}}——查看详情", { name: entry.name })}
      data-entry={entry.id}
      style={{ ["--marketplace-hue" as string]: entryHue(entry) }}
      onClick={open}
      onKeyDown={(e) => cardKeyDown(e, open)}
    >
      <div className="marketplace-store-cg-top">
        <Tile entry={entry} identity={ctx.installedIdentity} />
        <div className="marketplace-store-fx1">
          <div className="marketplace-store-cg-name">{entry.name}</div>
          <div className="marketplace-store-cg-author">{tAuthor(entry)}</div>
        </div>
        <CornerTag baseClass="marketplace-ui-corner marketplace-store-cg-corner" tag={status} />
      </div>
      {dl && (
        <div className="marketplace-store-cg-stats">
          <span data-hint={t("下载量")}>
            ▾ {dl}
          </span>
        </div>
      )}
      <div className="marketplace-store-x-over">
        <div className="marketplace-store-x-head">
          <Tile entry={entry} identity={ctx.installedIdentity} />
          <div className="marketplace-store-fx1">
            <div className="marketplace-store-x-name">{entry.name}</div>
            <div className="marketplace-store-x-cat">{tAuthor(entry)}</div>
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
}

export default CardGrid;
