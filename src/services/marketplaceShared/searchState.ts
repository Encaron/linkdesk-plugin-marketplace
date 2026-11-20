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

/** 跨进程搜索广播通道（R4-2.5 `marketplace.search` 命令：壳进程设词也要让池里的侧栏列表跟上） */
const CHANNEL = "marketplace:search";

interface SearchState {
  value: string;
  listeners: Set<() => void>;
  bridgeStarted: boolean;
}

const state = realmSlot<SearchState>("searchState/v1", () => ({
  value: "",
  listeners: new Set<() => void>(),
  bridgeStarted: false,
}));

/** 事件订阅（每 realm 一次）——只在**命令**广播时触发；用户在搜索框输入不广播（⛔ 逐键 IPC 风暴） */
function ensureBridge(): void {
  if (state.bridgeStarted) return;
  const on = window.linkdesk?.events?.on;
  if (!on) return;
  try {
    on<string>(CHANNEL, (q) => {
      if (typeof q === "string") setMarketplaceSearch(q);
    });
  } catch {
    return; // 事件面不可用（预览）——池内本地搜索仍可用
  }
  state.bridgeStarted = true;
}

export function getMarketplaceSearch(): string {
  return state.value;
}

export function setMarketplaceSearch(v: string): void {
  state.value = v;
  state.listeners.forEach((fn) => fn());
}

/**
 * 开跨进程搜索广播的订阅（R4-2.5 命令注册时调一次）。
 * ⚠️ 刻意**不**在 `getMarketplaceSearch()` 里懒启动：那条会在任何读搜索词的组件首帧就多挂一条
 * `events.on`，污染既有「生命周期订阅恰好四条」的接线断言（pluginsStore.test 实测撞红）。
 * 订阅归「命令面」所有——只有注册命令的模块知道这条通道存在。
 */
export function listenMarketplaceSearchBroadcast(): void {
  ensureBridge();
}

export function onMarketplaceSearchChange(fn: () => void): () => void {
  state.listeners.add(fn);
  return () => {
    state.listeners.delete(fn);
  };
}

/** 测试专用：清本模块内存态（槽对象被模块捕获，`__resetRealmSlots` 清不到它）。产线不调。 */
export function __resetSearchState(): void {
  state.value = "";
  state.listeners.clear();
  state.bridgeStarted = false;
}
