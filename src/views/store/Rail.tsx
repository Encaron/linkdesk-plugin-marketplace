/**
 * Rail — 商店三段式左栏（04 §七）：顶部「首页＝品牌块」／中部滚动「浏览（分类＋排行榜）」／
 * 底部固定「库＋作者＋来源」（紧凑行，库带已装数、作者带作者数、来源带失败红点）。
 *
 * 数据全部来自 context（唯一属主 = StoreView）：分类顺序 = `CatalogLoadResult.railOrder`（声明消费），
 * 计数 = `countByBucket`（空桶 0 灰显保留，⛔ 空桶不产出瓷片）；⛔ 本件不重算分类。
 *
 * 键盘（U3）：rail 内 ←→↑↓ 移动焦点（绑容器，重绘不失效）。
 */

import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../../ui";
import { localizeCategory } from "../../services/marketCategories";
import { useStore } from "./StoreContext";
import { sameRoute, type StoreRoute } from "./navigation";

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
  const { data, route, navigate, scrollTop, unreadCats, unreadAuthors } = useStore();
  const { railOrder, errors } = data.catalog;
  const counts = data.railOrderCounts;
  const active = route.page;
  const activeCategory = route.page === "category" ? route.category : undefined;

  const railRef = useRef<HTMLElement | null>(null);

  /* 窄窗横条（≤900 时 rail 竖转横）：鼠标纵向滚轮→横向滚动；到端放行给页面滚动。
     竖排 rail（flex-direction ≠ row）或无横向溢出时不接管。原生监听必须 passive:false 才能 preventDefault。 */
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (getComputedStyle(el).flexDirection !== "row") return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      if (Math.abs(ev.deltaX) < 2 && Math.abs(ev.deltaY) < 2) return;
      const delta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
      const next = Math.min(max, Math.max(0, el.scrollLeft + delta));
      if (next === el.scrollLeft) return; // 到端放行
      ev.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onKeyDown = useCallback((ev: React.KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(ev.key)) return;
    const items = [...(ev.currentTarget.querySelectorAll("button:not([disabled])") as NodeListOf<HTMLElement>)];
    const i = items.indexOf(ev.target as HTMLElement);
    if (i < 0) return;
    const fwd = ev.key === "ArrowDown" || ev.key === "ArrowRight";
    items[(i + (fwd ? 1 : -1) + items.length) % items.length].focus();
    ev.preventDefault();
  }, []);

  /* 跳哪聚焦哪：路由落到某个 rail 项时，把那一项滚进可视区（竖排滚 `.rail-scroll`，
     窄窗横条滚 rail 本体）——否则「全部榜单」等落点排在 rail 底部，用户看不到自己跳到了哪。
     ⛔ 只滚 rail 自己的容器，不动主内容滚动位；尊重 reduced-motion。 */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const key = active === "category" ? activeCategory : active;
    if (!key) return;
    const item = rail.querySelector<HTMLElement>(`[data-rail-item="${key}"]`);
    if (!item) return;
    const behavior: ScrollBehavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    const pad = 8;
    if (getComputedStyle(rail).flexDirection === "row") {
      // 窄窗：整条 rail 横向滚动，所有项同在一行
      const r = item.getBoundingClientRect();
      const c = rail.getBoundingClientRect();
      if (r.left < c.left) rail.scrollBy({ left: r.left - c.left - pad, behavior });
      else if (r.right > c.right) rail.scrollBy({ left: r.right - c.right + pad, behavior });
      return;
    }
    // 竖排：只有中段「浏览」区自己的滚动容器会裁内容；品牌块/底栏始终可见
    const scroller = rail.querySelector<HTMLElement>(".marketplace-store-rail-scroll");
    if (!scroller || !scroller.contains(item)) return;
    const r = item.getBoundingClientRect();
    const c = scroller.getBoundingClientRect();
    if (r.top < c.top) scroller.scrollBy({ top: r.top - c.top - pad, behavior });
    else if (r.bottom > c.bottom) scroller.scrollBy({ top: r.bottom - c.bottom + pad, behavior });
  }, [active, activeCategory]);

  /* 点已定位的 rail 项 = 回顶；否则正常导航（`sameRoute` 精确比对，带 authorId/official 的
     分类页点 rail 会落回全量分类，⛔ 不被误判成「已在该页」） */
  const go = (target: StoreRoute) => {
    if (sameRoute(route, target)) {
      scrollTop();
      return;
    }
    navigate(target);
  };

  return (
    <nav ref={railRef} className="marketplace-store-rail" aria-label={t("商店分类导航")} onKeyDown={onKeyDown}>
      <div className="marketplace-store-rail-top">
        <button
          type="button"
          className={`marketplace-store-rail-home ${active === "home" ? "is-active" : ""}`}
          onClick={() => go({ page: "home" })}
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
              onClick={() => go({ page: "category", category: slug })}
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
          onClick={() => go({ page: "rank" })}
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
          onClick={() => go({ page: "library" })}
          aria-current={active === "library" ? "page" : undefined}
          data-rail-item="library"
        >
          <Icon name="folder" size="sm" />
          {t("库")}
          <span
            className={`marketplace-store-rail-count ${data.updateCount ? "is-warn" : ""}`}
            data-hint={
              data.updateCount
                ? t("已安装 {{installed}} 个 · {{count}} 个可更新", { installed: data.installedCount, count: data.updateCount })
                : t("已安装 {{installed}} 个", { installed: data.installedCount })
            }
          >
            {data.installedCount}
          </span>
        </button>
        <button
          type="button"
          className={`marketplace-store-rail-item is-compact ${active === "authors" ? "is-active" : ""}`}
          onClick={() => go({ page: "authors" })}
          aria-current={active === "authors" ? "page" : undefined}
          data-rail-item="authors"
        >
          <Icon name="user" size="sm" />
          {t("作者")}
          <span
            className="marketplace-store-rail-count"
            data-hint={t("{{count}} 位作者", { count: data.authorCount })}
          >
            {data.authorCount}
          </span>
          {/* 2026-11-23 用户实机：只画一个点——两个点叠在同一个位置（绝对定位）⇒ 显示「有源加载失败」优先 */}
          {errors.length > 0 ? (
            <span className="marketplace-store-rail-dot" data-hint={t("有源加载失败")} />
          ) : unreadAuthors.size > 0 ? (
            <span className="marketplace-store-rail-dot is-new" data-hint={t("有新内容")} />
          ) : null}
        </button>
      </div>
    </nav>
  );
}

export default Rail;
