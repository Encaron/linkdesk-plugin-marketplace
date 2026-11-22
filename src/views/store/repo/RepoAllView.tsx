/**
 * RepoAllView — 全部插件页（19 §七；入口 = 仓库首页槽 2 右侧「查看全部 N 个插件」）。
 *
 * 页面 = 返回仓首页 + 仓库卡横排（当前作者各仓，共享顺序）+ 全部插件网格 + 底部本仓分类瓷片。
 * 撤掉 hero / 合集 / 作者声明板块；范围 = currentRepo；⛔ 不跨仓混合。
 * 空仓 = 诚实空态（不显示分类瓷片）。
 */

import { useTranslation } from "react-i18next";
import { EmptyState, Icon } from "../../../ui";
import { CardGrid } from "../cards/CardGrid";
import { SectionHead } from "../home/SectionHead";
import { RepoSlot } from "../repo/RepoSlot";
import { RepoCategoryTiles } from "../repo/repoSections";
import { useStore } from "../StoreContext";

export function RepoAllView() {
  const { t } = useTranslation();
  const { data, actions, navigate } = useStore();
  const repo = data.repo;

  return (
    <>
      <div className="marketplace-store-crumb marketplace-store-repo-all-crumb">
        <button type="button" className="marketplace-store-back" onClick={() => navigate({ page: "home" })}>
          <Icon name="chevron-left" size="sm" />
          {t("返回「{{repo}}」首页", { repo: repo.name })}
        </button>
        <span className="marketplace-store-repo-all-count">
          {t("{{count}} 个插件", { count: repo.entries.length })}
        </span>
      </div>
      <RepoSlot />
      <section className="marketplace-store-sec" data-spec="04-7-repo-all">
        <SectionHead title={t("全部插件")} hint={t("「{{repo}}」里的全部插件", { repo: repo.name })} />
        {repo.entries.length === 0 ? (
          <EmptyState
            icon="dots"
            title={t("「{{name}}」暂无插件", { name: repo.name })}
            sub={t("作者还没往这个仓库上架插件——过阵子再来看看")}
          />
        ) : (
          <div className="marketplace-store-grid">
            {repo.entries.map((entry) => (
              <CardGrid key={entry.id} entry={entry} ctx={data.ctxOf(entry)} handlers={actions} />
            ))}
          </div>
        )}
      </section>
      {repo.entries.length > 0 && <RepoCategoryTiles repo={repo} />}
    </>
  );
}

export default RepoAllView;
