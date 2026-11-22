/**
 * navigation —— 商店会话级导航（路由键 / 滚动位记忆 / storeNav 意图映射）。
 * 钉住：切视图回原位；同路由不重复导航；**每个页面（含 rank/authors）都能被意图映射到**。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  HOME_ROUTE,
  __resetScrollMemory,
  readScroll,
  routeFromNav,
  routeKey,
  routeToNavTarget,
  sameRoute,
  saveScroll,
  type StoreRoute,
} from "../views/store/navigation";

beforeEach(() => {
  __resetScrollMemory();
});

describe("routeKey", () => {
  it("同页不同参数各自记忆；home/search/rank 为页名", () => {
    expect(routeKey(HOME_ROUTE)).toBe("home");
    expect(routeKey({ page: "category", category: "themes" })).toBe("cat:themes");
    expect(routeKey({ page: "search", query: "x" })).toBe("search");
    expect(routeKey({ page: "author", authorId: "a", repoId: "r" })).toBe("author:a:r");
  });
});

describe("滚动位记忆（会话级）", () => {
  it("写读一致；未写过 = 0", () => {
    expect(readScroll("home")).toBe(0);
    saveScroll("cat:themes", 420);
    expect(readScroll("cat:themes")).toBe(420);
  });
});

describe("routeFromNav / routeToNavTarget / sameRoute", () => {
  it("八种意图映射；home 兜底", () => {
    expect(routeFromNav({ page: "home" })).toEqual(HOME_ROUTE);
    expect(routeFromNav({ page: "category", category: "development" })).toEqual({
      page: "category",
      category: "development",
    });
    expect(
      routeFromNav({ page: "category", category: "themes", authorId: "linkdesk-fixture-alice" }),
    ).toEqual({
      page: "category",
      category: "themes",
      authorId: "linkdesk-fixture-alice",
    });
    expect(routeFromNav({ page: "category", category: "themes", official: true })).toEqual({
      page: "category",
      category: "themes",
      official: true,
    });
    expect(routeFromNav({ page: "rank" })).toEqual({ page: "rank" });
    expect(routeFromNav({ page: "authors" })).toEqual({ page: "authors", authorMode: "browse" });
    expect(routeFromNav({ page: "library" })).toEqual({ page: "library" });
    expect(routeFromNav({ page: "author", authorId: "a" })).toEqual({ page: "author", authorId: "a" });
    expect(routeFromNav({ page: "sources" })).toEqual({ page: "sources" });
    expect(routeFromNav({ page: "search", query: "serial" })).toEqual({ page: "search", query: "serial" });
  });

  it("routeToNavTarget 反向：实际路由回写（供 getState 读当前页）", () => {
    expect(routeToNavTarget({ page: "rank" })).toEqual({ page: "rank" });
    expect(routeToNavTarget({ page: "authors" })).toEqual({ page: "authors", mode: "browse" });
    expect(routeToNavTarget({ page: "category", category: "themes", authorId: "a" })).toEqual({
      page: "category",
      category: "themes",
      authorId: "a",
    });
    expect(routeToNavTarget({ page: "category", category: "themes", official: true })).toEqual({
      page: "category",
      category: "themes",
      official: true,
    });
    expect(routeToNavTarget({ page: "author", authorId: "a", repoId: "r" })).toEqual({
      page: "author",
      authorId: "a",
      repoId: "r",
    });
  });

  it("sameRoute 逐字段比较（缺省 = 空串）", () => {
    const a: StoreRoute = { page: "search", query: "x" };
    expect(sameRoute(a, { page: "search", query: "x" })).toBe(true);
    expect(sameRoute(a, { page: "search", query: "y" })).toBe(false);
    expect(sameRoute({ page: "category", category: "themes" }, { page: "category" })).toBe(false);
  });
});
