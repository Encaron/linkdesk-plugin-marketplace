/**
 * cardParts — 五类卡的**共用零件**（图标块 / 取字 / 状态合成）——卡片只组装，不各拼一套。
 *
 * 纪律：卡片永远蠢（05 §三）——状态判定走 `ui/statusTag` + `services/catalogStatus`，动作判定走
 * `ui/ActionButton.resolveAction`，菜单项走 `ui/ActionButton.moreMenuItems`；本文件只把它们的输出
 * 合成到卡片需要的形状。
 */

import type { CSSProperties } from "react";
import { PluginIcon, pickIdentityArt } from "@linkdesk/ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import { primaryCategoryOf } from "../../../services/marketCatalog";
import { localizeCategory } from "../../../services/marketCategories";
import type { LocalIdentity, PackageState } from "../../../services/catalogStatus";
import type { InstallJob } from "../../../services/installJobs";
import { installJobLabel } from "../../../services/installJobs";
import { authorLabel } from "../../../services/catalogText";
import {
  allBadges,
  artBG,
  entryHue,
  hueBG,
  moreMenuItems,
  resolveAction,
  statusTag,
  type ActionId,
  type BadgeDesc,
  type LicenseView,
  type MoreItem,
  type ResolvedAction,
  type StatusTag,
} from "../../../ui";

/** 卡片渲染上下文（由商店数据层一次性算好，逐卡传入——⛔ 卡内再订阅 store） */
export interface StoreCardContext {
  state: PackageState;
  core?: boolean;
  license?: LicenseView | null;
  job?: InstallJob | null;
  online: boolean;
  /** 下载数（undefined = 拿不到，UI 不显示——诚实不造位） */
  dl?: number;
  /** 已装候选身份图（E6#106 裁决链第一候选） */
  installedIdentity?: LocalIdentity;
}

export interface StoreCardHandlers {
  /** 整卡入口（开详情标签页 pinned:true） */
  onOpen: (entry: CatalogEntry) => void;
  /** 动作/菜单项执行（同一 id 只一个服务入口） */
  onAct: (entry: CatalogEntry, id: ActionId) => void;
}

/** 卡片 memo 比较器（R4-5.3/I2）——props 全量判等：entry/handlers 引用 ＋ ctx 逐字段 ===。
 *  保守正确无漏判面：底层数据全部快照整表替换（jobs/licenses/counts 换代＝引用换代；IPC 广播
 *  结构化克隆 ⇒ 每个 job 对象每次都是新引用）——任何真实变化至少一个字段换引用，变化必重渲。 */
export function cardPropsEqual(
  a: { entry: CatalogEntry; ctx: StoreCardContext; handlers: StoreCardHandlers },
  b: { entry: CatalogEntry; ctx: StoreCardContext; handlers: StoreCardHandlers },
): boolean {
  if (a.entry !== b.entry || a.handlers !== b.handlers) return false;
  return (
    a.ctx.state === b.ctx.state &&
    a.ctx.core === b.ctx.core &&
    a.ctx.license === b.ctx.license &&
    a.ctx.job === b.ctx.job &&
    a.ctx.online === b.ctx.online &&
    a.ctx.dl === b.ctx.dl &&
    a.ctx.installedIdentity === b.ctx.installedIdentity
  );
}

export function tCategory(t: (key: string) => string, entry: CatalogEntry): string {
  return localizeCategory(t, primaryCategoryOf(entry));
}

export function tAuthor(entry: CatalogEntry): string {
  return authorLabel(entry.author) ?? "官方";
}

export function dlText(n?: number): string | undefined {
  if (n === undefined) return undefined;
  return n.toLocaleString();
}

export function statusOfCard(entry: CatalogEntry, ctx: StoreCardContext): StatusTag {
  return statusTag(entry, { state: ctx.state, license: ctx.license });
}

export function badgesOfCard(entry: CatalogEntry, ctx: StoreCardContext): BadgeDesc[] {
  return allBadges(entry, { state: ctx.state, core: ctx.core, license: ctx.license });
}

export function actionOfCard(
  entry: CatalogEntry,
  ctx: StoreCardContext,
  jobLabel: string,
): ResolvedAction {
  return resolveAction(entry, {
    state: ctx.state,
    online: ctx.online,
    core: ctx.core,
    license: ctx.license,
    job: ctx.job,
    jobLabel,
  });
}

export function menuOfCard(entry: CatalogEntry, ctx: StoreCardContext): MoreItem[] {
  return moreMenuItems(entry, { state: ctx.state, core: ctx.core });
}

/** 卡片里的安装阶段短句（唯一出处 = installJobs 的 label 派生） */
export function jobLabelOf(t: (key: string, opts?: Record<string, unknown>) => string, job?: InstallJob | null): string {
  return job ? installJobLabel(t, job) : "";
}

/** 图标块（身份图裁决：已装 manifest → 目录条目 → 默认彩色块；底色跟随 id 稳定 hue） */
export function Tile({
  entry,
  identity,
  className,
}: {
  entry: CatalogEntry;
  identity?: LocalIdentity;
  className?: string;
}) {
  const hue = entryHue(entry);
  const style: CSSProperties = { ...hueBG(hue), ["--marketplace-hue" as string]: hue };
  return (
    <span className={`marketplace-store-tile ${className ?? ""}`.trim()} style={style}>
      <PluginIcon pluginId={entry.id} manifest={pickIdentityArt(identity, entry)} alt="" />
    </span>
  );
}

/** 封面/大图区（渐变底＋大图标；封面优先级：目录 cover → screenshots[0] → 无图态纯色渐变） */
export function Art({
  entry,
  identity,
  className,
}: {
  entry: CatalogEntry;
  identity?: LocalIdentity;
  className?: string;
}) {
  const hue = entryHue(entry);
  const style: CSSProperties = { ...artBG(hue), ["--marketplace-hue" as string]: hue };
  const shot = entry.screenshots?.[0];
  const cover = typeof shot === "string" ? shot : undefined;
  return (
    <div className={`marketplace-store-art ${className ?? ""}`.trim()} style={style}>
      {cover ? (
        <img className="marketplace-store-art-cover" src={cover} alt="" loading="lazy" draggable={false} />
      ) : (
        <PluginIcon pluginId={entry.id} manifest={pickIdentityArt(identity, entry)} className="marketplace-store-art-icon" alt="" />
      )}
    </div>
  );
}

/** 整卡可点语义（Enter/Space 与鼠标同效；动作钮/菜单自行阻断冒泡） */
export function cardKeyDown(ev: React.KeyboardEvent, open: () => void): void {
  if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    open();
  }
}
