/**
 * catalogStatus — 目录条目「本地状态」的**唯一推导层**（跨表面共享；R4-3.4/3.5 商店与侧栏同吃这一份）。
 *
 * 迁移说明（棒 6）：原住 `views/sidebar/ExploreView/useCatalogStatus.ts`（E6#86b 拆分）——侧栏视图
 * 私有件。新商店（主区）与侧栏都要回答「这个条目此刻是未装/已装/可更新/已禁用」，而 10 §六 的依赖
 * 方向是 `views → services`（⛔ 视图互相 import）⇒ 本层上移到 services，侧栏与商店**共用同一实现**，
 * 不复制第二份状态推导（10 §一 逻辑归一化）。
 *
 * 判据（与迁移前逐字一致）：
 *   - pluginId ∉ list()                          → 「安装」钮
 *   - pluginId ∈ list() 且 updateTargetFor 命中   → 「可更新」
 *   - pluginId ∈ list() 且无更新                  → 「已安装」
 *   - pluginId ∈ getDisabled()（list() 排除禁用） → 「已禁用」
 *
 * E6#106：同源再透出 `identityOf(id)`——身份图裁决链的「已装候选」（图标四字段）。
 *   行状态与行图标**读的是同一份本地列表**，两处各订阅一次必然漂移，故都从这里出。
 */

import { useCallback, useMemo } from "react";
import { updateTargetFor, type CatalogEntry } from "./marketCatalog";
import { useMarketplacePlugins } from "./marketplaceShared/pluginsStore";

/** 条目本地状态（商店/侧栏唯一域；`install` = 未安装） */
export type PackageState = "install" | "installed" | "update" | "disabled";

/** 侧栏历史名——语义相同（保留导出，避免消费方改名扩散） */
export type RowStatus = PackageState;

/** 行/详情身份图裁决的「已装候选」形状——只取图标四字段（= `pickIdentityArt` 的入参形状） */
export interface LocalIdentity {
  icon?: string;
  iconSource?: "codicon" | "svg" | "url" | "lucide";
  marketIcon?: string;
  marketIconSource?: "codicon" | "svg" | "url" | "lucide";
}

/** 本地已装投影（每 pluginId 一条）——版本/住所以及 essential（重要型）旗标 */
export interface LocalEntryInfo {
  version: string;
  updatable?: boolean;
  essential?: boolean;
}

/**
 * 纯推导（测试直测，无 React）：给定本地表与禁用集，返回条目状态。
 * 商店与侧栏都经 `useCatalogStatus().statusOf` 调它——⛔ 别在视图里再写一遍判定。
 */
export function derivePackageState(
  entry: CatalogEntry,
  localById: ReadonlyMap<string, LocalEntryInfo>,
  disabledIds: ReadonlySet<string>,
): PackageState {
  // 已装但禁用 → 不显安装/更新钮（启用/卸载归详情/已装列表，装前冲突由此防——#30.9d）
  if (disabledIds.has(entry.id)) return "disabled";
  const local = localById.get(entry.id);
  if (local === undefined) return "install";
  // E6#33b：可更新判定与详情/发现/铃铛同源单函数（stable-only + semver.gt）——⛔ 顶层 version 裸比
  // E6#73j（G6）：住所闸——随包发货件不显「更新」徽标（点了必失败）
  return updateTargetFor(entry, local.version, local.updatable) ? "update" : "installed";
}

export function useCatalogStatus() {
  // 本地未过滤全量列表——#30b 交叉比对基准（勿用 filter 后的 installed/builtin）；
  // list() EXCLUDES 禁用插件——禁用已装另经 disabledRaw 双源合并，防禁用行误显「安装」
  const { all, disabledRaw, loading: localLoading } = useMarketplacePlugins();

  const localById = useMemo(() => {
    const m = new Map<string, LocalEntryInfo>();
    for (const p of disabledRaw) {
      m.set(p.pluginId, { version: p.version ?? "", updatable: p.updatable, essential: p.essential });
    }
    for (const p of all) {
      m.set(p.pluginId, { version: p.manifest.version ?? "", updatable: p.updatable, essential: p.manifest.essential });
    }
    return m;
  }, [all, disabledRaw]);

  const disabledIds = useMemo(() => new Set(disabledRaw.map((p) => p.pluginId)), [disabledRaw]);

  /* E6#106：已装候选的图标四字段——身份图裁决链的**第一候选**（与详情页同序：
   *  已装 manifest → 目录条目 → 默认彩色块）。为什么必须有它（是防回归、不是美化）：
   *  目录条目的图标已改成**绝对 URL**（包内相对路径未装时不可达），已装行若不接本地 manifest，
   *  就会静默改去拉远程图——既破 06-图标.md「已装不读远程目录图标」，又**断网即裂图**。
   *  启用行优先、禁用行其次（两源都可能装着；同 id 时先写的被覆盖）。 */
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
    (entry: CatalogEntry): PackageState => derivePackageState(entry, localById, disabledIds),
    [localById, disabledIds],
  );

  const essentialOf = useCallback((pluginId: string): boolean => localById.get(pluginId)?.essential === true, [localById]);

  return { statusOf, identityOf, essentialOf, localLoading };
}
