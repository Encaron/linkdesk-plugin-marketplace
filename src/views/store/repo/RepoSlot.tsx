/**
 * RepoSlot — 仓库首页的**槽 2：当前作者的仓库卡横排**（19 §2.1/§2.2；硬保留，作者声明管不到）。
 *
 * 规则：
 *   - 只列**当前作者**的仓（⛔ 其他作者、⛔ 官方伪卡）；
 *   - 顺序读 `reposInOrder`（唯一真相源 = marketplaceSources 数组；D4），⛔ 读作者块原始数组；
 *   - 当前仓高亮 `aria-current`；单仓照实一张（不假装扇出）；
 *   - 长按整卡 380ms 拖动，与本作者其他仓卡**交换**（跨作者/官方核心仓拒绝）；
 *     键盘兜底 Alt+←/→/↑/↓；
 *   - 右侧常驻「查看全部 N 个插件」→ 全部插件页（19 §七）。
 */

import { useCallback } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { authorHueOf } from "../authors/authorHue";
import { lt } from "../../../services/i18nText";
import { swapRepos } from "../../../services/sourceAdmin";
import { orderedReposOf, useSourceOrder } from "../../../services/sourceOrderStore";
import { showToast } from "../../../services/hostApi";
import type { AuthorRepoView } from "../../../services/authors";
import { isOfficialCoreRepo } from "../../../services/officialRepo";
import { AuthorSwitchCard } from "../authors/AuthorCard";
import { Strip } from "../Strip";
import { useStore } from "../StoreContext";
import { useSwapDrag } from "../drag/useSwapDrag";

export function RepoSlot() {
  const { t } = useTranslation();
  const { data, navigate, contentRef } = useStore();
  const order = useSourceOrder(data.catalog.entries, data.authorDomains);
  const { domain, repo, authorId } = data.repo;
  const repos = domain ? orderedReposOf(order, domain) : repo ? [repo] : [];

  const reject = useCallback(
    (reason: "cross-author" | "locked") => {
      showToast(
        reason === "cross-author"
          ? t("仓库只能在同一个作者内交换")
          : t("这个仓库固定在最前，不能换位置"),
        { key: "swap-repos", severity: "warning", ttl: 2400 },
      );
    },
    [t],
  );

  const doSwap = useCallback(
    async (repoA: string, repoB: string): Promise<boolean> => {
      if (repoA === repoB) return false;
      const r = await swapRepos(authorId, repoA, repoB);
      if (!r.ok) {
        reject(r.reason === "locked" ? "locked" : "cross-author");
        return false;
      }
      return true;
    },
    [authorId, reject],
  );

  const { bind } = useSwapDrag({
    scrollRef: contentRef,
    onSwap: (source, target) => {
      if (!source.repoId || !target.repoId) return false;
      if (source.authorId !== target.authorId) {
        reject("cross-author");
        return false;
      }
      return doSwap(source.repoId, target.repoId);
    },
    onReject: reject,
  });

  if (repos.length === 0) return null;

  const onCardKeyDown = (e: KeyboardEvent<HTMLElement>, r: AuthorRepoView, index: number) => {
    if (!e.altKey) return;
    const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
    if (!dir) return;
    const other = repos[index + dir];
    if (!other) return;
    e.preventDefault();
    if (isOfficialCoreRepo(authorId, r.id) || isOfficialCoreRepo(authorId, other.id)) {
      reject("locked");
      return;
    }
    void doSwap(r.id, other.id);
  };

  const authorName = domain?.name ?? authorId;

  return (
    <section className="marketplace-store-sec marketplace-store-repo-slot" data-spec="04-6-repo-slot">
      <div className="marketplace-store-repo-slot-row">
        <Strip ariaLabel={t("仓库切换")}>
          {repos.map((r, index) => {
            const current = r.id === repo?.id;
            const core = isOfficialCoreRepo(authorId, r.id);
            return (
              <AuthorSwitchCard
                key={r.id}
                title={lt(r, "name")}
                badge={`${authorName} · ${data.repo.official ? t("官方 ✓") : t("社区源")}`}
                intro={lt(r, "intro")}
                meta={t("{{count}} 个插件", { count: r.plugins.length })}
                goLabel={current ? t("当前仓库") : t("进入仓库")}
                current={current}
                icon={data.repo.official ? "bag" : "folder"}
                authorId={authorId}
                repoId={r.id}
                image={r.image ?? (core ? "linkdesk://marketplace/resources/repo-official.svg" : undefined)}
                hue={authorHueOf(authorId)}
                onOpen={() => data.repo.setRepo({ authorId, repoId: r.id })}
                ariaLabel={t("{{name}}——切换到该仓库", { name: lt(r, "name") })}
                drag={{
                  attrs: {
                    "data-swap-kind": "repo",
                    "data-swap-author": authorId,
                    "data-swap-repo": r.id,
                    ...(core ? { "data-swap-locked": "1" } : {}),
                  },
                  onPointerDown: bind(
                    { kind: "repo", authorId, repoId: r.id },
                    { locked: core },
                  ).onPointerDown,
                  onKeyDown: (e) => onCardKeyDown(e, r, index),
                }}
              />
            );
          })}
        </Strip>
        <button
          type="button"
          className="marketplace-ui-btn is-primary marketplace-store-repo-all"
          disabled={data.repo.entries.length === 0}
          onClick={() => navigate({ page: "repo-all" })}
        >
          {t("查看全部 {{count}} 个插件", { count: data.repo.entries.length })}
        </button>
      </div>
    </section>
  );
}

export default RepoSlot;
