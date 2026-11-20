/**
 * AuthorHero — 作者店的大屏轮播（每个店面的第一视觉；第 2 个起按声明顺序就地渲染）。
 *
 * 与首页 Hero 的区别只在**数据来源**（作者 `sections.slides[]` vs 官方 banner 合集）与标题归属：
 * 视觉/交互同一套（箭头/圆点、hover 1.02＋环境辉光走 CSS），⛔ 另造一套轮播视觉。
 * 槽位判定归 `AuthorStoreView`（只有第 1 个 hero 置顶）——本件只认「给我这几张」。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, entryHue, Icon } from "../../../ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import { actionOfCard, Art, dlText, jobLabelOf, tAuthor } from "../cards/cardParts";
import { useStore } from "../StoreContext";

export interface AuthorHeroSlideView {
  entry: CatalogEntry;
  tag?: string;
}

export function AuthorHero({ slides }: { slides: AuthorHeroSlideView[] }) {
  const { t } = useTranslation();
  const { data, actions } = useStore();
  const [idx, setIdx] = useState(0);
  if (slides.length === 0) return null;
  const current = slides[Math.min(idx, slides.length - 1)];
  const go = (n: number) => setIdx(((n % slides.length) + slides.length) % slides.length);
  const hud = entryHue(current.entry);
  return (
    <>
      <div
        className="marketplace-store-hero"
        style={{ ["--marketplace-hue" as string]: hud }}
        data-hint={
          slides.length > 1
            ? t("左右箭头 / 圆点翻页（共 {{count}} 张轮播）", { count: slides.length })
            : undefined
        }
      >
        <div className="marketplace-store-hero-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
          {slides.map(({ entry, tag }) => {
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
                  <span className="marketplace-store-hero-tag">{tag ?? t("作者精选")}</span>
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
              className={`marketplace-store-hero-dot ${i === idx ? "is-on" : ""}`}
              aria-label={t("第{{index}}张", { index: i + 1 })}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default AuthorHero;
