/**
 * repoSections — 仓库首页/全部插件页共用的**声明板块渲染**（19 §2.1/§七；⛔ 各页抄一套）。
 *
 * 槽位由调用方拼（hero → 槽 2 → 声明板块），本文件只负责「一块板块怎么画」：
 *   - 数据范围 = 当前仓 `repo.entries`（D1；⛔ 全源）；
 *   - hero/collection/rank/grid 四种板块与作者店原先的实现同源；
 *   - `more.target` 封闭集合：`category:` → 本仓分类页；`rank` → 本仓排行；`repo:` → 同作者切仓（D2）。
 */

import { useEffect, useMemo, useState } from "react";
import { lt } from "../../../services/i18nText";
import { useTranslation } from "react-i18next";
import { groupByPrimaryCategory } from "../../../services/marketCatalog";
import type { CatalogEntry, CollectionDecl } from "../../../services/marketCatalog";
import { localizeCategory } from "../../../services/marketCategories";
import type { AuthorMoreDecl, AuthorSectionDecl } from "../../../services/authors";
import type { ResolvedRepo } from "../../../services/repoContext";
import { CardGrid } from "../cards/CardGrid";
import { CategoryTile } from "../cards/CategoryTile";
import { RankRow } from "../cards/RankRow";
import { categoryIcon } from "../categoryIcon";
import { CollectionRenderer } from "../CollectionRenderer";
import { HeroCarousel, type HeroCarouselSlide } from "../HeroCarousel";
import { rankEntries } from "../storeData";
import { SectionHead } from "../home/SectionHead";
import { useStore } from "../StoreContext";

/** 生效的 homepage 板块（声明 → 缺省骨架） */
export function declaredSections(repo: ResolvedRepo): AuthorSectionDecl[] {
  return repo.homepage?.sections ?? [];
}

/**
 * 官方仓的缺省首页：真实官方目录没有 `authors/official.json` ⇒ 用目录根的 `collections[]`
 * 合成一份「hero（banner）+ 合集 + 热门下载」。这是**唯一**的官方缺省，⛔ 不进作者声明契约。
 */
export function syntheticOfficialSections(
  repo: ResolvedRepo,
  collections: readonly CollectionDecl[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): AuthorSectionDecl[] {
  const official = collections.filter((c) => c.official === true);
  const banner = official.find((c) => c.layout === "banner");
  const sections: AuthorSectionDecl[] = [];
  if (banner) {
    sections.push({
      type: "hero",
      slides: banner.items.slice(0, 5).map((plugin) => ({ plugin, tag: lt(banner, "title") })),
    });
  }
  for (const c of [...official]
    .filter((x) => x.layout !== "banner")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    sections.push({ type: "collection", collection: c.id });
  }
  sections.push({
    type: "rank",
    top: 8,
    title: t("热门下载"),
    hint: t("按下载量排序，取前 8"),
    more: { label: t("完整榜单"), target: "rank" },
  });
  return sections;
}

/** 首页板块流（声明的；官方仓无声明时走合成骨架；第三方无声明 = 全部插件网格） */
export function useRepoSections(repo: ResolvedRepo): AuthorSectionDecl[] {
  const { t } = useTranslation();
  const { data } = useStore();
  return useMemo(() => {
    const declared = declaredSections(repo);
    if (declared.length > 0) return declared;
    if (repo.official) return syntheticOfficialSections(repo, data.catalog.collections, t);
    return [{ type: "grid", title: t("全部插件") }];
  }, [repo, data.catalog.collections, t]);
}

function resolveMore(
  more: AuthorMoreDecl | undefined,
  repo: ResolvedRepo,
  navigate: ReturnType<typeof useStore>["navigate"],
  setRepo: (ref: { authorId: string; repoId: string }) => void,
): { label: string; onClick: () => void } | null {
  const label = lt(more, "label");
  const target = more?.target;
  if (!label || !target) return null;
  if (target === "rank") return { label, onClick: () => navigate({ page: "rank" }) };
  if (target.startsWith("category:")) {
    const slug = target.slice("category:".length);
    if (!slug) return null;
    return {
      label,
      onClick: () =>
        navigate({ page: "category", category: slug, authorId: repo.authorId, repoId: repo.repoId }),
    };
  }
  if (target.startsWith("repo:")) {
    const repoId = target.slice("repo:".length);
    if (!repoId) return null;
    return {
      label,
      onClick: () => {
        setRepo({ authorId: repo.authorId, repoId });
        navigate({ page: "home" });
      },
    };
  }
  return null;
}

function resolveSlides(section: AuthorSectionDecl, repo: ResolvedRepo): HeroCarouselSlide[] {
  const raw = section.slides?.length
    ? section.slides
    : section.plugin || section.tag
      ? [{ plugin: section.plugin, tag: section.tag }]
      : [];
  const out: HeroCarouselSlide[] = [];
  for (const slide of raw) {
    const entry = slide.plugin
      ? repo.entries.find((p) => p.id === slide.plugin)
      : repo.entries[0];
    if (!entry) continue;
    out.push({ entry, tag: lt(section, "tag") || slide.tag });
  }
  return out;
}

export function RepoHero({ repo, section }: { repo: ResolvedRepo; section: AuthorSectionDecl }) {
  const slides = resolveSlides(section, repo);
  if (slides.length === 0) return null;
  return (
    <section className="marketplace-store-sec" data-spec="04-6-hero">
      <HeroCarousel slides={slides} />
    </section>
  );
}

function RepoCollectionBlock({
  repo,
  section,
  collection,
}: {
  repo: ResolvedRepo;
  section: AuthorSectionDecl;
  collection: CollectionDecl;
}) {
  const { navigate, data } = useStore();
  const setRepo = data.repo.setRepo;
  const items = collection.items
    .map((id) => repo.entries.find((p) => p.id === id))
    .filter((e): e is CatalogEntry => !!e);
  const more = resolveMore(section.more ?? collection.more, repo, navigate, setRepo);
  return <CollectionRenderer collection={collection} items={items} section={section} more={more} />;
}

export function RepoSection({ repo, section }: { repo: ResolvedRepo; section: AuthorSectionDecl }) {
  const { t } = useTranslation();
  const { data, actions, navigate } = useStore();
  const noGlow = section.glow === false;
  const cls = `marketplace-store-sec ${noGlow ? "is-no-glow" : ""}`.trim();

  if (section.type === "hero") {
    const slides = resolveSlides(section, repo);
    if (slides.length === 0) return null;
    return (
      <section className={cls}>
        <SectionHead title={lt(section, "title") || t("大屏推荐")} hint={lt(section, "hint")} />
        <HeroCarousel slides={slides} />
      </section>
    );
  }
  if (section.type === "grid") {
    const title = lt(section, "title") || t("全部插件");
    if (repo.entries.length === 0) {
      return (
        <section className={cls}>
          <SectionHead title={title} hint={lt(section, "hint") || lt(repo.repo, "intro")} />
          <div className="marketplace-store-state-card" role="status">
            <b>{t("「{{name}}」暂无插件", { name: lt(repo, "name") })}</b>
            <span>{t("作者还没往这个仓库上架插件——过阵子再来看看")}</span>
          </div>
        </section>
      );
    }
    return (
      <section className={cls}>
        <SectionHead title={title} hint={lt(section, "hint") || lt(repo.repo, "intro")} />
        <div className="marketplace-store-grid">
          {repo.entries.map((entry) => (
            <CardGrid key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
          ))}
        </div>
      </section>
    );
  }
  if (section.type === "rank") {
    const dlOf = (entry: CatalogEntry) =>
      entry.downloadUrl ? data.counts.get(entry.downloadUrl) : undefined;
    const rows = rankEntries(repo.entries, dlOf, section.top ?? 6);
    if (rows.length === 0) return null;
    const more = resolveMore(section.more, repo, navigate, data.repo.setRepo);
    return (
      <section className={cls}>
        <SectionHead title={lt(section, "title") || t("排行榜")} hint={lt(section, "hint")} more={more ?? undefined} />
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
  if (!collection) return null; // 引用不存在的合集：跳过（作者自查警告在管理面）
  return <RepoCollectionBlock repo={repo} section={section} collection={collection} />;
}

/** 底部「按分类浏览」瓷片（商店标准件，作者删不掉；只列本仓有货分类）。
 *  19 §5.1：点瓷片 → **原地在下方展开**该分类的插件网格；再点收起（⛔ 跳分类页）。
 *  作者页/仓库首页/全部插件页共用这一件（⛔ 各写一套）。 */
export function RepoCategoryTiles({ repo }: { repo: ResolvedRepo }) {
  const { t } = useTranslation();
  const { data, keepScroll, actions } = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  // 切仓/换作者：展开态清零（一次性浏览条件，⛔ 跨仓记忆）
  useEffect(() => {
    setExpanded(null);
  }, [repo.authorId, repo.repoId]);
  const buckets = groupByPrimaryCategory(repo.entries, data.catalog.railOrder);
  if (buckets.length === 0) return null;
  const active = buckets.find((b) => b.slug === expanded);
  return (
    <section className="marketplace-store-sec" data-spec="04-7">
      <SectionHead
        title={t("按分类浏览")}
        hint={t("只列出「{{repo}}」里有的分类——点一下在下方展开，再点收起", { repo: lt(repo, "name") })}
      />
      <div className="marketplace-store-tiles">
        {buckets.map(({ slug, entries }) => (
          <CategoryTile
            key={slug}
            slug={slug}
            label={localizeCategory((key) => t(key), slug)}
            count={entries.length}
            icon={categoryIcon(slug)}
            expanded={expanded === slug}
            onOpen={(s) => keepScroll(() => setExpanded((cur) => (cur === s ? null : s)))}
          />
        ))}
      </div>
      {active && (
        <div className="marketplace-store-grid marketplace-store-mt10" data-cat-grid={active.slug}>
          {active.entries.map((entry) => (
            <CardGrid key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
          ))}
        </div>
      )}
    </section>
  );
}

