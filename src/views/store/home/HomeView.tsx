/**
 * HomeView — 仓库首页（19 §2.1；D1/D3）。
 *
 * 槽位（固定，不受作者声明摆布）：
 *   槽 1 = 第一个 hero（没有 = 空着，槽 2 成第一视觉）；
 *   槽 2 = 当前作者的仓库卡横排（硬保留；RepoSlot）；
 *   槽 3+ = 作者声明板块（`sections` 原顺序，第 2 个 hero 起就地渲染）；
 *   页面底部 = 「按分类浏览」瓷片（商店标准件）。
 *
 * 首页 = `currentRepo.homepage`；⛔ 不再有官方作者区/跨作者内容。
 * 官方仓没有 `authors/official.json` ⇒ `useRepoSections` 用目录根 `collections[]` 合成缺省骨架。
 */

import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../ui";
import { useStore } from "../StoreContext";
import { RepoSlot } from "../repo/RepoSlot";
import { RepoCategoryTiles, RepoHero, RepoSection, useRepoSections } from "../repo/repoSections";

export function HomeView() {
  const { t } = useTranslation();
  const { data } = useStore();
  const sections = useRepoSections(data.repo);
  const heroIndex = sections.findIndex((s) => s.type === "hero");
  const hero = heroIndex >= 0 ? sections[heroIndex] : undefined;
  const rest = sections.filter((_, i) => i !== heroIndex);

  return (
    <>
      {hero && <RepoHero repo={data.repo} section={hero} />}
      <RepoSlot />
      {data.repo.entries.length === 0 ? (
        <section className="marketplace-store-sec">
          <EmptyState
            icon="dots"
            title={t("「{{name}}」暂无插件", { name: data.repo.name })}
            sub={t("作者还没往这个仓库上架插件——过阵子再来看看，或换一个仓库")}
          />
        </section>
      ) : (
        rest.map((section, i) => (
          <RepoSection
            key={`${section.type}:${section.collection ?? section.title ?? ""}:${i}`}
            repo={data.repo}
            section={section}
          />
        ))
      )}
      <RepoCategoryTiles repo={data.repo} />
    </>
  );
}

export default HomeView;
