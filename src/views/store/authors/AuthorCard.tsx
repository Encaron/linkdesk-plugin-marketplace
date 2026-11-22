/**
 * AuthorCard — 作者卡（蓝图 v3.30）：头像/名/徽标/简介/**仓卡扇出 hover**。
 *
 * 归一化（10 §一）：首页作者栏与作者页「平铺」共用**这一件**（08 §二·v3.52），⛔ 各页抄一份卡。
 * 三边界由数据自然退化（⛔ 硬编码判断）：
 *   - 1 仓：单张满宽卡＋「唯一仓库」，不假装扇出；
 *   - 2~3 仓：逐张扇开；
 *   - 4+ 仓：前 2 ＋「+N 个仓库」汇总卡（容量收敛）；
 *   - 0 件仓：仓卡照实写「0 个插件」，进店给诚实空态。
 *
 * 动效全部长在卡片自身表面（transform/opacity/颜色；⛔ 无实体凸起层/portal——08 §二）。
 */

import type { KeyboardEvent, PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { hueBG, hueOf, Icon, type IconName } from "../../../ui";
import { OFFICIAL_AUTHOR_ID, type AuthorDomain } from "../../../services/authors";
import { authorDeckOf, authorDeckRestCount, authorPluginCount } from "./authorsData";
import { useAvatarSrc } from "./useAvatarSrc";

function authorBadgeText(t: (k: string, o?: Record<string, unknown>) => string, domain: AuthorDomain): string {
  const base = `${domain.official ? t("官方 ✓") : t("社区源")} · ${t("{{count}} 个仓库", {
    count: domain.repos.length,
  })}`;
  return domain.authorId === OFFICIAL_AUTHOR_ID ? base : `${base} · ${t("身份：GitHub")}`;
}

export function AuthorCard({
  domain,
  onOpen,
  className,
}: {
  domain: AuthorDomain;
  onOpen: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  /** 头像取源唯一口（远端 → 本地缓存 Blob → 失败回落首字母），与来源行/坞胶囊同源。 */
  const { src: avatarSrc, onError: onAvatarError } = useAvatarSrc(domain.authorId, domain.avatar);
  const showAvatar = !!avatarSrc;
  const hue = hueOf(domain.authorId);
  const solo = domain.repos.length === 1;
  const deckRest = authorDeckRestCount(domain.repos);
  const items = authorDeckOf(domain.repos);
  const label = t("{{name}}——进入该作者首位仓库，名下 {{count}} 个仓库", {
    name: domain.name,
    count: domain.repos.length,
  });
  return (
    <div
      className={`marketplace-store-card marketplace-store-author-card has-deck ${solo ? "is-solo" : ""} ${className ?? ""}`.trim()}
      role="button"
      tabIndex={0}
      aria-label={label}
      data-author={domain.authorId}
      style={{ ["--marketplace-hue" as string]: hue }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="marketplace-store-ac-top">
        <span className="marketplace-store-ac-avatar" style={hueBG(hue)}>
          {showAvatar ? (
            <img
              className="marketplace-store-ac-avatar-img"
              src={avatarSrc ?? undefined}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={onAvatarError}
            />
          ) : (
            <span className="marketplace-store-ac-avatar-letter" aria-hidden="true">
              {domain.name.slice(0, 1)}
            </span>
          )}
          <span className="marketplace-store-ac-ring" aria-hidden="true" />
        </span>
        <div className="marketplace-store-fx1">
          <div className="marketplace-store-ac-name">{domain.name}</div>
          <div className="marketplace-store-ac-badge">{authorBadgeText(t, domain)}</div>
        </div>
      </div>
      {domain.intro && <div className="marketplace-store-ac-intro">{domain.intro}</div>}
      <div className="marketplace-store-ac-deck" aria-hidden="true">
        {items.map((item, i) => (
          <span
            key={`${item.name}:${i}`}
            className={`marketplace-store-ac-repo ${item.more ? "is-more" : ""}`}
            style={{ ["--i" as string]: i }}
          >
            <b>{item.more ? t("{{count}} 个仓库", { count: deckRest }) : item.name}</b>
            <i>
              {t("{{count}} 个插件", { count: item.count })}
              {solo ? ` · ${t("唯一仓库")}` : ""}
            </i>
          </span>
        ))}
      </div>
      <div className="marketplace-store-ac-meta">
        <span>{t("{{count}} 个插件", { count: authorPluginCount(domain) })}</span>
        <span className="marketplace-store-ac-go">
          {t("进入首位仓库")}
          <Icon name="chevron-right" size="sm" />
        </span>
      </div>
      <span className="marketplace-store-ac-sheen" aria-hidden="true" />
    </div>
  );
}

/**
 * AuthorSwitchCard — 作者店内的**门店切换卡**（09 §二：门店卡＝作者卡同款组件；
 * 官方卡恒排第一位＝返回官方；自有仓随后，当前仓 ring；⛔ 第四方）。
 *
 * 2026-11-22（19 §4.2）：同一张卡在首页槽 2 / 全部插件页顶部也用来切仓；长按拖动能力经
 * `drag` 注入（同一套 pointer 控制器），⛔ 另造一张卡。
 */
export function AuthorSwitchCard({
  title,
  badge,
  intro,
  meta,
  goLabel,
  current,
  hue,
  icon,
  onOpen,
  ariaLabel,
  drag,
}: {
  title: string;
  badge: string;
  intro?: string;
  meta: string;
  goLabel: string;
  current?: boolean;
  hue?: string;
  icon?: IconName;
  onOpen: () => void;
  ariaLabel: string;
  /** 拖动控制器注入（data-* 属性 + pointerdown；本件不关心 swap 语义） */
  drag?: {
    attrs: Record<string, string | undefined>;
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  };
}) {
  return (
    <div
      className={`marketplace-store-card marketplace-store-author-card is-switch ${current ? "is-on" : ""}`.trim()}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-current={current ? "true" : undefined}
      style={hue ? ({ ["--marketplace-hue" as string]: hue }) : undefined}
      {...drag?.attrs}
      onPointerDown={drag?.onPointerDown}
      onClick={onOpen}
      onKeyDown={(e) => {
        drag?.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="marketplace-store-ac-top">
        <span
          className={`marketplace-store-ac-avatar ${hue ? "" : "is-muted"}`.trim()}
          style={hue ? hueBG(hue) : undefined}
        >
          <Icon name={icon ?? "folder"} />
        </span>
        <div className="marketplace-store-fx1">
          <div className="marketplace-store-ac-name">{title}</div>
          <div className="marketplace-store-ac-badge">{badge}</div>
        </div>
      </div>
      {intro && <div className="marketplace-store-ac-intro">{intro}</div>}
      <div className="marketplace-store-ac-meta">
        <span>{meta}</span>
        <span className="marketplace-store-ac-go">
          {goLabel}
          <Icon name="chevron-right" size="sm" />
        </span>
      </div>
    </div>
  );
}

export default AuthorCard;
