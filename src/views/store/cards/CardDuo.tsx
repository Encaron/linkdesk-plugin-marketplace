/**
 * CardDuo — 双大卡（两枚一排；左文案/右大图）。`split` = 同一组件的整行分栏修饰
 * （「编辑精选」：与 hero 同尺寸、左文右图、媒体内嵌、无满幅/无 scrim）。
 * `tag` 为板块标签（作者/官方声明标题），由调用方传入——⛔ 卡内自造。
 */

import { useTranslation } from "react-i18next";
import { useStickyClearance } from "./useStickyClearance";
import { ActionButton, restatesState, CornerTag, entryHue, MoreMenu } from "../../../ui";
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
  split,
}: {
  entry: CatalogEntry;
  ctx: StoreCardContext;
  handlers: StoreCardHandlers;
  tag?: string;
  split?: boolean;
}) {
  const { t } = useTranslation();
  const clearance = useStickyClearance<HTMLDivElement>({ mode: "lift" });
  const open = () => handlers.onOpen(entry);
  const status = statusOfCard(entry, ctx);
  const action = actionOfCard(entry, ctx, jobLabelOf(t, ctx.job));
  const items = menuOfCard(entry, ctx);
  return (
    <div
      ref={clearance.ref}
      onPointerEnter={clearance.onPointerEnter}
      onPointerLeave={clearance.onPointerLeave}
      onFocus={clearance.onFocus}
      onBlur={clearance.onBlur}
      className={`marketplace-store-card is-duo ${split ? "is-split" : ""}`.trim()}
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
      <Art entry={entry} identity={ctx.installedIdentity} variant={split ? "split" : "duo"} />
    </div>
  );
}

export default CardDuo;
