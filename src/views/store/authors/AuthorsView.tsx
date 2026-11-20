/**
 * AuthorsView — 作者列表页（rail「作者」，08 §三·v3.36/v3.52）：
 * 全部启用作者＋排序（名称/插件数/仓库数）＋平铺⇄详细；点卡/行进入作者店。
 *
 * 归一化：平铺 = 首页同款 `AuthorCard`（不另抄一份卡）；详细 = 作者行；
 * 排序 chips 与视图 seg 走 `src/ui` 唯一来源，偏好经 context 写 `ui.prefs`（06 §八）。
 */

import { useTranslation } from "react-i18next";
import { EmptyState, SortChips, SORT_SETS, ViewSeg, hueBG, hueOf, Icon } from "../../../ui";
import type { AuthorDomain } from "../../../services/authors";
import { useAuthorDomains } from "../../../services/authors";
import type { AuthorSort } from "../../../services/marketplaceShared/uiPrefs";
import { useStore } from "../StoreContext";
import { AuthorCard } from "./AuthorCard";
import { authorPluginCount, sortAuthorDomains } from "./authorsData";

function AuthorRow({ domain, onOpen }: { domain: AuthorDomain; onOpen: () => void }) {
  const { t } = useTranslation();
  const hue = hueOf(domain.authorId);
  return (
    <div
      className="marketplace-store-card marketplace-store-author-row"
      role="button"
      tabIndex={0}
      aria-label={t("{{name}}——进入作者主页", { name: domain.name })}
      data-author={domain.authorId}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="marketplace-store-author-row-av" style={hueBG(hue)}>
        {domain.name.slice(0, 1)}
      </span>
      <div className="marketplace-store-author-row-main">
        <div className="marketplace-store-author-row-name">
          {domain.name}
          <span className={`marketplace-store-author-row-tag ${domain.official ? "is-official" : ""}`}>
            {domain.official ? t("官方 ✓") : "GitHub"}
          </span>
        </div>
        {domain.intro && <div className="marketplace-store-author-row-sub">{domain.intro}</div>}
      </div>
      <span className="marketplace-store-src-pill">
        <b>{domain.repos.length}</b> {t("个仓库")}
      </span>
      <span className="marketplace-store-src-pill">
        <b>{authorPluginCount(domain)}</b> {t("个插件")}
      </span>
      <span className="marketplace-store-author-row-go">
        <Icon name="chevron-right" size="sm" />
      </span>
    </div>
  );
}

export function AuthorsView() {
  const { t } = useTranslation();
  const { data, prefs, setAuthorSort, setAuthorView, navigate, addSource } = useStore();
  const { domains } = useAuthorDomains(data.catalog.entries.length);
  const list = sortAuthorDomains(domains, prefs.authorSort as AuthorSort);
  const totalPlugins = list.reduce((n, d) => n + authorPluginCount(d), 0);
  const open = (domain: AuthorDomain) => navigate({ page: "author", authorId: domain.authorId });

  return (
    <>
      <div className="marketplace-store-head-sub marketplace-store-page-sub">
        {list.length
          ? t("{{count}} 位第三方作者 · 共 {{plugins}} 个插件——点任一作者进入其店铺", {
              count: list.length,
              plugins: totalPlugins,
            })
          : t("第三方作者的店会出现在这里——先添加市场源")}
      </div>
      {list.length > 0 && (
        <div className="marketplace-store-toolbar">
          <span className="marketplace-store-tb-label">{t("排序")}</span>
          <SortChips
            value={prefs.authorSort}
            options={SORT_SETS.author}
            onChange={(v) => setAuthorSort(v as AuthorSort)}
          />
          <ViewSeg value={prefs.authorView} onChange={setAuthorView} />
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState
          icon="user"
          title={t("还没有作者源")}
          sub={t("到「来源」添加市场源后，作者会出现在这里")}
          action={
            <button type="button" className="marketplace-ui-btn is-primary" onClick={addSource}>
              {t("添加市场源")}
            </button>
          }
        />
      ) : prefs.authorView === "grid" ? (
        <div className="marketplace-store-author-grid">
          {list.map((domain) => (
            <AuthorCard key={domain.authorId} domain={domain} onOpen={() => open(domain)} />
          ))}
        </div>
      ) : (
        <div className="marketplace-store-author-list">
          {list.map((domain) => (
            <AuthorRow key={domain.authorId} domain={domain} onOpen={() => open(domain)} />
          ))}
        </div>
      )}
    </>
  );
}

export default AuthorsView;
