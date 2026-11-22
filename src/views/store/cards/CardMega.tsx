/**
 * CardMega — 主题专区超大卡（312px；封面 200px＋底部灰条 60px）。
 * hover＝本体放大 1.12＋灰条向上延伸（标语/简介/按钮长进条里，字不碰封面——v3.7 拍板）。
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, restatesState, BadgeRow, CornerTag, entryHue, MoreMenu } from "../../../ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import {
  actionOfCard,
  Art,
  badgesOfCard,
  cardKeyDown,
  cardPropsEqual,
  jobLabelOf,
  menuOfCard,
  statusOfCard,
  tCategory,
  type StoreCardContext,
  type StoreCardHandlers,
} from "./cardParts";

/** memo 化（R4-5.3/I2）：卡片 props 全量判等——状态 tick 只重渲真实变化的那几张 */
export const CardMega = memo(function CardMega({
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
  return (
    <div
      className="marketplace-store-card is-mega"
      role="button"
      tabIndex={0}
      aria-label={t("{{name}}——查看详情", { name: entry.name })}
      data-entry={entry.id}
      style={{ ["--marketplace-hue" as string]: entryHue(entry) }}
      onClick={open}
      onKeyDown={(e) => cardKeyDown(e, open)}
    >
      <Art entry={entry} identity={ctx.installedIdentity} variant="mega" />
      <div className="marketplace-store-cm-foot">
        <div className="marketplace-store-mn0">
          <div className="marketplace-store-cm-name">{entry.name}</div>
          <div className="marketplace-store-cm-cat">{tCategory(t, entry)}</div>
        </div>
        <CornerTag baseClass="marketplace-ui-corner marketplace-store-cm-free" tag={status} />
      </div>
      <div className="marketplace-store-cm-band">
        {entry.description && <div className="marketplace-store-cm-band-desc">{entry.description}</div>}
        <div className="marketplace-store-cm-band-row">
          <BadgeRow badges={badgesOfCard(entry, ctx)} />
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
  );
}, cardPropsEqual);

export default CardMega;
