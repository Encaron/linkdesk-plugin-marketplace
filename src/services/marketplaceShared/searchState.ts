/**
 * searchState — 模块级搜索状态（侧栏搜索框的单一真相）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketplaceShared.ts` 原样搬出，零行为变更。
 *
 * E3.6 E36#7.1：多个 view 各自独立渲染，不共享 React Context，
 * 搜索状态必须是**跨 view 唯一的**——setSearch 后所有 view 同步过滤。
 *
 * 🔴 2026-09-30：这条设计前提在多表面打包下**必须靠全局槽兑现**（`realmSlot`）——「模块级」在
 *   `views/*.bundle.js` 各自内联的数据下＝每表面一份，搜索框（`SearchView` 面）设的词根本传不到
 *   已安装/探索列表那几个面。详见 `services/realmSlot.ts` 头注。
 */

import { realmSlot } from "../realmSlot";

interface SearchState {
  value: string;
  listeners: Set<() => void>;
}

const state = realmSlot<SearchState>("searchState/v1", () => ({ value: "", listeners: new Set() }));

export function getMarketplaceSearch(): string {
  return state.value;
}

export function setMarketplaceSearch(v: string): void {
  state.value = v;
  state.listeners.forEach((fn) => fn());
}

export function onMarketplaceSearchChange(fn: () => void): () => void {
  state.listeners.add(fn);
  return () => {
    state.listeners.delete(fn);
  };
}
