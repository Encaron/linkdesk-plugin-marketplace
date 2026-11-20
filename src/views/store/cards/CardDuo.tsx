/**
 * CardDuo — 编辑精选双大卡（左文案/右大图；无图态＝纯色渐变＋图标，水印占位 ⛔ 已删 B15）。
 * `tag` 为板块标签（作者/官方声明标题），由调用方传入——⛔ 卡内自造。
 */

import { useTranslation } from "react-i18next";
import { ActionButton, CornerTag, entryHue, MoreMenu } from "../../../ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import {
  actionOfCard,
  Art,
  cardKeyDown,
  jobLabelOf,
  menuOfCard,
  statusOfCard,
  type StoreCardContext,
  type StoreCardHandlers,
} from "./cardParts";

export function CardDuo({
  entry,
  ctx,
  handlers,
  tag,
}: {
  entry: CatalogEntry;
  ctx: StoreCardContext;
  handlers: StoreCardHandlers;
  tag?: string;
}) {
  const { t } = useTranslation();
  const open = () => handlers.onOpen(entry);
  const status = statusOfCard(entry, ctx);
  const action = actionOfCard(entry, ctx, jobLabelOf(t, ctx.job));
  const items = menuOfCard(entry, ctx);
  return (
    <div
      className="marketplace-store-card is-duo"
      role="button"
      tabIndex={0}
      aria-label={t("{{name}}——查看详情", { name: entry.name })}
      data-entry={entry.id}
      style={{ ["--marketplace-hue" as string]: entryHue(entry) }}
      onClick={open}
      onKeyDown={(e) => cardKeyDown(e, open)}
    >
      <div className="marketplace-store-cd-copy">
        <span className="marketplace-store-cd-tag">{tag ?? t("编辑精选")}</span>
        <div className="marketplace-store-cd-name">{entry.name}</div>
        {entry.description && <div className="marketplace-store-cd-desc">{entry.description}</div>}
        <CornerTag baseClass="marketplace-ui-corner marketplace-store-cd-corner" tag={status} />
        <div className="marketplace-store-cd-acts">
          <ActionButton action={action} onAct={(id) => handlers.onAct(entry, id)} />
          <MoreMenu items={items} onSelect={(id) => (id === "open" ? open() : handlers.onAct(entry, id))} />
        </div>
      </div>
      <Art entry={entry} identity={ctx.installedIdentity} className="is-duo" />
    </div>
  );
}

export default CardDuo;
