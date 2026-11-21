/**
 * AuthorStoreView — 作者店：**声明驱动渲染器**（09 §二；R4-3.9）。
 *
 * 恒定骨架（槽位，不是 API）：
 *   槽 1 首视觉 = **第一个 hero**（只有第 1 个占置顶；第 2 个起按声明顺序就地渲染）；
 *   槽 2 门店卡横排 = 官方卡（恒排第一＝返回官方）＋作者自有仓（当前仓 ring；⛔ 第四方）；
 *   槽 3+ = 声明板块（hero/collection/grid/rank 按 sections 原顺序）；
 *   末尾 = **「按分类浏览」硬保留**（作者删不掉；只筛**当前仓**，⛔ 跨仓串味——U4 修复）。
 *
 * 声明纪律：
 *   - 板块名/副题/跳转字文案全归作者；渲染器 ⛔ 自创板块名；
 *   - `more.target` 封闭集合：`category:<slug>`（全局分类页＋authorId 预过滤）/ `rank` / `repo:<id>`；
 *   - `rank.scope`：缺省全源合并，"self" = 只算店主自己的插件；
 *   - `glow:false`（板块级或合集级都认）→ 整块回落中性阴影（⛔ 自定辉光色）；
 *   - 引用不存在的合集 → 跳过该板块（警告在来源页作者行显示，⛔ 静默吞）。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, hueOf } from "../../../ui";
import type { CatalogEntry, CollectionDecl } from "../../../services/marketCatalog";
import { groupByPrimaryCategory, primaryCategoryOf } from "../../../services/marketCatalog";
import type { AuthorDomain, AuthorMoreDecl, AuthorRepoView, AuthorSectionDecl } from "../../../services/authors";
import { OFFICIAL_AUTHOR_ID, useAuthorDomain } from "../../../services/authors";
import { localizeCategory } from "../../../services/marketCategories";
import { CardGrid } from "../cards/CardGrid";
import { CategoryTile } from "../cards/CategoryTile";
import { RankRow } from "../cards/RankRow";
import { categoryIcon } from "../categoryIcon";
import { rankEntries } from "../storeData";
import { CollectionRenderer } from "../CollectionRenderer";
import { SectionHead } from "../home/SectionHead";
import { Strip } from "../Strip";
import { useStore } from "../StoreContext";
import { HeroCarousel, type HeroCarouselSlide } from "../HeroCarousel";
import { AuthorSwitchCard } from "./AuthorCard";

/** 跳转字 target 的封闭集合判定（⛔ 任意 URL；非法 target = 不渲染该字） */
function resolveMore(
  more: AuthorMoreDecl | undefined,
  domain: AuthorDomain,
  navigate: ReturnType<typeof useStore>["navigate"],
): { label: string; onClick: () => void } | null {
  const label = more?.label;
  const target = more?.target;
  if (!label || !target) return null;
  if (target === "rank") return { label, onClick: () => navigate({ page: "rank" }) };
  if (target.startsWith("category:")) {
    const slug = target.slice("category:".length);
    if (!slug) return null;
    return {
      label,
      onClick: () => navigate({ page: "category", category: slug, authorId: domain.authorId }),
    };
  }
  if (target.startsWith("repo:")) {
    const repoId = target.slice("repo:".length);
    if (!repoId) return null;
    return { label, onClick: () => navigate({ page: "author", authorId: domain.authorId, repoId }) };
  }
  return null;
}

function resolveSlides(section: AuthorSectionDecl, repo: AuthorRepoView): HeroCarouselSlide[] {
  const raw = section.slides?.length
    ? section.slides
    : section.plugin || section.tag
      ? [{ plugin: section.plugin, tag: section.tag }]
      : [];
  const out: HeroCarouselSlide[] = [];
  for (const slide of raw) {
    const entry = slide.plugin
      ? repo.plugins.find((p) => p.id === slide.plugin)
      : repo.plugins[0];
    if (!entry) continue;
    out.push({ entry, tag: slide.tag });
  }
  return out;
}

function CollectionBlock({
  section,
  collection,
  repo,
  domain,
}: {
  section: AuthorSectionDecl;
  collection: CollectionDecl;
  repo: AuthorRepoView;
  domain: AuthorDomain;
}) {
  const { navigate } = useStore();
  const items = collection.items
    .map((id) => repo.plugins.find((p) => p.id === id))
    .filter((e): e is CatalogEntry => !!e);
  const more = resolveMore(section.more ?? collection.more, domain, navigate);
  return <CollectionRenderer collection={collection} items={items} section={section} more={more} />;
}

export function AuthorStoreView({ authorId, repoId }: { authorId: string; repoId?: string }) {
  const { t } = useTranslation();
  const { data, actions, navigate, keepScroll } = useStore();
  const { domain, loading } = useAuthorDomain(authorId, data.catalog.entries.length);
  const [authorCat, setAuthorCat] = useState<string | null>(null);
  const repoForReset = domain?.repos.find((r) => r.id === repoId) ?? domain?.repos[0];
  useEffect(() => {
    setAuthorCat(null);
  }, [repoForReset?.id]);

  const repo = domain?.repos.find((r) => r.id === repoId) ?? domain?.repos[0];
  const dlOf = (entry: CatalogEntry) =>
    entry.downloadUrl ? data.counts.get(entry.downloadUrl) : undefined;

  if (loading) {
    return (
      <div className="marketplace-store-state-card" role="status">
        <span className="marketplace-ui-spin" aria-hidden="true" />
        <div>
          <b>{t("正在加载作者店…")}</b>
          <span>{t("读取该作者的作者块（authors/<id>.json）")}</span>
        </div>
      </div>
    );
  }
  if (!domain) {
    return (
      <EmptyState
        icon="user"
        title={t("作者主页不存在")}
        sub={t("该作者没有可读的作者块（authors/<id>.json）——v1 源照常进统一池，但不产生作者域")}
        action={
          <button type="button" className="marketplace-ui-btn is-secondary" onClick={() => navigate({ page: "home" })}>
            {t("返回首页")}
          </button>
        }
      />
    );
  }
  if (!repo) {
    return (
      <EmptyState
        icon="folder"
        title={t("该作者还没有声明任何仓库")}
        sub={t("这个作者还没有仓库")}
      />
    );
  }

  const sections = repo.homepage?.sections ?? [];
  const heroIndex = sections.findIndex((s) => s.type === "hero");
  const heroSlides = heroIndex >= 0 ? resolveSlides(sections[heroIndex], repo) : [];
  const rest = sections.filter((_, i) => i !== heroIndex);
  const storeTitle = repo.storeTitle ?? domain.storeTitle ?? t("{{name}} 的 Plugin Store", { name: domain.name });
  const hue = hueOf(domain.authorId);
  const categories = groupByPrimaryCategory(repo.plugins, data.catalog.railOrder);
  const catFilterEntries = authorCat
    ? repo.plugins.filter((e) => primaryCategoryOf(e) === authorCat)
    : [];

  const renderSection = (section: AuthorSectionDecl, idx: number) => {
    const noGlow = section.glow === false;
    if (section.type === "grid") {
      const title = section.title ?? t("全部插件");
      if (repo.plugins.length === 0) {
        return (
          <section key={`grid:${idx}`} className={`marketplace-store-sec ${noGlow ? "is-no-glow" : ""}`.trim()}>
            <SectionHead title={title} hint={section.hint ?? repo.intro} />
            <EmptyState
              icon="dots"
              title={t("「{{name}}」暂无插件", { name: repo.name })}
              sub={t("作者还没往这个仓库上架插件——过阵子再来看看")}
            />
          </section>
        );
      }
      return (
        <section key={`grid:${idx}`} className={`marketplace-store-sec ${noGlow ? "is-no-glow" : ""}`.trim()}>
          <SectionHead title={title} hint={section.hint ?? repo.intro} />
          <div className="marketplace-store-grid">
            {repo.plugins.map((entry) => (
              <CardGrid key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
            ))}
          </div>
        </section>
      );
    }
    if (section.type === "hero") {
      const slides = resolveSlides(section, repo);
      if (slides.length === 0) return null;
      return (
        <section key={`hero:${idx}`} className={`marketplace-store-sec ${noGlow ? "is-no-glow" : ""}`.trim()}>
          <SectionHead title={section.title ?? t("大屏推荐")} hint={section.hint} />
          <HeroCarousel slides={slides} />
        </section>
      );
    }
    if (section.type === "rank") {
      const pool = section.scope === "self" ? repo.plugins : data.catalog.entries;
      const rows = rankEntries(pool, dlOf, section.top ?? 6);
      if (rows.length === 0) return null;
      const more = resolveMore(section.more, domain, navigate);
      return (
        <section key={`rank:${idx}`} className={`marketplace-store-sec ${noGlow ? "is-no-glow" : ""}`.trim()}>
          <SectionHead title={section.title ?? t("排行榜")} hint={section.hint} more={more ?? undefined} />
          <div>
            {rows.map((entry, i) => (
              <RankRow key={entry.id} entry={entry} index={i + 1} ctx={data.ctxOf(entry)} handlers={actions} />
            ))}
          </div>
        </section>
      );
    }
    const collection = section.collection
      ? data.catalog.collections.find((c) => c.id === section.collection)
      : undefined;
    if (!collection) return null; // 引用不存在的合集：跳过（警告在来源页）
    return (
      <CollectionBlock
        key={`col:${section.collection}:${idx}`}
        section={section}
        collection={collection}
        repo={repo}
        domain={domain}
      />
    );
  };

  const officialStore = authorId === OFFICIAL_AUTHOR_ID;
  const officialCount = data.catalog.entries.filter((e) => e.official).length;
  return (
    <>
      <div className="marketplace-store-crumb">
        {officialStore ? (
          t("官方 Plugin Store · 官方内置与精选")
        ) : (
          <>
            {t("作者店内")} · <b>{domain.name}</b> · GitHub
          </>
        )}
      </div>

      {heroIndex >= 0 && heroSlides.length > 0 ? (
        <section className="marketplace-store-sec" data-spec="04-6-authors">
          <HeroCarousel slides={heroSlides} />
        </section>
      ) : null}

      <div className="marketplace-store-sec">
        <Strip ariaLabel={t("门店切换")}>
          {!officialStore && (
            <AuthorSwitchCard
              title={t("官方 Plugin Store")}
              badge={t("官方 · 点击返回")}
              intro={t("官方运营的插件与主题精选——覆盖全部分类。")}
              meta={t("{{count}} 个插件", { count: officialCount })}
              goLabel={t("返回官方")}
              icon="bag"
              hue={undefined}
              onOpen={() => navigate({ page: "home" })}
              ariaLabel={t("返回官方 Plugin Store")}
            />
          )}
          {domain.repos.map((r) => {
            const current = r.id === repo.id;
            return (
              <AuthorSwitchCard
                key={r.id}
                title={r.name}
                badge={officialStore ? t("内置") : t("作者自建仓库")}
                intro={r.intro}
                meta={t("{{count}} 个插件", { count: r.plugins.length })}
                goLabel={current ? t("当前仓库") : t("切换到该仓库")}
                current={current}
                icon={officialStore ? "bag" : r.image ? "folder" : "user"}
                hue={r.image ? hue : undefined}
                onOpen={() => navigate({ page: "author", authorId: domain.authorId, repoId: r.id })}
                ariaLabel={t("{{name}}——切换到该仓库", { name: r.name })}
              />
            );
          })}
        </Strip>
      </div>

      {sections.length === 0 && (
        <section className="marketplace-store-sec">
          <SectionHead title={t("全部插件")} hint={repo.intro} />
          {repo.plugins.length === 0 ? (
            <EmptyState
              icon="dots"
              title={t("「{{name}}」暂无插件", { name: repo.name })}
              sub={t("作者还没往这个仓库上架插件——过阵子再来看看")}
            />
          ) : (
            <div className="marketplace-store-grid">
              {repo.plugins.map((entry) => (
                <CardGrid key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
              ))}
            </div>
          )}
        </section>
      )}

      {rest.map((section, i) => renderSection(section, i))}

      <section className="marketplace-store-sec" data-spec="04-6-authors">
        <SectionHead
          title={t("按分类浏览")}
          hint={t("看该作者在这一类的全部插件——只列出作者实际有货的分类")}
        />
        {categories.length === 0 ? (
          <EmptyState
            icon="dots"
            title={t("「{{name}}」暂无插件", { name: repo.name })}
            sub={t("作者还没往这个仓库上架插件——过阵子再来看看")}
          />
        ) : (
          <>
            <div className="marketplace-store-tiles">
              {categories.map(({ slug, entries }) => (
                <CategoryTile
                  key={slug}
                  slug={slug}
                  label={localizeCategory((key) => t(key), slug)}
                  count={entries.length}
                  desc={undefined}
                  icon={categoryIcon(slug)}
                  onOpen={(s) =>
                    keepScroll(() => setAuthorCat((cur) => (cur === s ? null : s)))
                  }
                />
              ))}
            </div>
            {authorCat && (
              <div className="marketplace-store-grid marketplace-store-mt10">
                {catFilterEntries.length === 0 ? (
                  <EmptyState
                    icon="dots"
                    title={t("该分类下暂无插件")}
                    sub={t("再点一次该瓷片可收起")}
                    className="marketplace-store-cat-empty"
                  />
                ) : (
                  catFilterEntries.map((entry) => (
                    <CardGrid key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

export default AuthorStoreView;
