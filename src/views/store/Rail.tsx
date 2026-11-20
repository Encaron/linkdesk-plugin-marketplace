/**
 * Rail — 商店三段式左栏（04 §七）：顶部「首页＝品牌块」／中部滚动「浏览（分类＋排行榜）」／
 * 底部固定「库＋作者＋来源」（紧凑行，库带已装数、作者带作者数、来源带失败红点）。
 *
 * 数据全部来自 context（唯一属主 = StoreView）：分类顺序 = `CatalogLoadResult.railOrder`（声明消费），
 * 计数 = `countByBucket`（空桶 0 灰显保留，⛔ 空桶不产出瓷片）；⛔ 本件不重算分类。
 *
 * 键盘（U3）：rail 内 ←→↑↓ 移动焦点（绑容器，重绘不失效）。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../../ui";
import { localizeCategory } from "../../services/marketCategories";
import { useStore } from "./StoreContext";

const CATEGORY_ICON: Record<string, IconName> = {
  development: "code",
  documents: "filetext",
  hardware: "plug",
  network: "network",
  productivity: "zap",
  themes: "palette",
  reading: "book",
  entertainment: "gamepad",
  other: "dots",
};

function iconOf(slug: string): IconName {
  return CATEGORY_ICON[slug] ?? "dots";
}

export function Rail() {
  const { t } = useTranslation();
  const { data, route, navigate, unreadCats } = useStore();
  const { railOrder, errors } = data.catalog;
  const counts = data.railOrderCounts;
  const active = route.page;
  const activeCategory = route.page === "category" ? route.category : undefined;

  const onKeyDown = useCallback((ev: React.KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(ev.key)) return;
    const items = [...(ev.currentTarget.querySelectorAll("button:not([disabled])") as NodeListOf<HTMLElement>)];
    const i = items.indexOf(ev.target as HTMLElement);
    if (i < 0) return;
    const fwd = ev.key === "ArrowDown" || ev.key === "ArrowRight";
    items[(i + (fwd ? 1 : -1) + items.length) % items.length].focus();
    ev.preventDefault();
  }, []);

  return (
    <nav className="marketplace-store-rail" aria-label={t("商店分类导航")} onKeyDown={onKeyDown}>
      <div className="marketplace-store-rail-top">
        <button
          type="button"
          className={`marketplace-store-rail-home ${active === "home" ? "is-active" : ""}`}
          onClick={() => navigate({ page: "home" })}
          aria-current={active === "home" ? "page" : undefined}
          data-rail-item="home"
        >
          <span className="marketplace-store-rail-hi">
            <Icon name="home" />
          </span>
          <span className="marketplace-store-rail-htx">
            <span className="marketplace-store-rail-ht">{t("首页")}</span>
            <span className="marketplace-store-rail-hs">Plugin Store</span>
          </span>
        </button>
      </div>

      <div className="marketplace-store-rail-scroll">
        <div className="marketplace-store-rail-label">{t("浏览")}</div>
        {railOrder.map((slug) => {
          const count = counts.get(slug) ?? 0;
          const empty = count === 0;
          return (
            <button
              type="button"
              key={slug}
              className={`marketplace-store-rail-item ${activeCategory === slug ? "is-active" : ""} ${empty ? "is-empty" : ""}`}
              data-hint={empty ? t("暂无插件") : undefined}
              aria-current={activeCategory === slug ? "page" : undefined}
              onClick={() => navigate({ page: "category", category: slug })}
              data-rail-item={slug}
            >
              <Icon name={iconOf(slug)} />
              {localizeCategory((key) => t(key), slug)}
              <span className="marketplace-store-rail-count">{count}</span>
              {unreadCats.has(slug) && <span className="marketplace-store-rail-dot is-new" data-hint={t("有新插件")} />}
            </button>
          );
        })}
        <div className="marketplace-store-rail-gap" />
        <button
          type="button"
          className={`marketplace-store-rail-item ${active === "rank" ? "is-active" : ""}`}
          onClick={() => navigate({ page: "rank" })}
          aria-current={active === "rank" ? "page" : undefined}
          data-rail-item="rank"
        >
          <Icon name="trend" />
          {t("排行榜")}
        </button>
      </div>

      <div className="marketplace-store-rail-foot">
        <button
          type="button"
          className={`marketplace-store-rail-item is-compact ${active === "library" ? "is-active" : ""}`}
          onClick={() => navigate({ page: "library" })}
          aria-current={active === "library" ? "page" : undefined}
          data-rail-item="library"
        >
          <Icon name="folder" size="sm" />
          {t("库")}
          <span
            className={`marketplace-store-rail-count ${data.updateCount ? "is-warn" : ""}`}
            data-hint={data.updateCount ? t("{{count}} 个可更新", { count: data.updateCount }) : t("已安装数")}
          >
            {data.updateCount || data.installedCount}
          </span>
        </button>
        <button
          type="button"
          className={`marketplace-store-rail-item is-compact ${active === "authors" ? "is-active" : ""}`}
          onClick={() => navigate({ page: "authors" })}
          aria-current={active === "authors" ? "page" : undefined}
          data-rail-item="authors"
        >
          <Icon name="user" size="sm" />
          {t("作者")}
          <span className="marketplace-store-rail-count">{data.authorSourceCount}</span>
        </button>
        <button
          type="button"
          className={`marketplace-store-rail-item is-compact ${active === "sources" ? "is-active" : ""}`}
          onClick={() => navigate({ page: "sources" })}
          aria-current={active === "sources" ? "page" : undefined}
          data-rail-item="sources"
        >
          <Icon name="link" size="sm" />
          {t("来源")}
          {errors.length > 0 && <span className="marketplace-store-rail-dot" data-hint={t("有源加载失败")} />}
        </button>
      </div>
    </nav>
  );
}

export default Rail;
