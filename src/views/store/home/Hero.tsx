/**
 * Hero — 英雄横幅轮播（官方策展位：`collections[layout:"banner"]`；3~5 张封顶由数据声明）。
 *
 * 交互（08 §一·7 / 07 §三）：滚轮**只在可前进方向**劫持，到首/尾放行（⛔ 困住用户）；箭头/圆点同效；
 * hover 整幅 1.02＋封面色环境辉光（CSS，transform-only）。无 banner 声明 ⇒ 槽 1 空着（不占位不留白）。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, entryHue, Icon } from "../../../ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import { actionOfCard, Art, dlText, jobLabelOf, tAuthor } from "../cards/cardParts";
import { useStore } from "../StoreContext";

export function Hero() {
  const { t } = useTranslation();
  const { data, actions } = useStore();
  const banner = data.catalog.collections.find((c) => c.layout === "banner");
  const byId = new Map(data.catalog.entries.map((e) => [e.id, e]));
  const slides = (banner?.items ?? []).map((id) => byId.get(id)).filter((e): e is CatalogEntry => !!e).slice(0, 5);
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
      // 到头：不 preventDefault，交给页面滚动（⛔ 旧版无限循环把用户困在轮播里）
      if (next < 0 || next >= slides.length) return;
      ev.preventDefault();
      setIdx(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [idx, slides.length]);

  if (!banner || slides.length === 0) return null;
  const current = slides[Math.min(idx, slides.length - 1)];
  const go = (n: number) => setIdx(((n % slides.length) + slides.length) % slides.length);

  return (
    <section className="marketplace-store-sec" data-spec="04-6">
      <div
        ref={heroRef}
        className="marketplace-store-hero"
        style={{ ["--marketplace-hue" as string]: entryHue(current) }}
        data-hint={t("鼠标滚轮 / 左右箭头 / 圆点 翻页（共 {{count}} 张轮播）", { count: slides.length })}
      >
        <div className="marketplace-store-hero-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
          {slides.map((entry) => {
            const ctx = data.ctxOf(entry);
            const action = actionOfCard(entry, ctx, jobLabelOf(t, ctx.job));
            const dl = dlText(ctx.dl);
            const label = t("{{name}}——查看详情", { name: entry.name });
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
                  <span className="marketplace-store-hero-tag">{banner.title}</span>
                  <h2>{entry.name}</h2>
                  {entry.description && <p>{entry.description}</p>}
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
                <Art entry={entry} identity={ctx.installedIdentity} className="is-hero" />
              </div>
            );
          })}
        </div>
        {slides.length > 1 && (
          <>
            <button type="button" className="marketplace-store-hero-arrow is-l" aria-label={t("上一张")} onClick={() => go(idx - 1)}>
              <Icon name="chevron-left" size="sm" />
            </button>
            <button type="button" className="marketplace-store-hero-arrow is-r" aria-label={t("下一张")} onClick={() => go(idx + 1)}>
              <Icon name="chevron-right" size="sm" />
            </button>
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div className="marketplace-store-hero-nav">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`marketplace-store-hero-dot ${i === idx ? "is-on" : ""}`}
              aria-label={t("第{{index}}张", { index: i + 1 })}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default Hero;
