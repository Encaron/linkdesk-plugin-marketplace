/**
 * HeroCarousel — **首页 hero 与作者店 hero 的唯一实现**（一套视觉/滚轮/箭头/圆点）。
 *
 * 为什么抽出来（2026-11-22 用户实机）：作者店此前是第二套 `AuthorHero`——箭头放在
 * `overflow:hidden` 的 `.hero` 里，右箭头被裁一半；且没有滚轮监听 ⇒ 同一件东西在官方店正常、
 * 在作者店坏。现在两边共用本件：箭头在 `.hero-wrap` 外沟槽（F10）、滚轮换页、无操作提示。
 * 数据差异只在 `slides` 与 `tag`：官方传 banner.title，作者传 sections.slides[].tag（缺省「作者精选」）。
 */

import { useEffect, useRef, useState } from "react";
import { lt } from "../../services/i18nText";
import { useTranslation } from "react-i18next";
import { useStickyClearance } from "./cards/useStickyClearance";
import { ActionButton, entryHue, Icon } from "../../ui";
import type { CatalogEntry } from "../../services/marketCatalog";
import { actionOfCard, Art, dlText, jobLabelOf, tAuthor } from "./cards/cardParts";
import { useStore } from "./StoreContext";

export interface HeroCarouselSlide {
  entry: CatalogEntry;
  tag?: string;
}

export function HeroCarousel({ slides }: { slides: HeroCarouselSlide[] }) {
  const { t } = useTranslation();
  const clearance = useStickyClearance<HTMLDivElement>({ mode: "lift" });
  const { data, actions } = useStore();
  const [idx, setIdx] = useState(0);
  const heroRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (slides.length <= 1) return;
    const el = heroRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (Math.abs(ev.deltaY) < 4) return;
      const dir = ev.deltaY > 0 ? 1 : -1;
      const next = idx + dir;
      // 到端：不 preventDefault，交给页面滚动（⛔ 把用户困在轮播里）
      if (next < 0 || next >= slides.length) return;
      ev.preventDefault();
      setIdx(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [idx, slides.length]);

  if (slides.length === 0) return null;
  const clamped = Math.min(idx, slides.length - 1);
  const current = slides[clamped];
  const hud = entryHue(current.entry);
  const go = (n: number) => setIdx(((n % slides.length) + slides.length) % slides.length);

  return (
    <>
      <div className="marketplace-store-hero-wrap">
        <div
          ref={(el) => {
            heroRef.current = el;
            clearance.ref.current = el;
          }}
          onPointerEnter={clearance.onPointerEnter}
          onPointerLeave={clearance.onPointerLeave}
          onFocus={clearance.onFocus}
          onBlur={clearance.onBlur}
          className="marketplace-store-hero"
          style={{ ["--marketplace-hue" as string]: hud }}
        >
          <div className="marketplace-store-hero-track" style={{ transform: `translateX(-${clamped * 100}%)` }}>
            {slides.map(({ entry, tag }) => {
              const ctx = data.ctxOf(entry);
              const action = actionOfCard(entry, ctx, jobLabelOf(t, ctx.job));
              const dl = dlText(ctx.dl);
              const label = t("{{name}}——查看详情", { name: lt(entry, "name") });
              return (
                <div
                  key={entry.id}
                  className="marketplace-store-hero-slide"
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  onClick={() => actions.onOpen(entry)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      actions.onOpen(entry);
                    }
                  }}
                >
                  <div className="marketplace-store-hero-copy">
                    <span className="marketplace-store-hero-tag">{tag ?? t("作者精选")}</span>
                    <h2>{lt(entry, "name")}</h2>
                    {lt(entry, "description") && <p>{lt(entry, "description")}</p>}
                    <div className="marketplace-store-hero-meta">
                      <span>
                        {t("作者")} <b>{tAuthor(entry)}</b>
                      </span>
                      {dl && (
                        <span>
                          ▾ <b>{dl}</b> {t("下载")}
                        </span>
                      )}
                      <span>v{entry.version}</span>
                    </div>
                    <div className="marketplace-store-hero-cta">
                      <ActionButton action={action} onAct={(id) => actions.onAct(entry, id)} />
                    </div>
                  </div>
                  <Art entry={entry} identity={ctx.installedIdentity} variant="hero" />
                </div>
              );
            })}
          </div>
        </div>
        {slides.length > 1 && (
          <>
            <button
              type="button"
              className="marketplace-store-hero-arrow is-l"
              aria-label={t("上一张")}
              onClick={() => go(idx - 1)}
            >
              <Icon name="chevron-left" size="sm" />
            </button>
            <button
              type="button"
              className="marketplace-store-hero-arrow is-r"
              aria-label={t("下一张")}
              onClick={() => go(idx + 1)}
            >
              <Icon name="chevron-right" size="sm" />
            </button>
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div className="marketplace-store-hero-nav">
          {slides.map((s, i) => (
            <button
              key={s.entry.id}
              type="button"
              className={`marketplace-store-hero-dot ${i === clamped ? "is-on" : ""}`}
              aria-label={t("第{{index}}张", { index: i + 1 })}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default HeroCarousel;
