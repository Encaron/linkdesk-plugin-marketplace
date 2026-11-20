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

import { forceRefreshCatalog } from "../../services/marketSources";
import { getCachedUIPrefs, onUIPrefsChange, readUIPrefs, setViewPrefs } from "../../services/marketplaceShared/uiPrefs";
import type { AuthorSort, LibSort, UIPrefs } from "../../services/marketplaceShared/uiPrefs";
import { showToast } from "../../services/hostApi";
import { markSeen } from "../../services/discoverReads";
import { refreshAuthorDomains } from "../../services/authors";
import { consumeStoreNavTarget, getStoreNavTarget, onStoreNavChange } from "../../services/storeNav";
import { catalogSignature } from "../../services/marketCatalog";
import type { CatSort, InstallFilters } from "./storeData";
import { EMPTY_FILTERS } from "./storeData";

import { StoreProvider, type StoreContextValue } from "./StoreContext";
import { useStoreData } from "./useStoreData";
import { checkUpdatesFromStore, refreshContentFromStore, useStoreActions } from "./useStoreActions";
import { HOME_ROUTE, readScroll, routeFromNav, routeKey, sameRoute, saveScroll, type StoreRoute } from "./navigation";
import { Rail } from "./Rail";
import { StoreHeader } from "./StoreHeader";
import { ContentBar } from "./home/ContentBar";
import { CatalogGate, CatalogNote } from "./home/CatalogState";
import { HomeView } from "./home/HomeView";
import { CategoryView } from "./browse/CategoryView";
import { SearchResultsView } from "./browse/SearchResultsView";
import { RankView } from "./browse/RankView";
import { LibraryView } from "./library/LibraryView";
import { SourcesView } from "./sources/SourcesView";
import { AddSourceModal, type AddSourceMode } from "./sources/AddSourceModal";
import { LicenseModal } from "./LicenseModal";
import { AuthorsView } from "./authors/AuthorsView";
import { AuthorStoreView } from "./authors/AuthorStoreView";
import type { CatalogEntry } from "../../services/marketCatalog";
import type { ViewMode } from "../../ui";

import "../../styles/ui/primitives.css";
import "../../styles/store/store-shell.css";
import "../../styles/store/store-cards.css";
import "../../styles/store/store-home.css";
import "../../styles/store/store-browse.css";
import "../../styles/store/store-authors.css";
import "../../styles/store/store-library.css";
import "../../styles/store/store-sources.css";

const BACKGROUND_CHECK_MS = 60_000;
const FOCUS_CHECK_MS = 15 * 60_000;

export default function StoreView({ isActive = true }: { isActive?: boolean }) {
  const { t } = useTranslation();
  const data = useStoreData();
  const [licenseEntry, setLicenseEntry] = useState<CatalogEntry | null>(null);
  const actions = useStoreActions(data.online, setLicenseEntry);

  const [route, setRoute] = useState<StoreRoute>(HOME_ROUTE);
  const [searchInput, setSearchInputState] = useState("");
  const [prefs, setPrefs] = useState<UIPrefs>(() => getCachedUIPrefs());
  const [filters, setFiltersState] = useState<InstallFilters>({ ...EMPTY_FILTERS });
  const [subChip, setSubChipState] = useState<string | null>(null);
  const [contentPending, setContentPending] = useState(false);
  const [addSourceMode, setAddSourceMode] = useState<AddSourceMode | null>(null);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;
  const searchReturn = useRef<StoreRoute>(HOME_ROUTE);
  const lastScrollKey = useRef(routeKey(HOME_ROUTE));
  const lastContentCheck = useRef(0);

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

  const navigate = useCallback((next: StoreRoute) => {
    const prev = routeRef.current;
    if (sameRoute(prev, next)) return;
    saveScroll(routeKey(prev), contentRef.current?.scrollTop ?? 0);
    if (next.page === "category" && next.category) void markSeen("category", next.category);
    if (next.page === "author" && next.authorId) void markSeen("author", next.authorId);
    if (next.page !== "search") setSearchInputState("");
    setSubChipState(null); // 小类过滤是一次性浏览条件；切页清掉（排序/视图仍记忆）
    setRoute(next);
  }, []);

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
      if (target.page === "home") return; // 复位信号，不是导航
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

  /* ── 发现型已读：进入分类/作者店即持久写入（数据面，`discoverReads` 唯一属主） ──
   * ⚠️ 视觉上的 6px 新内容点由**内容签名增量**驱动（06 §八·补；contentHash 判据属棒 15 #12）——
   * 本棒不拿「未访问过」冒充「有新内容」（那会在首访后给整店刷点，语义是假的），故点集恒空；
   * 棒 15 接 contentHash 后只改本处输入，rail 的渲染路径已就位。 */
  const unreadCats = useMemo(() => new Set<string>(), []);
  // 作者项同理：增量判据（contentHash）归棒 15 #12——本棒只保证「进店即已读」写入与渲染路径就位
  const unreadAuthors = useMemo(() => new Set<string>(), []);

  /* ── 内容热更新的背景检查（R4-3.7 桩）：只**比对签名**、不写 store（⛔ 浏览中静默换内容；应用归「刷新」） ── */
  const backgroundCheck = useCallback(async () => {
    const now = Date.now();
    if (now - lastContentCheck.current < BACKGROUND_CHECK_MS) return;
    lastContentCheck.current = now;
    // 首趟目录未到 ⇒ 空 vs 全量会被误判成「内容已更新」——不比对（首开绝不弹常驻条）
    if (data.catalog.entries.length === 0) return;
    try {
      const next = await forceRefreshCatalog(); // 只取新目录；不写 catalogStore
      const before = catalogSignature(
        data.catalog.entries,
        data.catalog.collections,
        data.catalog.railOrder,
      );
      const after = catalogSignature(next.entries, next.collections, next.railOrder);
      if (after !== before) setContentPending(true);
    } catch {
      /* 后台检查失败不打扰（来源页注记承担可见性） */
    }
  }, [data.catalog.entries, data.catalog.collections, data.catalog.railOrder]);

  useEffect(() => {
    if (!isActive) return;
    void backgroundCheck();
  }, [isActive, backgroundCheck]);

  useEffect(() => {
    if (!isActive) return;
    const onFocus = () => {
      if (Date.now() - lastContentCheck.current < FOCUS_CHECK_MS) return;
      void backgroundCheck();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isActive, backgroundCheck]);

  /* ── 手动动作（命令面唯一入口） ── */
  const checkUpdates = useCallback(async () => {
    const r = await checkUpdatesFromStore();
    if (!r.ok) {
      showToast(t("检查更新失败"), { severity: "warning", key: "check-updates" });
      return;
    }
    showToast(
      r.count > 0 ? t("检查完成 · 发现 {{count}} 个可用更新", { count: r.count }) : t("所有插件已是最新"),
      { severity: "success", key: "check-updates" },
    );
  }, [t]);

  const refreshContent = useCallback(async () => {
    const r = await refreshContentFromStore();
    if (!r.ok) {
      showToast(t("刷新内容失败"), { severity: "warning", key: "refresh-content" });
      return;
    }
    setContentPending(false);
    showToast(r.changed ? t("内容已刷新") : t("内容已是最新"), { severity: "success", key: "refresh-content" });
  }, [t]);

  const dismissContent = useCallback(() => setContentPending(false), []);

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
      refreshContent,
      dismissContent,
      checkUpdates,
      addSource,
      openAddSource,
      keepScroll,
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
      refreshContent,
      dismissContent,
      checkUpdates,
      addSource,
      openAddSource,
      keepScroll,
    ],
  );

  const category = route.page === "category" ? route.category || "other" : "";

  return (
    <StoreProvider value={value}>
      <div className="marketplace-store">
        <Rail />
        <div className="marketplace-store-content" ref={contentRef} role="main" tabIndex={-1}>
          <div className="marketplace-store-page">
            <StoreHeader searchRef={searchRef} />
            <ContentBar />
            <CatalogNote />
            <CatalogGate>
              {route.page === "home" && <HomeView />}
              {route.page === "category" && <CategoryView slug={category} />}
              {route.page === "search" && <SearchResultsView />}
              {route.page === "rank" && <RankView />}
              {route.page === "authors" && <AuthorsView />}
              {route.page === "author" && (
                <AuthorStoreView
                  key={`${route.authorId ?? ""}:${route.repoId ?? ""}`}
                  authorId={route.authorId ?? ""}
                  repoId={route.repoId}
                />
              )}
              {route.page === "library" && <LibraryView />}
              {route.page === "sources" && <SourcesView />}
            </CatalogGate>
          </div>
        </div>
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
