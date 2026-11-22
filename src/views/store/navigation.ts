/**
 * navigation — 商店的**会话级导航 + 滚动位记忆**（08 §三·106⑤/117；⛔ 进 pluginState）。
 *
 * 为什么是会话级：滚动位/当前页是「一次性浏览条件」，不是跨重启偏好——持久化会污染首屏
 * （06 §八「不记忆搜索词、抽屉筛选」同规）。跨进程/晚挂载的**意图**才走 storeNav 持久信箱。
 *
 * 页面与 rail 的映射：
 *   home / repo-all / category:<slug> / search / rank / library / authors / author:<id>:<repo>
 * 滚动位按 `routeKey` 分键——切分类/搜索/榜单再回来回原位（⛔ 弹回顶部）。
 */

import type { StoreNavTarget } from "../../services/storeNav";

export type StorePage =
  | "home"
  | "repo-all"
  | "category"
  | "search"
  | "rank"
  | "library"
  | "authors"
  | "author";

export interface StoreRoute {
  page: StorePage;
  category?: string;
  query?: string;
  authorId?: string;
  repoId?: string;
  /** 作者页一页两模式（19 §3）；缺省 = 浏览 */
  authorMode?: "browse" | "manage";
  /** 官方店主的分类预过滤（与 authorId 互斥；分类落页的页主范围统一参数） */
  official?: boolean;
}

export const HOME_ROUTE: StoreRoute = { page: "home" };

/** 路由 → 滚动位键（同页不同参数的视图各自记忆） */
export function routeKey(route: StoreRoute): string {
  switch (route.page) {
    case "category":
      // 页主范围（作者 / 官方）与全量分类页是三条浏览条件——滚动位分开记忆
      return route.repoId
        ? `cat:${route.category ?? ""}:repo:${route.repoId}`
        : route.authorId
        ? `cat:${route.category ?? ""}:${route.authorId}`
        : route.official
          ? `cat:${route.category ?? ""}:official`
          : `cat:${route.category ?? ""}`;
    case "search":
      return "search";
    case "authors":
      return `authors:${route.authorMode ?? "browse"}`;
    case "author":
      return `author:${route.authorId ?? ""}:${route.repoId ?? ""}`;
    default:
      return route.page;
  }
}

/* 会话级滚动位——模块级 Map（本表面单份；多个池表面各持一份，属渲染器私有记忆，⛔ 业务状态） */
const scrollMemory = new Map<string, number>();

export function saveScroll(key: string, top: number): void {
  scrollMemory.set(key, top);
}

export function readScroll(key: string): number {
  return scrollMemory.get(key) ?? 0;
}

/** 测试用：清会话记忆 */
export function __resetScrollMemory(): void {
  scrollMemory.clear();
}

/** storeNav 持久意图 → 商店路由（每页都有对应命令，见 NAV_COMMANDS） */
export function routeFromNav(t: StoreNavTarget): StoreRoute {
  switch (t.page) {
    case "category":
      return t.repoId
        ? { page: "category", category: t.category, authorId: t.authorId, repoId: t.repoId }
        : t.authorId
        ? { page: "category", category: t.category, authorId: t.authorId }
        : t.official
          ? { page: "category", category: t.category, official: true }
          : { page: "category", category: t.category };
    case "repo-all":
      return { page: "repo-all" };
    case "rank":
      return { page: "rank" };
    case "authors":
      return t.mode === "manage"
        ? { page: "authors", authorMode: "manage" }
        : { page: "authors", authorMode: "browse" };
    case "library":
      return { page: "library" };
    case "author":
      return { page: "author", authorId: t.authorId, repoId: t.repoId };
    case "search":
      return { page: "search", query: t.query };
    default:
      return HOME_ROUTE;
  }
}

/** 会话路由 → storeNav 目标（供 `marketplace.getState` 读“当前实际页”；与命令意图同形）。 */
export function routeToNavTarget(route: StoreRoute): StoreNavTarget {
  switch (route.page) {
    case "category":
      return route.repoId
        ? { page: "category", category: route.category ?? "", authorId: route.authorId, repoId: route.repoId }
        : route.authorId
        ? { page: "category", category: route.category ?? "", authorId: route.authorId }
        : route.official
          ? { page: "category", category: route.category ?? "", official: true }
          : { page: "category", category: route.category ?? "" };
    case "repo-all":
      return { page: "repo-all" };
    case "rank":
      return { page: "rank" };
    case "authors":
      return route.authorMode === "manage"
        ? { page: "authors", mode: "manage" }
        : { page: "authors", mode: "browse" };
    case "library":
      return { page: "library" };
    case "author":
      return route.repoId
        ? { page: "author", authorId: route.authorId ?? "", repoId: route.repoId }
        : { page: "author", authorId: route.authorId ?? "" };
    case "search":
      return { page: "search", query: route.query ?? "" };
    default:
      return { page: "home" };
  }
}

/** 路由相等（避免同一条意图重复应用/重复滚动复位） */
export function sameRoute(a: StoreRoute, b: StoreRoute): boolean {
  return (
    a.page === b.page &&
    (a.category ?? "") === (b.category ?? "") &&
    (a.query ?? "") === (b.query ?? "") &&
    (a.authorId ?? "") === (b.authorId ?? "") &&
    (a.official === true) === (b.official === true) &&
    (a.repoId ?? "") === (b.repoId ?? "") &&
    (a.authorMode ?? "") === (b.authorMode ?? "")
  );
}
