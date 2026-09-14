/**
 * useCatalogStatus——探索视图的「目录行状态推导」层。
 * E6#86b（第 3.6.3 轮）feature-folder 拆分：自 `views/ExploreView.tsx` 原样搬出，零行为变更。
 *
 * 行状态交叉比对（E6#30b——用 useMarketplacePlugins 的未过滤 `all` 列表，搜索词过滤后的
 * installed/builtin 会污染状态判定：搜词期间目录行的安装状态不能被过滤串扰）：
 *   - pluginId ∉ list()                          → 「安装」钮（→ startMarketInstall 单活跃会话，#30.9a/b 消费）
 *   - pluginId ∈ list() 且本地版本 ≥ 目录版本      → 「已安装」徽标
 *   - pluginId ∈ list() 且目录版本 > 本地版本      → 「可更新」徽标（升级动作归更新轮——此处只示状态）
 *   - pluginId ∈ getDisabled()（list() 排除禁用） → 「已禁用」徽标（30.11c 实机回归——防禁用行误显「安装」
 *     撞装前冲突；启用/卸载归详情与已装列表）
 *
 * `localLoading` 与状态表同源透出——门面用它与目录 loading 做双门占位（防本地列表未到前整屏误显「安装」）。
 *
 * E6#106：同源再透出 `identityOf(id)`——身份图裁决链的「已装候选」（图标四字段）。
 *   行状态与行图标**读的是同一份本地列表**，两处各订阅一次必然漂移，故都从这里出。
 */

import { useCallback, useMemo } from "react";
import { updateTargetFor, type CatalogEntry } from "../../../services/marketCatalog";
import { useMarketplacePlugins } from "../../../services/marketplaceShared";

export type RowStatus = "install" | "installed" | "update" | "disabled";

/** 行/详情身份图裁决的「已装候选」形状——只取图标四字段（= `pickIdentityArt` 的入参形状） */
export interface LocalIdentity {
  icon?: string;
  iconSource?: "codicon" | "svg" | "url" | "lucide";
  marketIcon?: string;
  marketIconSource?: "codicon" | "svg" | "url" | "lucide";
}

export function useCatalogStatus() {
  // 本地未过滤全量列表——#30b 交叉比对基准（勿用 filter 后的 installed/builtin）；
  // list() EXCLUDES 禁用插件（30.11c 实机回归）——禁用已装另经 disabledRaw 双源合并，防禁用行误显「安装」
  const { all, disabledRaw, loading: localLoading } = useMarketplacePlugins();

  /* ── #30b 状态推导：list()(启用) ∪ getDisabled()(禁用) 两源 → 本地版本表/禁用集，每行 O(1) ──
   *  E6#73j（G6）：表里同时带 updatable（住所）——可更新徽标须过 updateTargetFor 的住所闸 */
  const localById = useMemo(
    () => new Map(all.map((p) => [p.pluginId, { version: p.manifest.version, updatable: p.updatable }])),
    [all],
  );
  const disabledIds = useMemo(() => new Set(disabledRaw.map((p) => p.pluginId)), [disabledRaw]);

  /* ── E6#106：已装候选的图标四字段——身份图裁决链的**第一候选**（与详情页同序：
   *  已装 manifest → 目录条目 → 默认彩色块）。为什么必须有它（是防回归、不是美化）：
   *  目录条目的图标已改成**绝对 URL**（包内路径未装时不可达），已装行若不接本地 manifest，
   *  就会静默改去拉远程图——既破 06-图标.md「已装不读远程目录图标」，又**断网即裂图**。
   *  启用行优先、禁用行其次（两源都可能装着；同 id 时先写的被覆盖）。 ── */
  const identityById = useMemo(() => {
    const m = new Map<string, LocalIdentity>();
    for (const p of disabledRaw) {
      m.set(p.pluginId, {
        icon: p.icon,
        iconSource: p.iconSource,
        marketIcon: p.marketIcon,
        marketIconSource: p.marketIconSource,
      });
    }
    for (const p of all) {
      m.set(p.pluginId, {
        icon: p.manifest.icon,
        iconSource: p.manifest.iconSource,
        marketIcon: p.manifest.marketIcon,
        marketIconSource: p.manifest.marketIconSource,
      });
    }
    return m;
  }, [all, disabledRaw]);

  const identityOf = useCallback((pluginId: string): LocalIdentity | undefined => identityById.get(pluginId), [identityById]);

  const statusOf = useCallback(
    (entry: CatalogEntry): RowStatus => {
      // 已装但禁用 → 不显安装/更新钮（启用/卸载归详情/已装列表，装前冲突由此防——#30.9d）
      if (disabledIds.has(entry.id)) return "disabled";
      const lv = localById.get(entry.id);
      if (lv === undefined) return "install";
      // E6#33b：可更新判定与详情/发现/铃铛同源单函数（stable-only + semver.gt，§一·三）——
      // 不再用顶层 entry.version 裸比（顶层是 beta 时旧逻辑误判可更新，而详情/铃铛 stable 不提示 = 判定分裂）
      // E6#73j（G6）：住所闸——随包发货件不显「更新」徽标（点了必失败）
      return updateTargetFor(entry, lv.version, lv.updatable) ? "update" : "installed";
    },
    [localById, disabledIds],
  );

  return { statusOf, identityOf, localLoading };
}
