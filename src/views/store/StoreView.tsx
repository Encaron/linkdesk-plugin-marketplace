/**
 * StoreView — 主区 Plugin Store 的壳（R4-3.4；声明为 `contributes.views.main["marketplace-store"]`）。
 *
 * 职责（唯一属主）：路由/滚动位、搜索框、UI 偏好、筛选/chip、storeNav 意图消费、发现型已读、
 * 内容热更新壳、以及把「数据＋动作」经 StoreContext 注入各视图。子视图只读、不各存一份。
 *
 * 纪律：
 *   - 池层零 `@src/core/*`；一切壳能力走 services → window.linkdesk；
 *   - 状态变化保滚动位（机械守则）；切视图回原位（会话级记忆，⛔ pluginState）；
 *   - 标题/标签逻辑归壳：卡片点击只调 `tabs.create("plugin-detail",{pinned:true,label})`。
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getCachedUIPrefs, onUIPrefsChange, readUIPrefs, setViewPrefs, writeUIPrefs } from "../../services/marketplaceShared/uiPrefs";
import type { AuthorSort, LibSort, UIPrefs } from "../../services/marketplaceShared/uiPrefs";
import { showToast } from "../../services/hostApi";
import {
  catalogKeysOf,
  computeKeyHashes,
  EMPTY_DISCOVER_READS,
  markAllRead,
  markSeen,
  onDiscoverReadsChange,
  readDiscoverReads,
  unreadDiscoverKeys,
  type DiscoverReads,
} from "../../services/discoverReads";
import { notifyInfo } from "../../services/marketplaceShared/notifications";
import { OFFICIAL_AUTHOR_ID, refreshAuthorDomains } from "../../services/authors";
import { consumeStoreNavTarget, getStoreNavTarget, onStoreNavChange, setCurrentStoreRoute } from "../../services/storeNav";
import {
  checkContentNow,
  onContentWatchSettled,
  startContentWatch,
  stopContentWatch,
  type ContentWatchOutcome,
} from "../../services/contentWatch";
import type { CatSort, InstallFilters } from "./storeData";
import { EMPTY_FILTERS } from "./storeData";

import { StoreProvider, type StoreContextValue } from "./StoreContext";
import { useStoreData } from "./useStoreData";
import { checkUpdatesFromStore, refreshContentFromStore, useStoreActions } from "./useStoreActions";
import { HOME_ROUTE, readScroll, routeFromNav, routeKey, routeToNavTarget, sameRoute, saveScroll, type StoreRoute } from "./navigation";
import { Rail } from "./Rail";
import { StoreHeader } from "./StoreHeader";
import { ContentBar } from "./home/ContentBar";
import { CatalogGate } from "./home/CatalogState";
import { HomeView } from "./home/HomeView";
import { CategoryView } from "./browse/CategoryView";
import { SearchResultsView } from "./browse/SearchResultsView";
import { RankView } from "./browse/RankView";
import { LibraryView } from "./library/LibraryView";
import { AddSourceModal, type AddSourceMode } from "./sources/AddSourceModal";
import { LicenseModal } from "./LicenseModal";
import { requestLicenseDialog } from "../../services/licenseActions";
import { AuthorPageView } from "./authors/AuthorPageView";
import { AuthorStoreView } from "./authors/AuthorStoreView";
import { RepoAllView } from "./repo/RepoAllView";
import { AuthorDock } from "./dock/AuthorDock";
import type { CatalogEntry } from "../../services/marketCatalog";
import { Icon, type ViewMode } from "../../ui";

import "../../styles/ui/primitives.css";
import "../../styles/store/store-shell.css";
import "../../styles/store/store-cards.css";
import "../../styles/store/store-home.css";
import "../../styles/store/store-repo.css";
import "../../styles/store/store-dock.css";
import "../../styles/store/store-browse.css";
import "../../styles/store/store-authors.css";
import "../../styles/store/store-library.css";
import "../../styles/store/store-sources.css";

export default function StoreView({ isActive = true }: { isActive?: boolean }) {
  const { t } = useTranslation();
  const data = useStoreData();
  const [licenseEntry, setLicenseEntry] = useState<CatalogEntry | null>(null);
  /* F20（2026-11-21 用户口径）：许可弹窗首选壳共享对话框通道（与安装确认同机制）；
     壳面不可用（旧壳/预览/测试）才落本地 OverlayPortal 版 */
  const openLicense = useCallback(
    (entry: CatalogEntry) => {
      void requestLicenseDialog({ pluginName: entry.name, authorId: entry.authorId }).then((r) => {
        if (r === "unsupported") setLicenseEntry(entry);
        else if (r === "ok") data.refreshLicenses();
      });
    },
    [data],
  );
  const actions = useStoreActions(data.online, openLicense);

  const [route, setRoute] = useState<StoreRoute>(HOME_ROUTE);
  const [searchInput, setSearchInputState] = useState("");
  const [prefs, setPrefs] = useState<UIPrefs>(() => getCachedUIPrefs());
  const [filters, setFiltersState] = useState<InstallFilters>({ ...EMPTY_FILTERS });
  const [subChip, setSubChipState] = useState<string | null>(null);
  const [contentPending, setContentPending] = useState(false);
  const [contentAppliedAt, setContentAppliedAt] = useState<string | null>(null);
  const [discoverReads, setDiscoverReads] = useState<DiscoverReads>(EMPTY_DISCOVER_READS);
  const [addSourceMode, setAddSourceMode] = useState<AddSourceMode | null>(null);
  /** 内容区滚过一屏后浮出「回到顶部」钮 */
  const [showTop, setShowTop] = useState(false);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  // AI 友好读取面：每次实际导航后回写当前路由（marketplace.getState 读源；命令意图另有 storeNav 信箱）
  useEffect(() => {
    setCurrentStoreRoute(routeToNavTarget(route));
  }, [route]);
  const searchReturn = useRef<StoreRoute>(HOME_ROUTE);
  const lastScrollKey = useRef(routeKey(HOME_ROUTE));
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const nextOpenApplyRef = useRef(false);

  /* ── UI 偏好（视图/排序——唯一读写口；命令 setViewPrefs 写同一处） ── */
  useEffect(() => {
    let alive = true;
    void readUIPrefs()
      .then((p) => alive && setPrefs(p))
      .catch(() => {});
    const un = onUIPrefsChange(() => setPrefs(getCachedUIPrefs()));
    return () => {
      alive = false;
      un();
    };
  }, []);

  /* 作者页模式记忆（2026-11-23 用户口径）：路由**显式**带 authorMode（坞「作者页」/「管理来源」、
     命令面 openAuthors/openSources）⇒ 写回；直接点作者不带 ⇒ 用上次。写回走 ui.prefs，
     ⛔ 不落插件 dataDir（详情页不会多出「数据位置」行）。 */
  useEffect(() => {
    if (route.page !== "authors" || !route.authorMode) return;
    if (prefs.authorMode === route.authorMode) return;
    void writeUIPrefs({ authorMode: route.authorMode }).catch(() => {});
  }, [route.page, route.authorMode, prefs.authorMode]);

  const setCatView = useCallback((v: ViewMode) => {
    setPrefs((p) => ({ ...p, catView: v }));
    void setViewPrefs("cat", { view: v }).catch(() => {});
  }, []);
  const setCatSort = useCallback((s: CatSort) => {
    setPrefs((p) => ({ ...p, catSort: s }));
    void setViewPrefs("cat", { sort: s }).catch(() => {});
  }, []);
  const setAuthorView = useCallback((v: ViewMode) => {
    setPrefs((p) => ({ ...p, authorView: v }));
    void setViewPrefs("author", { view: v }).catch(() => {});
  }, []);
  const setAuthorSort = useCallback((s: AuthorSort) => {
    setPrefs((p) => ({ ...p, authorSort: s }));
    void setViewPrefs("author", { sort: s }).catch(() => {});
  }, []);
  const setLibView = useCallback((v: ViewMode) => {
    setPrefs((p) => ({ ...p, libView: v }));
    void setViewPrefs("lib", { view: v }).catch(() => {});
  }, []);
  const setLibSort = useCallback((s: LibSort) => {
    setPrefs((p) => ({ ...p, libSort: s }));
    void setViewPrefs("lib", { sort: s }).catch(() => {});
  }, []);

  /* ── 滚动位：切视图保存旧位、回原位（⛔ 弹回顶部）；状态变化用 keepScroll ── */
  const keepScroll = useCallback((fn: () => void) => {
    const top = contentRef.current?.scrollTop ?? 0;
    fn();
    requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.scrollTop = top;
    });
  }, []);

  /* 回顶（rail 二次点击 / 悬浮钮共用唯一出口）：只滚内容区，⛔ 不重载不清筛选 */
  const scrollTop = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const onContentScroll = useCallback(() => {
    setShowTop((contentRef.current?.scrollTop ?? 0) > 280);
  }, []);

  const navigate = useCallback((next: StoreRoute) => {
    const prev = routeRef.current;
    if (sameRoute(prev, next)) return;
    saveScroll(routeKey(prev), contentRef.current?.scrollTop ?? 0);
    if (next.page === "category" && next.category) void markSeen("category", next.category);
    if (next.page === "author" && next.authorId) void markSeen("author", next.authorId);
    // 作者列表页 = 作者入口；进入即清全部作者未读点（与分类/作者店同一「进入即已读」口径）
    if (next.page === "authors") void markAllRead("author");
    if (next.page !== "search") setSearchInputState("");
    setSubChipState(null); // 小类过滤是一次性浏览条件；切页清掉（排序/视图仍记忆）
    setRoute(next);
  }, []);

  /* 防旧意图/外部命令把官方落到作者店兜底页：官方主页 = 官方首页 */
  useEffect(() => {
    if (route.page === "author" && route.authorId === OFFICIAL_AUTHOR_ID) navigate(HOME_ROUTE);
  }, [route, navigate]);

  /* ── 搜索（键入即搜索；清空回原视图；焦点由常驻输入框保持） ── */
  const setSearchInput = useCallback(
    (v: string) => {
      setSearchInputState(v);
      const prev = routeRef.current;
      if (v.trim() === "") {
        if (prev.page === "search") navigate(searchReturn.current);
        return;
      }
      if (prev.page !== "search") {
        searchReturn.current = prev;
        saveScroll(routeKey(prev), contentRef.current?.scrollTop ?? 0);
        setRoute({ page: "search", query: v });
      } else {
        setRoute({ ...prev, query: v });
      }
    },
    [navigate],
  );

  const clearSearch = useCallback(() => {
    setSearchInputState("");
    if (routeRef.current.page === "search") navigate(searchReturn.current);
  }, [navigate]);

  useEffect(() => {
    if (route.page !== "search") return;
    const q = route.query ?? "";
    setSearchInputState((cur) => (cur === q ? cur : q));
  }, [route]);

  /* ── storeNav 意图（命令面：打开分类/搜索/库/作者/来源） ── */
  useEffect(() => {
    let alive = true;
    const apply = (target: ReturnType<typeof getStoreNavTarget>) => {
      const next = routeFromNav(target);
      if (next.page === "search" && !(next.query ?? "").trim()) {
        if (routeRef.current.page === "search") navigate(searchReturn.current);
        return;
      }
      navigate(next);
    };
    void consumeStoreNavTarget().then((target) => {
      if (!alive || target.page === "home") return;
      apply(target);
    });
    const un = onStoreNavChange(() => {
      const target = getStoreNavTarget();
      // home 也是真导航（`openStore` 的「回到首页」）；`consumeStoreNavTarget` 的复位不广播，不会误触发
      apply(target);
      void consumeStoreNavTarget(); // 消费后复位信箱，防冷启动回旧页
    });
    return () => {
      alive = false;
      un();
    };
  }, [navigate]);

  /* ── 滚动位恢复（仅在路由键变化时——搜索键入不重置滚动） ── */
  useLayoutEffect(() => {
    const key = routeKey(route);
    if (key === lastScrollKey.current) return;
    lastScrollKey.current = key;
    if (contentRef.current) contentRef.current.scrollTop = readScroll(key);
  }, [route]);

  /* ── 「/」聚焦搜索（商店激活时） ── */
  useEffect(() => {
    if (!isActive) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "/") return;
      const el = ev.target as HTMLElement | null;
      if (el && el.closest("input,textarea,select,[contenteditable=true]")) return;
      ev.preventDefault();
      searchRef.current?.focus();
    };
    // eslint-disable-next-line linkdesk/no-global-key-listener -- 蓝图 U3 规定的「/」聚焦搜索（商店激活限定；焦点在输入框时放行，不劫持其它键）
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive]);

  /* ── Esc：全部插件页无浮层时返回仓首页（19 §七/§8.2；不依赖浏览器后退） ── */
  useEffect(() => {
    if (!isActive) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (routeRef.current.page !== "repo-all") return;
      const el = ev.target instanceof HTMLElement ? ev.target : null;
      if (el?.closest("input,textarea,select,[contenteditable=true]")) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      ev.preventDefault();
      navigate(HOME_ROUTE);
    };
    // eslint-disable-next-line linkdesk/no-global-key-listener -- 页面级 Esc 返回（商店激活限定；输入框/浮层已放行）
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, navigate]);

  /* ── 发现型已读（数据面，`discoverReads` 唯一属主）：进入即已读（路由 effect 写入）＋
   *    contentHash 增量点集（R4-5.6/#12——键 ∉ 读集 ∪（已读但逐键签名变了，「又上新」重开点，
   *    06 §八·补））。rail 的 6px 点渲染路径棒 6 已就位，这里只供点集。 */
  useEffect(() => {
    let alive = true;
    void readDiscoverReads().then((r) => alive && setDiscoverReads(r));
    const un = onDiscoverReadsChange(() => {
      void readDiscoverReads().then((r) => alive && setDiscoverReads(r));
    });
    return () => {
      alive = false;
      un();
    };
  }, []);

  const keySetsAndHashes = useMemo(
    () => ({ keys: catalogKeysOf(data.catalog.entries), hashes: computeKeyHashes(data.catalog.entries) }),
    [data.catalog.entries],
  );
  const unreadCats = useMemo(
    () => new Set(unreadDiscoverKeys(discoverReads, keySetsAndHashes.keys, keySetsAndHashes.hashes).cats),
    [discoverReads, keySetsAndHashes],
  );
  const unreadAuthors = useMemo(
    () => new Set(unreadDiscoverKeys(discoverReads, keySetsAndHashes.keys, keySetsAndHashes.hashes).sources),
    [discoverReads, keySetsAndHashes],
  );

  /* ── 内容热更新（R4-5.6/#12）：触发面/节流/退避/contentHash 比对全在 `contentWatch` 服务，UI 只消费回执 ── */
  useEffect(() => {
    const un = onContentWatchSettled((o: ContentWatchOutcome) => {
      if (!o.ran || !o.changed) return;
      if (isActiveRef.current) {
        // 正在看该店：常驻条＋轻 Toast（带「刷新」动作）——⛔ 静默换内容（06 §六 §4）
        setContentPending(true);
        showToast(t("首页内容已更新 · 刷新"), {
          severity: "info",
          key: "content-updated",
          action: { title: t("刷新"), command: "marketplace.refreshCatalog" },
        });
      } else {
        nextOpenApplyRef.current = true; // 商店不可见时到达 → 下次打开直接应用（06 §六 §4）
      }
      // 持久记录（铃铛面板一条——忽略 ≠ 删除；06 §六 §3）
      notifyInfo(t("首页内容已更新——刷新后显示最新轮播与合集；你的滚动位置、筛选与排序会保留"));
    });
    startContentWatch();
    return () => {
      un();
      stopContentWatch();
    };
  }, [t]);

  useEffect(() => {
    if (!isActive) return;
    // 变更到达时商店不可见 → 下次打开直接应用＋一次性信息行（06 §六 §4）；随后照常走 60s 节流检查
    if (nextOpenApplyRef.current) {
      nextOpenApplyRef.current = false;
      void refreshContentFromStore().then((r) => {
        if (r.ok) {
          setContentAppliedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        }
      });
    }
    void checkContentNow("store-open");
  }, [isActive]);

  /* ── 手动动作（命令面唯一入口）── 完成路径轻反馈已收进 updateCheck 服务（R4-5.7 单入口：
      按钮与命令面共用一份，⛔ 视图再自弹一份） */
  const checkUpdates = useCallback(async () => {
    await checkUpdatesFromStore();
  }, []);

  const refreshContent = useCallback(async () => {
    const r = await refreshContentFromStore();
    if (!r.ok) {
      showToast(t("刷新内容失败"), { severity: "warning", key: "refresh-content" });
      return;
    }
    setContentPending(false);
    // 19 §8.5：全部刷新也要结果化（有更新报数量 / 已是最新）
    showToast(
      r.changed && data.updateCount > 0
        ? t("全部来源已刷新 · 发现 {{count}} 个更新", { count: data.updateCount })
        : t("全部来源已刷新 · 已是最新"),
      { severity: "success", key: "refresh-content" },
    );
  }, [t, data.updateCount]);

  const dismissContent = useCallback(() => setContentPending(false), []);
  const dismissApplied = useCallback(() => setContentAppliedAt(null), []);

  const openAddSource = useCallback((mode: "remote" | "local" = "remote") => setAddSourceMode(mode), []);
  const closeAddSource = useCallback(() => {
    setAddSourceMode(null);
    void refreshAuthorDomains();
  }, []);
  // 三落点（头部「＋」／作者区空态／来源页）统一打开弹窗——⛔ 导航到来源页占位（R4-3.15）
  const addSource = useCallback(() => openAddSource("remote"), [openAddSource]);

  const value: StoreContextValue = useMemo(
    () => ({
      data,
      actions,
      route,
      navigate,
      searchInput,
      setSearchInput,
      clearSearch,
      prefs,
      setCatView,
      setCatSort,
      setAuthorView,
      setAuthorSort,
      setLibView,
      setLibSort,
      filters,
      setFilters: setFiltersState,
      subChip,
      setSubChip: setSubChipState,
      unreadCats,
      unreadAuthors,
      contentPending,
      contentAppliedAt,
      refreshContent,
      dismissContent,
      dismissApplied,
      checkUpdates,
      addSource,
      openAddSource,
      keepScroll,
      scrollTop,
      contentRef,
    }),
    [
      data,
      actions,
      route,
      navigate,
      searchInput,
      setSearchInput,
      clearSearch,
      prefs,
      setCatView,
      setCatSort,
      setAuthorView,
      setAuthorSort,
      setLibView,
      setLibSort,
      filters,
      subChip,
      unreadCats,
      unreadAuthors,
      contentPending,
      contentAppliedAt,
      refreshContent,
      dismissContent,
      dismissApplied,
      checkUpdates,
      addSource,
      openAddSource,
      keepScroll,
      scrollTop,
      contentRef,
    ],
  );

  const category = route.page === "category" ? route.category || "other" : "";

  return (
    <StoreProvider value={value}>
      <div className="marketplace-store">
        <Rail />
        <div className="marketplace-store-content" ref={contentRef} role="main" tabIndex={-1} onScroll={onContentScroll}>
          <div className="marketplace-store-page">
            <StoreHeader searchRef={searchRef} />
            <ContentBar />
            <CatalogGate>
              {route.page === "home" && <HomeView />}
              {route.page === "repo-all" && <RepoAllView />}
              {route.page === "category" && <CategoryView slug={category} />}
              {route.page === "search" && <SearchResultsView />}
              {route.page === "rank" && <RankView />}
              {route.page === "authors" && <AuthorPageView mode={route.authorMode ?? prefs.authorMode} />}
              {route.page === "author" && (
                <AuthorStoreView
                  /* 只按作者 key：切仓（repoId 变）不重挂载，仓库横排保留滚动位；
                     作者换人才重挂载（新作者店从顶部开始）。 */
                  key={route.authorId ?? ""}
                  authorId={route.authorId ?? ""}
                  repoId={route.repoId}
                />
              )}
              {route.page === "library" && <LibraryView />}
            </CatalogGate>
          </div>
        </div>
        <AuthorDock />
        {showTop && (
          <button
            type="button"
            className="marketplace-store-top"
            onClick={scrollTop}
            aria-label={t("回到顶部")}
            data-hint={t("回到顶部")}
          >
            <Icon name="arrow-up" />
          </button>
        )}
        <AddSourceModal open={addSourceMode !== null} initialMode={addSourceMode ?? "remote"} onClose={closeAddSource} />
        {/* R4-3.21：许可弹窗（卡片「我有密钥/输入新密钥」的落点；公钥取条目 authorId 的作者块） */}
        <LicenseModal
          open={licenseEntry !== null}
          pluginName={licenseEntry?.name ?? ""}
          authorId={licenseEntry?.authorId}
          onClose={() => setLicenseEntry(null)}
          onVerified={data.refreshLicenses}
        />
      </div>
    </StoreProvider>
  );
}
