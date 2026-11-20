/**
 * CardRow — 详细信息行（分类页/搜索·「详细」视图；05 §四 row 原型）。
 * 图标 48＋名＋来源徽标＋分类＋简介 1 行＋下载量＋动作钮；hover 1.02 origin left（行不横跳）。
 */

import { useTranslation } from "react-i18next";
import { ActionButton, Badge, entryHue, MoreMenu, sourceBadge } from "../../../ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import {
  actionOfCard,
  cardKeyDown,
  dlText,
  jobLabelOf,
  menuOfCard,
  tCategory,
  Tile,
  type StoreCardContext,
  type StoreCardHandlers,
} from "./cardParts";

export function CardRow({
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
  const action = actionOfCard(entry, ctx, jobLabelOf(t, ctx.job));
  const items = menuOfCard(entry, ctx);
  const dl = dlText(ctx.dl);
  return (
    <div
      className="marketplace-store-card is-row"
      role="button"
      tabIndex={0}
      aria-label={t("{{name}}——查看详情", { name: entry.name })}
      data-entry={entry.id}
      style={{ ["--marketplace-hue" as string]: entryHue(entry) }}
      onClick={open}
      onKeyDown={(e) => cardKeyDown(e, open)}
    >
      <Tile entry={entry} identity={ctx.installedIdentity} className="is-lg" />
      <div className="marketplace-store-cr-main">
        <div className="marketplace-store-cr-l1">
          <span className="marketplace-store-cr-name">{entry.name}</span>
          <Badge desc={sourceBadge(entry)} />
          <span className="marketplace-store-cr-cat">{tCategory(t, entry)}</span>
        </div>
        {entry.description && <div className="marketplace-store-cr-desc">{entry.description}</div>}
      </div>
      {dl && (
        <span className="marketplace-store-cr-dl" data-hint={t("下载量")}>
          ▾ {dl}
        </span>
      )}
      <ActionButton action={action} onAct={(id) => handlers.onAct(entry, id)} />
      <MoreMenu items={items} onSelect={(id) => (id === "open" ? open() : handlers.onAct(entry, id))} />
    </div>
  );
}

export default CardRow;
