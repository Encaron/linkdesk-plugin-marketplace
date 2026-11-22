/**
 * CardWall — 主题图墙卡（THEMES 默认视图；17 §四「wall」）。
 *
 * 只排版：封面在上（3:2，同一个 `Art`）＋ 名字/下载/单角标在下；hover 快捷层
 * （作者 / 价格·状态 / 安装购买 / 更多）复用 `ActionButton` / `CornerTag` / `MoreMenu`。
 * ⛔ 自读 screenshots/cover、⛔ 自建按钮/角标/轮播——媒体与状态都由共享件给。
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, restatesState, CornerTag, entryHue, MoreMenu } from "../../../../ui";
import type { CatalogEntry } from "../../../../services/marketCatalog";
import {
  actionOfCard,
  Art,
  cardKeyDown,
  cardPropsEqual,
  dlText,
  jobLabelOf,
  menuOfCard,
  statusOfCard,
  tAuthor,
  tCategory,
  type StoreCardContext,
  type StoreCardHandlers,
} from "../cardParts";

export const CardWall = memo(function CardWall({
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
      className="marketplace-store-card is-wall"
      role="button"
      tabIndex={0}
      aria-label={t("{{name}}——查看详情", { name: entry.name })}
      data-entry={entry.id}
      style={{ ["--marketplace-hue" as string]: entryHue(entry) }}
      onClick={open}
      onKeyDown={(e) => cardKeyDown(e, open)}
    >
      <div className="marketplace-store-cw-media">
        <Art entry={entry} identity={ctx.installedIdentity} variant="wall" />
      </div>
      <div className="marketplace-store-cw-foot">
        <div className="marketplace-store-mn0">
          <div className="marketplace-store-cw-name">{entry.name}</div>
          <div className="marketplace-store-cw-sub">
            {tCategory(t, entry)}
            {dl ? ` · ▾ ${dl}` : ""}
          </div>
        </div>
        <CornerTag baseClass="marketplace-ui-corner marketplace-store-cw-corner" tag={status} />
      </div>
      {/* hover 快捷层：与其它卡同一套动作/角标/菜单——整卡进详情不是唯一路径 */}
      <div className="marketplace-store-cw-hover">
        <div className="marketplace-store-cw-h-top">
          <span className="marketplace-store-cw-h-name">{entry.name}</span>
          <CornerTag baseClass="marketplace-ui-corner marketplace-store-cw-corner" tag={status} />
          <MoreMenu
            pluginId={entry.id}
            disabled={ctx.state === "disabled"}
            items={items}
            onSelect={(id) => (id === "open" ? open() : handlers.onAct(entry, id))}
          />
        </div>
        <div className="marketplace-store-cw-h-author">{tAuthor(entry)}</div>
        <div className="marketplace-store-cw-h-acts">
          {!(ctx.state === "installed" && restatesState(action)) && (
            <ActionButton action={action} onAct={(id) => handlers.onAct(entry, id)} />
          )}
        </div>
      </div>
    </div>
  );
}, cardPropsEqual);

export default CardWall;
