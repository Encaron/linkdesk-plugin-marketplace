/**
 * AuthorDock — 右侧竖向作者坞（19 §6；D2）。
 *
 * 收起态 = 胶囊（前 3 位作者头像 + N）；hover 展开、点击固定；选中态跨页保持 = `currentRepo.authorId`；
 * 空隙不收起（单一容器 pointerleave 才收）；横向离开才收回。
 *
 * 落点（D2）：点作者卡 → **该作者首位仓库首页**（顺序模型 `reposInOrder` 的第一仓），
 * 同时写 `currentRepo`、关闭面板。卡下方扇出该作者各仓（只读展示）。
 * 底部：「作者页」/「管理来源」＋一次性提示（× 关闭、`?` 重开、`ui.prefs.dockTipDismissed` 记住）。
 * 窄容器（≤760px）降级为右下按钮 + 底部抽屉（不依赖 hover）。
 *
 * ⛔ 作者/仓顺序只读 `sourceOrderStore`（与作者页/槽 2 同一份）；本地组不出现。
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { hueBG, hueOf, Icon } from "../../../ui";
import { useAuthorDomains } from "../../../services/authors";
import { orderedAuthorsOf, orderedReposOf, useSourceOrder } from "../../../services/sourceOrderStore";
import { writeUIPrefs } from "../../../services/marketplaceShared/uiPrefs";
import { useStore } from "../StoreContext";

export function AuthorDock() {
  const { t } = useTranslation();
  const { data, navigate, prefs } = useStore();
  const { domains } = useAuthorDomains(data.catalog.entries.length);
  const order = useSourceOrder(data.catalog.entries, domains);
  const authors = orderedAuthorsOf(order, domains);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;

  const currentAuthorId = data.repo.authorId.toLowerCase();
  const selected = authors.find((a) => a.authorId.toLowerCase() === currentAuthorId);
  const selectedRepos = selected ? orderedReposOf(order, selected) : [];

  const close = useCallback(() => {
    setPinned(false);
    setHovered(false);
  }, []);

  const openAuthor = useCallback(
    (authorId: string) => {
      const domain = authors.find((a) => a.authorId.toLowerCase() === authorId.toLowerCase());
      if (!domain) return;
      const first = orderedReposOf(order, domain)[0];
      if (!first) {
        navigate({ page: "authors", authorMode: "browse" });
        close();
        return;
      }
      data.repo.setRepo({ authorId: domain.authorId, repoId: first.id });
      navigate({ page: "home" });
      close();
    },
    [authors, order, data.repo, navigate, close],
  );

  const setTip = (dismissed: boolean) => {
    void writeUIPrefs({ dockTipDismissed: dismissed }).catch(() => {});
  };

  if (authors.length === 0) return null;

  const capsuleFaces = authors.slice(0, 3);

  return (
    <div
      className={`marketplace-store-dock ${expanded ? "is-open" : ""} ${pinned ? "is-pinned" : ""}`.trim()}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        if (!pinned) setHovered(false);
      }}
    >
      <button
        type="button"
        className="marketplace-store-dock-capsule"
        aria-expanded={expanded}
        aria-label={t("作者列表")}
        data-hint={expanded ? undefined : t("作者列表")}
        onClick={() => setPinned((v) => !v)}
      >
        <span className="marketplace-store-dock-faces" aria-hidden="true">
          {capsuleFaces.map((a) => (
            <span key={a.authorId} className="marketplace-store-dock-face" style={hueBG(hueOf(a.authorId))}>
              {a.name.slice(0, 1)}
            </span>
          ))}
        </span>
        {authors.length > capsuleFaces.length && (
          <span className="marketplace-store-dock-more">+{authors.length - capsuleFaces.length}</span>
        )}
        <span className="marketplace-store-dock-capsule-label">{t("作者")}</span>
      </button>

      {expanded && (
        <div className="marketplace-store-dock-panel" role="region" aria-label={t("作者列表")}>
          <div className="marketplace-store-dock-head">
            <b>{t("作者")}</b>
            <span className="marketplace-store-dock-count">{t("{{count}} 位", { count: authors.length })}</span>
          </div>
          <div className="marketplace-store-dock-list">
            {authors.map((a) => {
              const active = a.authorId.toLowerCase() === currentAuthorId;
              const repoCount = orderedReposOf(order, a).length;
              return (
                <button
                  key={a.authorId}
                  type="button"
                  className={`marketplace-store-dock-author ${active ? "is-active" : ""}`.trim()}
                  aria-current={active ? "true" : undefined}
                  onClick={() => openAuthor(a.authorId)}
                >
                  <span className="marketplace-store-dock-av" style={hueBG(hueOf(a.authorId))}>
                    {a.name.slice(0, 1)}
                  </span>
                  <span className="marketplace-store-dock-main">
                    <span className="marketplace-store-dock-name">{a.name}</span>
                    <span className="marketplace-store-dock-sub">
                      {t("{{count}} 个仓库", { count: repoCount })}
                    </span>
                  </span>
                  {active && <span className="marketplace-store-dock-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {selected && selectedRepos.length > 1 && (
            <div className="marketplace-store-dock-fan" aria-label={t("{{name}} 的仓库", { name: selected.name })}>
              {selectedRepos.map((r) => (
                <span key={r.id} className="marketplace-store-dock-repo">
                  <b>{r.name}</b>
                  <i>{t("{{count}} 个插件", { count: r.plugins.length })}</i>
                </span>
              ))}
            </div>
          )}

          <div className="marketplace-store-dock-foot">
            <button
              type="button"
              className="marketplace-store-dock-link"
              onClick={() => {
                navigate({ page: "authors", authorMode: "browse" });
                close();
              }}
            >
              {t("作者页")}
            </button>
            <button
              type="button"
              className="marketplace-store-dock-link"
              onClick={() => {
                navigate({ page: "authors", authorMode: "manage" });
                close();
              }}
            >
              {t("管理来源")}
            </button>
            {!prefs.dockTipDismissed && (
              <span className="marketplace-store-dock-tip">
                <span>{t("进入「作者页」或「管理来源」可调整顺序")}</span>
                <button
                  type="button"
                  className="marketplace-store-dock-tip-x"
                  aria-label={t("关闭提示")}
                  onClick={() => setTip(true)}
                >
                  <Icon name="x" size="sm" />
                </button>
              </span>
            )}
            {prefs.dockTipDismissed && (
              <button
                type="button"
                className="marketplace-store-dock-tip-reopen"
                aria-label={t("查看排序提示")}
                data-hint={t("查看排序提示")}
                onClick={() => setTip(false)}
              >
                ?
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AuthorDock;
