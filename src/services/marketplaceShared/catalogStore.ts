/**
 * catalogStore — 市场**目录**共享 store（远端 catalog 的本地投影）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketplaceShared.ts` 原样搬出，零行为变更。
 *
 * 依赖方向：marketSources / marketCatalog → 本文件（叶子方向，本文件不 import 其余子模块）。
 * `_catalogResult` 的**唯一属主就是本文件**——其余子模块要取目录条目（如失败 toast 要显示插件名）
 * 一律经本文件导出的 accessor，不许另存一份（0d.10-8「模块级 mutable 状态各归单域属主」）。
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { loadCatalog, forceRefreshCatalog } from "../marketSources";
import type { CatalogLoadResult } from "../marketSources";
import type { CatalogEntry } from "../marketCatalog";

const lk = () => window.linkdesk;

/* ═══ 市场目录共享 store（E6#30a/30c/30f） ═══
 * 探索插件视图驱动源——marketSources.loadCatalog（官方 + 配置作者源，5min 缓存，多源合并）。
 * 首次 useMarketplaceCatalog mount 触发加载（_catalogPromise 防并发），refresh 走 forceRefreshCatalog。
 * result 暴露 state/errors/usedStale/sourceNames——空态防御 + 来源标注 + 失败诊断展示。 */

let _catalogPromise: Promise<void> | null = null;
/** 是否至少完成过一趟加载——初始默认结果（offline 空目录）只在「从未加载」时是占位；
 *  resolved 后即便 offline 也是真实空态（ExploreView 据此区分加载中 vs 真离线，防闪一帧「无法加载」） */
let _catalogResolvedOnce = false;
let _catalogResult: CatalogLoadResult = {
  entries: [],
  state: "offline",
  errors: [],
  sourceNames: [],
  usedStale: false,
  fetchedAt: 0,
};
const _catalogListeners = new Set<() => void>();

/** 结果代数——每有一方**写回更新的结果**（重投影 / 强刷）就 +1；首趟加载的 promise 落地时对号，
 *  代数不符 = 中途已有更新的写入 ⇒ 旧结果**作废不回写**（2026-09-30 竞态守卫：首趟加载在途时用户点了
 *  「检查更新」，重投影已把新鲜结果放进 store，随后才落地的旧首趟不得把 store 拖回旧目录）。 */
let _catalogGen = 0;

function notifyCatalogListeners(): void {
  _catalogListeners.forEach((fn) => fn());
}

/** 目录条目显示名（失败 toast 文案用）——不在目录 / 目录未加载 = 裸 pluginId 诚实显示 */
export function pluginDisplayNameOf(pluginId: string): string {
  return _catalogResult.entries.find((e) => e.id === pluginId)?.name ?? pluginId;
}

/* E6#30c：配置变更自动刷新——marketplaceSources 增删源后目录即时重拉（免等 5min 缓存/免手动）。
 * 模块级常驻订阅（单一注册守卫）：目录 store 是模块单例——订阅随模块活，不回随组件卸载。
 * 组件级订阅会漏「源列表变更时 ExploreView 未挂载」→ 商店页打开仍旧目录。故本订阅模块级、永不拆。
 * 回调走 forceRefreshCatalog（清缓存 + 强拉全部当前源——getSourceUrls 每次重读配置，新源即在列）。 */
let _configWatchStarted = false;

function ensureCatalogConfigWatch(): void {
  if (_configWatchStarted) return;
  _configWatchStarted = true;
  const cfg = lk()?.configuration;
  const sub = cfg?.onChange?.("marketplace.marketplaceSources", () => {
    forceRefreshCatalog()
      .then((r) => {
        _catalogGen++; // 新结果入库 = 代数推进，作废任何在途旧首趟的回写权
        _catalogResult = r;
        notifyCatalogListeners();
      })
      .catch(() => {
        /* 刷新失败保持旧结果——目录防御已降级 */
      });
  });
  if (!sub) _configWatchStarted = false; // onChange 不可用（预览环境）→ 下次 mount 再试
}

export function useMarketplaceCatalog() {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;

    // E6#30c：源配置变更自动刷新——挂首个目录消费者即注册模块级 watch（回随模块活，不回随本组件）
    ensureCatalogConfigWatch();

    const init = async () => {
      if (!_catalogPromise) {
        const gen = _catalogGen; // 创建时的代数——落地时对号（不符 = 中途有人重投影/强刷过 ⇒ 作废不回写）
        _catalogPromise = loadCatalog().then((r) => {
          if (gen === _catalogGen) {
            _catalogResult = r;
            _catalogResolvedOnce = true;
          }
        });
      }
      await _catalogPromise;
      if (!active) return;
      rerender();
    };

    init();
    _catalogListeners.add(rerender);
    return () => {
      _catalogListeners.delete(rerender);
      active = false;
    };
  }, [rerender]);

  return {
    ..._catalogResult,
    loading: !_catalogResolvedOnce,
    refresh: () =>
      forceRefreshCatalog()
        .then((r) => {
          _catalogGen++; // 新结果入库 = 代数推进，作废任何在途旧首趟的回写权
          _catalogResult = r;
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
 *  🔴 为什么非有这一步不可：徽标读的是**本模块的 `_catalogResult`**（`useCatalogEntryById` → 列表行），
 *    不是 `marketSources` 的 5min 缓存——发现腿（`runUpdateDiscovery`）只刷新了后者。不重投影，用户点了
 *    「检查更新」也看不到徽标动，而「点一下就知道有没有新版本」正是这件功能的全部意义。
 *  ⚠️ **非强拉是刻意的**：调用方（`services/updateCheck`）刚让发现腿强拉过目录，且成功结果会写进缓存
 *    （`marketSources/fetch.ts:51`）⇒ 这里命中 fresh 缓存、**全程只有 1 次网络**。换成 `forceRefreshCatalog`
 *    会二次全源拉取，还会先 `removeCache`——失败路径连 stale 兜底都没了。
 *  ⚠️ 组件内的同名刷新是 `useMarketplaceCatalog().refresh`（force 版，hook 面）；本函数是它的**非 hook 孪生**，
 *    供服务层调用。两份都只改这一份 `_catalogResult`（唯一属主见本文件头注）。 */
export async function reprojectCatalog(): Promise<CatalogLoadResult> {
  const r = await loadCatalog();
  _catalogGen++; // 新结果入库 = 代数推进，作废任何在途旧首趟的回写权
  _catalogResult = r;
  _catalogResolvedOnce = true;
  notifyCatalogListeners();
  return r;
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
