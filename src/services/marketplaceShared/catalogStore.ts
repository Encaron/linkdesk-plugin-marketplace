/**
 * catalogStore — 市场**目录**共享 store（远端 catalog 的本地投影）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketplaceShared.ts` 原样搬出，零行为变更。
 *
 * 依赖方向：marketSources / marketCatalog → 本文件（叶子方向，本文件不 import 其余子模块）。
 * 目录投影的**唯一属主就是本文件**——其余子模块要取目录条目（如失败 toast 要显示插件名）
 * 一律经本文件导出的 accessor，不许另存一份（0d.10-8「模块级 mutable 状态各归单域属主」）。
 *
 * 🔴 2026-09-30（多表面塌缩修复）：「唯一属主」在**多表面打包**下还必须加上「跨表面唯一」——
 *   侧栏几段与主区详情是各自独立的 bundle（SDK 每表面一次独立 lib build），模块作用域的变量在
 *   表面之间各长一份 ⇒ 侧栏点「检查更新」翻新的是侧栏那份投影，详情页读的仍是它自己那份旧的
 *   （用户实机报障：行内徽标翻新、详情页版本下拉不动、要退软件重进）。故整份状态住 `realmSlot`
 *   全局槽（同一 realm 一份），详见 `services/realmSlot.ts` 头注。
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { loadCatalog, forceRefreshCatalog, getSourceUrls } from "../marketSources";
import type { CatalogLoadResult } from "../marketSources";
import { catalogSignature, sourceNameOfUrl } from "../marketCatalog";
import type { CatalogEntry } from "../marketCatalog";
import { realmSlot } from "../realmSlot";

const lk = () => window.linkdesk;

/* ═══ 市场目录共享 store（E6#30a/30c/30f） ═══
 * 探索插件视图驱动源——marketSources.loadCatalog（官方 + 配置作者源，5min 缓存，多源合并）。
 * 首次 useMarketplaceCatalog mount 触发加载（promise 防并发），refresh 走 forceRefreshCatalog。
 * result 暴露 state/errors/usedStale/sourceNames——空态防御 + 来源标注 + 失败诊断展示。 */

interface CatalogState {
  /** 首趟加载在途 promise——防并发（多表面同时 mount 只拉一趟） */
  promise: Promise<void> | null;
  /** 是否至少完成过一趟加载——初始默认结果（offline 空目录）只在「从未加载」时是占位；
   *  resolved 后即便 offline 也是真实空态（ExploreView 据此区分加载中 vs 真离线，防闪一帧「无法加载」） */
  resolvedOnce: boolean;
  result: CatalogLoadResult;
  listeners: Set<() => void>;
  /** 结果代数——每有一方**写回更新的结果**（重投影 / 强刷）就 +1；首趟加载的 promise 落地时对号，
   *  代数不符 = 中途已有更新的写入 ⇒ 旧结果**作废不回写**（2026-09-30 竞态守卫：首趟加载在途时用户点了
   *  「检查更新」，重投影已把新鲜结果放进 store，随后才落地的旧首趟不得把 store 拖回旧目录）。 */
  gen: number;
  /** E6#30c 配置变更订阅的注册守卫（模块级常驻订阅，见下） */
  configWatchStarted: boolean;
}

const EMPTY_RESULT: CatalogLoadResult = {
  entries: [],
  state: "offline",
  errors: [],
  sourceNames: [],
  usedStale: false,
  fetchedAt: 0,
  railOrder: [],
  collections: [],
  warnings: [],
  deduped: [],
  sourceStatus: [],
};

const state = realmSlot<CatalogState>("catalogStore/v1", () => ({
  promise: null,
  resolvedOnce: false,
  result: EMPTY_RESULT,
  listeners: new Set<() => void>(),
  gen: 0,
  configWatchStarted: false,
}));

function notifyCatalogListeners(): void {
  state.listeners.forEach((fn) => fn());
}

/** 目录条目显示名（失败 toast 文案用）——不在目录 / 目录未加载 = 裸 pluginId 诚实显示 */
export function pluginDisplayNameOf(pluginId: string): string {
  return state.result.entries.find((e) => e.id === pluginId)?.name ?? pluginId;
}

/* E6#30c：配置变更自动刷新——marketplaceSources 增删源后目录即时重拉（免等 5min 缓存/免手动）。
 * 模块级常驻订阅（单一注册守卫；跨表面唯一——守卫住槽里，第二个表面到达时不再重复注册）：目录 store 是
 * 共享单例——订阅随 realm 活，不回随组件卸载。组件级订阅会漏「源列表变更时 ExploreView 未挂载」→ 商店页
 * 打开仍旧目录。故本订阅模块级、永不拆。回调走 forceRefreshCatalog（清缓存 + 强拉全部当前源——
 * getSourceUrls 每次重读配置，新源即在列）。 */
function ensureCatalogConfigWatch(): void {
  if (state.configWatchStarted) return;
  state.configWatchStarted = true;
  const cfg = lk()?.configuration;
  const sub = cfg?.onChange?.("marketplace.marketplaceSources", () => {
    /* 🔴 2026-11-22（作者身份批 A）：顺序拖动也写同一个键——但顺序变化**不需要重拉网络**。
     * 判据 = 源集合（sourceName）是否变化：集合没变 ⇒ 非强拉重投影（5min fresh 缓存命中，零网络）；
     * 集合变了（加/删/停用源）⇒ 仍走强刷（既有行为）。⛔ 每次拖动都清缓存重拉全部源。 */
    const run = async () => {
      const urls = await getSourceUrls();
      const nextSet = urls.map(sourceNameOfUrl).sort().join("|");
      const prevSet = [...state.result.sourceNames].sort().join("|");
      const orderOnly = prevSet !== "" && prevSet === nextSet;
      if (orderOnly) {
        await reprojectCatalog(); // 非强拉：缓存命中零网络（内部已入库/通知）
        return;
      }
      const r = await forceRefreshCatalog();
      state.gen++; // 新结果入库 = 代数推进，作废任何在途旧首趟的回写权
      state.result = r;
      notifyCatalogListeners();
    };
    void run().catch(() => {
      /* 刷新失败保持旧结果——目录防御已降级 */
    });
  });
  if (!sub) state.configWatchStarted = false; // onChange 不可用（预览环境）→ 下次 mount 再试
}

export function useMarketplaceCatalog() {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;

    // E6#30c：源配置变更自动刷新——挂首个目录消费者即注册常驻 watch（回随 realm 活，不回随本组件）
    ensureCatalogConfigWatch();

    const init = async () => {
      if (!state.promise) {
        const gen = state.gen; // 创建时的代数——落地时对号（不符 = 中途有人重投影/强刷过 ⇒ 作废不回写）
        state.promise = loadCatalog().then((r) => {
          if (gen === state.gen) {
            state.result = r;
            state.resolvedOnce = true;
          }
        });
      }
      await state.promise;
      if (!active) return;
      rerender();
    };

    init();
    state.listeners.add(rerender);
    return () => {
      state.listeners.delete(rerender);
      active = false;
    };
  }, [rerender]);

  return {
    ...state.result,
    loading: !state.resolvedOnce,
    refresh: () =>
      forceRefreshCatalog()
        .then((r) => {
          state.gen++; // 新结果入库 = 代数推进，作废任何在途旧首趟的回写权
          state.result = r;
          notifyCatalogListeners();
        })
        .catch(() => {
          /* 刷新失败保持旧结果——目录防御已降级 */
        }),
  };
}

/** 手动「检查更新」的后半程：把目录**非强拉**地重投影一遍并通知订阅方 ⇒ 行内「可更新」徽标当场翻新
 *  （05「插件市场·检查更新」）。
 *
 *  🔴 为什么非有这一步不可：徽标读的是**本 store 的目录投影**（`useCatalogEntryById` → 列表行），
 *    不是 `marketSources` 的 5min 缓存——发现腿（`runUpdateDiscovery`）只刷新了后者。不重投影，用户点了
 *    「检查更新」也看不到徽标动，而「点一下就知道有没有新版本」正是这件功能的全部意义。
 *  ⚠️ **非强拉是刻意的**：调用方（`services/updateCheck`）刚让发现腿强拉过目录，且成功结果会写进缓存
 *    （`marketSources/fetch.ts:51`）⇒ 这里命中 fresh 缓存、**全程只有 1 次网络**。换成 `forceRefreshCatalog`
 *    会二次全源拉取，还会先 `removeCache`——失败路径连 stale 兜底都没了。
 *  ⚠️ 组件内的同名刷新是 `useMarketplaceCatalog().refresh`（force 版，hook 面）；本函数是它的**非 hook 孪生**，
 *    供服务层调用。两份都只改这一份投影（唯一属主见本文件头注）。 */
export async function reprojectCatalog(): Promise<CatalogLoadResult> {
  const r = await loadCatalog();
  state.gen++; // 新结果入库 = 代数推进，作废任何在途旧首趟的回写权
  state.result = r;
  state.resolvedOnce = true;
  notifyCatalogListeners();
  return r;
}

/** 当前目录投影的**只读快照**（非 hook 面）——服务层/命令要在 React 之外读目录时走这里，
 *  ⛔ 别各自再存一份（目录投影唯一属主仍是本文件，见文件头）。 */
export function getCatalogResult(): CatalogLoadResult {
  return state.result;
}

/**
 * 手动「刷新目录内容」的命令落点（R4-2.5 `marketplace.refreshCatalog`）。
 *
 * 与 hook 面 `useMarketplaceCatalog().refresh` 同一个唯一属主（都只改 `state.result`）：
 * 强刷全部源 → 入库 → 通知 → 回执 `changed` = 内容签名是否变化（`catalogSignature`，
 * 不是「有没有发过网络请求」——同内容重拉 = 没变）。
 * 首趟未加载时先做一次非强拉取（缓存命中时零网络），否则 `before` 是空目录 ⇒ `changed` 恒 true。
 */
export async function refreshCatalogNow(): Promise<{ ok: boolean; changed: boolean }> {
  try {
    if (!state.resolvedOnce) {
      const cached = await loadCatalog();
      state.result = cached;
      state.resolvedOnce = true;
      notifyCatalogListeners();
    }
    const before = catalogSignature(state.result.entries, state.result.collections, state.result.railOrder);
    const r = await forceRefreshCatalog();
    state.gen++; // 新结果入库 = 代数推进，作废任何在途旧首趟的回写权
    state.result = r;
    state.resolvedOnce = true;
    notifyCatalogListeners();
    const after = catalogSignature(r.entries, r.collections, r.railOrder);
    return { ok: true, changed: after !== before };
  } catch {
    return { ok: false, changed: false };
  }
}

/** E6#33b：目录条目 id 索引——已装/内置/禁用列表行「可更新」判定共用（updateToVersion 查目录），
 *  与详情页/发现同源同一把钥匙（目录条目 id = pluginId）。entries 引用变化即重建（目录重拉后徽标自动翻新）。 */
export function useCatalogEntryById(): ReadonlyMap<string, CatalogEntry> {
  const catalog = useMarketplaceCatalog();
  return useMemo(() => {
    const m = new Map<string, CatalogEntry>();
    for (const e of catalog.entries) m.set(e.id, e);
    return m;
  }, [catalog.entries]);
}
