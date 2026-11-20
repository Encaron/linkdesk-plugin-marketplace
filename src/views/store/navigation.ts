/**
 * navigation — 商店的**会话级导航 + 滚动位记忆**（08 §三·106⑤/117；⛔ 进 pluginState）。
 *
 * 为什么是会话级：滚动位/当前页是「一次性浏览条件」，不是跨重启偏好——持久化会污染首屏
 * （06 §八「不记忆搜索词、抽屉筛选」同规）。跨进程/晚挂载的**意图**才走 storeNav 持久信箱。
 *
 * 页面与 rail 的映射：
 *   home / category:<slug> / search / rank / library / authors / sources / author:<id>:<repo>
 * 滚动位按 `routeKey` 分键——切分类/搜索/榜单再回来回原位（⛔ 弹回顶部）。
 */

import type { StoreNavTarget } from "../../services/storeNav";

export type StorePage = "home" | "category" | "search" | "rank" | "library" | "authors" | "sources" | "author";

export interface StoreRoute {
  page: StorePage;
  category?: string;
  query?: string;
  authorId?: string;
  repoId?: string;
}

export const HOME_ROUTE: StoreRoute = { page: "home" };

/** 路由 → 滚动位键（同页不同参数的视图各自记忆） */
export function routeKey(route: StoreRoute): string {
  switch (route.page) {
    case "category":
      // 作者跳转字落页（authorId 预过滤）与全量分类页是两条浏览条件——滚动位分开记忆
      return route.authorId
        ? `cat:${route.category ?? ""}:${route.authorId}`
        : `cat:${route.category ?? ""}`;
    case "search":
      return "search";
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

/** storeNav 持久意图 → 商店路由（rank 无命令入口，不在映射面） */
export function routeFromNav(t: StoreNavTarget): StoreRoute {
  switch (t.page) {
    case "category":
      return { page: "category", category: t.category };
    case "library":
      return { page: "library" };
    case "author":
      return { page: "author", authorId: t.authorId, repoId: t.repoId };
    case "sources":
      return { page: "sources" };
    case "search":
      return { page: "search", query: t.query };
    default:
      return HOME_ROUTE;
  }
}

/** 路由相等（避免同一条意图重复应用/重复滚动复位） */
export function sameRoute(a: StoreRoute, b: StoreRoute): boolean {
  return (
    a.page === b.page &&
    (a.category ?? "") === (b.category ?? "") &&
    (a.query ?? "") === (b.query ?? "") &&
    (a.authorId ?? "") === (b.authorId ?? "") &&
    (a.repoId ?? "") === (b.repoId ?? "")
  );
}
