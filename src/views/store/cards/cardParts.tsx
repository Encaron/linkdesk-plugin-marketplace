/**
 * cardParts — 五类卡的**共用零件**（图标块 / 取字 / 状态合成）——卡片只组装，不各拼一套。
 *
 * 纪律：卡片永远蠢（05 §三）——状态判定走 `ui/statusTag` + `services/catalogStatus`，动作判定走
 * `ui/ActionButton.resolveAction`，菜单项走 `ui/ActionButton.moreMenuItems`；本文件只把它们的输出
 * 合成到卡片需要的形状。
 */

import { useTranslation } from "react-i18next";
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
import { mediaOf } from "./mediaModel";

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
  // F1（2026-11-21 用户抓漏）：无作者回落**按来源语义**——官方件才落「官方」；
  // 第三方无作者件此前错落「官方」（作者行与来源徽标两把尺），改落来源名（如 "encaron-fx/fx-bulk"）。
  return authorLabel(entry.author) ?? (entry.official ? "官方" : (entry.sourceName ?? "社区"));
}

export function dlText(n?: number): string | undefined {
  if (n === undefined) return undefined;
  return n.toLocaleString();
}

export function statusOfCard(entry: CatalogEntry, ctx: StoreCardContext): StatusTag {
  return statusTag(entry, { state: ctx.state, license: ctx.license });
}

/** 角标已出口的状态族——hover 徽标行不再重复（同一事实画两遍＝用户报的「两个价格」）。
 *  角标（CornerTag）永远显示最要紧的那一个状态；这里只留**非状态**徽标（来源/内置/失败）。 */
const STATUS_BADGE_KINDS = new Set(["price", "soon", "expired", "owned", "installed", "update", "muted"]);

export function badgesOfCard(entry: CatalogEntry, ctx: StoreCardContext): BadgeDesc[] {
  return allBadges(entry, { state: ctx.state, core: ctx.core, license: ctx.license }).filter(
    (b) => !STATUS_BADGE_KINDS.has(b.kind),
  );
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

/** 媒体舞台变体——一个 `Art`，五处排版（17 §3.3；⛔ 第二套 stage/画廊） */
export type ArtVariant = "hero" | "mega" | "duo" | "split" | "wall" | "detail";

/**
 * 封面/大图区——**唯一媒体入口**（17 §3.3 五态）。
 *
 * 一个 stage：生成式底纹（永远垫在帧下）＋ 1~3 静帧（`data-frames` 驱动 CSS 轮播）
 * ＋ 可选的封面视频（只有 `hero` 输出 `<video>`，controls/preload=metadata，⛔ autoplay）。
 * 帧 404 只移除该帧，底纹露出——不白块、不跳布局。
 */
export function Art({
  entry,
  identity,
  variant,
  className,
}: {
  entry: CatalogEntry;
  identity?: LocalIdentity;
  variant: ArtVariant;
  className?: string;
}) {
  const { t } = useTranslation();
  const hue = entryHue(entry);
  const model = mediaOf(entry);
  // 视频只喂 hero：卡内永远只轮静帧（⛔ 卡内 <video>）
  const playVideo = variant === "hero" && model.video;
  const frames = playVideo ? [] : model.frames;
  const cls = `marketplace-store-art is-${variant} ${className ?? ""}`.trim();
  return (
    <div
      className={cls}
      style={{ ["--marketplace-hue" as string]: hue }}
      data-media={model.kind}
      data-frames={frames.length}
    >
      {/* 生成式底纹（同一件，不是第二套）：有图时被盖住；图 404/未加载时自动露出 */}
      <div className="marketplace-store-art-gen" aria-hidden="true">
        <span className="marketplace-store-art-watermark">{t(entry.name)}</span>
        <span className="marketplace-store-art-genico">
          <PluginIcon pluginId={entry.id} manifest={pickIdentityArt(identity, entry)} alt="" />
        </span>
        <span className="marketplace-store-art-tag">{tCategory(t, entry)} · LinkDesk</span>
      </div>
      {playVideo && model.video && (
        <video
          className="marketplace-store-art-video"
          src={model.video.url}
          poster={model.video.poster}
          controls
          preload="metadata"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("{{name}} 介绍视频——作者直链，点击播放（不自动播放）", { name: entry.name })}
        />
      )}
      {frames.map((src, i) => (
        <img
          key={src}
          className={`marketplace-store-art-frame ${i === 0 ? "is-on" : ""}`.trim()}
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          onError={(e) => {
            // 坏图只拆这一帧，底纹会露出来（⛔ 白块/布局跳）
            e.currentTarget.remove();
          }}
        />
      ))}
      {model.video && (
        <span className="marketplace-store-art-vbadge">
          {variant === "hero" ? t("作者视频 · 直链") : t("含视频")}
        </span>
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
