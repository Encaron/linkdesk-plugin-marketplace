/**
 * sourceOrderStore — 顺序模型的**React 读口**（19 §4.1；唯一真相源 = `marketplaceSources` 数组）。
 *
 * 为什么要 store：作者页/首页槽 2/作者坞都要读同一份作者/仓顺序；配置在**磁盘**、
 * 拖动在**别的表面**也可能发生（命令面跑在壳渲染进程）⇒ 单份内存槽 + `configuration.onChange`
 * 订阅（跨表面各 realm 各自注册，配置变更由壳广播到每份）。
 *
 * 纪律：本文件只读配置 + 订阅；写路径仍是 `sourceAdmin`（swapAuthors/swapRepos）。
 * 纯建序在 `sourceOrder`；这里只把「原始数组 + 目录声明 authorId」喂给它。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { realmSlot } from "./realmSlot";
import {
  buildSourceOrder,
  declaredAuthorMapOf,
  declaredRepoMapOf,
  orderSnapshot,
  type SourceOrder,
} from "./sourceOrder";
import type { AuthorDomain, AuthorRepoView } from "./authors";
import type { CatalogEntry } from "./marketCatalog";

const CONFIG_KEY = "marketplace.marketplaceSources";

interface OrderState {
  items: readonly unknown[];
  loaded: boolean;
  listeners: Set<() => void>;
  bridgeStarted: boolean;
}

const state = realmSlot<OrderState>("sourceOrderStore/v1", () => ({
  items: [],
  loaded: false,
  listeners: new Set<() => void>(),
  bridgeStarted: false,
}));

function notify(): void {
  state.listeners.forEach((fn) => fn());
}

async function loadItems(): Promise<void> {
  let raw: unknown;
  try {
    raw = await window.linkdesk?.configuration?.get<unknown>(CONFIG_KEY);
  } catch {
    raw = [];
  }
  state.items = Array.isArray(raw) ? raw : [];
  state.loaded = true;
  notify();
}

function ensureBridge(): void {
  if (state.bridgeStarted) return;
  let un: (() => void) | undefined;
  try {
    un = window.linkdesk?.configuration?.onChange?.(CONFIG_KEY, () => {
      void loadItems();
    });
  } catch {
    un = undefined;
  }
  if (typeof un === "function") state.bridgeStarted = true;
}

/** 同步快照（命令面/非 React 读取） */
export function getSourceOrderModel(
  entries: readonly CatalogEntry[],
  domains: readonly AuthorDomain[] = [],
): SourceOrder {
  return buildSourceOrder(state.items, {
    declaredAuthorBySource: declaredAuthorMapOf(entries),
    declaredRepoBySourceUrl: declaredRepoMapOf(domains),
  });
}

export function getCachedOrderSnapshot(
  entries: readonly CatalogEntry[],
  domains: readonly AuthorDomain[] = [],
): { authorOrder: string[]; repoOrder: Record<string, string[]> } {
  return orderSnapshot(getSourceOrderModel(entries, domains));
}

/** 订阅顺序（作者页/槽 2/作者坞共用；配置一变即重排） */
export function useSourceOrder(
  entries: readonly CatalogEntry[],
  domains: readonly AuthorDomain[] = [],
): SourceOrder {
  const [tick, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    state.listeners.add(rerender);
    ensureBridge();
    void loadItems().then(() => {
      if (alive) rerender();
    });
    return () => {
      alive = false;
      state.listeners.delete(rerender);
    };
  }, [rerender]);
  // tick 是「配置重读/跨表面变更」的重新建序触发器（数组引用可能相同）
  return useMemo(() => {
    void tick;
    return getSourceOrderModel(entries, domains);
  }, [entries, domains, tick]);
}

/** 作者某仓顺序 → 作者域仓对象（顺序模型优先；作者块里有、配置里没有的仓按原序补末尾） */
export function orderedReposOf(order: SourceOrder, domain: AuthorDomain): AuthorRepoView[] {
  const key = Object.keys(order.repoOrder).find((k) => k.toLowerCase() === domain.authorId.toLowerCase());
  const ids = key ? order.repoOrder[key] : [];
  const out: AuthorRepoView[] = [];
  for (const id of ids) {
    const repo = domain.repos.find((r) => r.id === id);
    if (repo && !out.includes(repo)) out.push(repo);
  }
  for (const repo of domain.repos) if (!out.includes(repo)) out.push(repo);
  return out;
}

/** 作者容器顺序 → 已加载作者域（顺序里没有的作者按域原序补末尾；官方恒第一） */
export function orderedAuthorsOf(order: SourceOrder, domains: readonly AuthorDomain[]): AuthorDomain[] {
  const out: AuthorDomain[] = [];
  for (const authorId of order.authorOrder) {
    const d = domains.find((x) => x.authorId.toLowerCase() === authorId.toLowerCase());
    if (d && !out.includes(d)) out.push(d);
  }
  for (const d of domains) if (!out.includes(d)) out.push(d);
  return out;
}

/** 测试专用：清本模块内存态 */
export function __resetSourceOrderStore(): void {
  state.items = [];
  state.loaded = false;
  state.listeners.clear();
  state.bridgeStarted = false;
}
