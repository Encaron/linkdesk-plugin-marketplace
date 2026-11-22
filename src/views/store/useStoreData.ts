/**
 * useStoreData — 商店各视图的**一份数据底座**（目录 ⊕ 本地状态 ⊕ 权益 ⊕ 下载数）。
 *
 * 纪律：视图只订阅这一份——⛔ 各页自建第二份「已装列表/更新状态/下载数」（10 §一 逻辑归一化）。
 * 状态推导 = `services/catalogStatus`（与侧栏同一实现）；权益 = 壳 licenses 只读投影；
 * 下载数 = `services/downloadCounts` 批量口（10 分钟缓存、并发 3）。
 */

import { useCallback, useEffect, useState } from "react";
import type { CatalogEntry } from "../../services/marketCatalog";
import { useMarketplaceCatalog } from "../../services/marketplaceShared";
import { useOnlineStatus } from "../../services/marketplaceShared";
import { useMarketplacePlugins } from "../../services/marketplaceShared";
import { useCatalogStatus, type PackageState, type LocalIdentity } from "../../services/catalogStatus";
import { pickInstallJob, useInstallJobsSubscription } from "../../services/installJobs";
import { useLicenseEntitlements } from "../../services/licensesView";
import { useDownloadCounts } from "../../services/downloadCounts";
import { readSourceRecords } from "../../services/marketSources";
import { useAuthorDomains, type AuthorDomain } from "../../services/authors";
import { useCurrentRepo, type CurrentRepo } from "../../services/repoContext";
import type { StoreCardContext } from "./cards/cardParts";
import { countByBucket } from "./storeData";

export interface StoreData {
  catalog: ReturnType<typeof useMarketplaceCatalog>;
  online: boolean;
  statusOf: (entry: CatalogEntry) => PackageState;
  identityOf: (pluginId: string) => LocalIdentity | undefined;
  coreOf: (pluginId: string) => boolean;
  localLoading: boolean;
  installedCount: number;
  updateCount: number;
  /** 已配置的作者源数（remote；作者卡区的空态判据——0 = 还没有作者源） */
  authorSourceCount: number;
  /** 作者卡数量（作者域聚合后的作者数；rail「作者」徽标——⛔ 不是源数） */
  authorCount: number;
  /** 已加载作者域（顺序模型/仓解析的输入；视图 ⛔ 各自再拉一份） */
  authorDomains: AuthorDomain[];
  /** 唯一浏览上下文（D1）：首页/分类/搜索/排行/全部插件都只算它（19 §一） */
  repo: CurrentRepo;
  counts: ReadonlyMap<string, number>;
  /** rail 逐分类计数（**当前仓**口径；19 §5.2——切仓即刷新） */
  railOrderCounts: ReadonlyMap<string, number>;
  /** R4-3.21：权益投影收敛（验签入库后调）——卡/库/详情同源刷新 */
  refreshLicenses: () => void;
  /** 逐卡上下文（状态/核心/权益/job/下载数/身份图一次算好） */
  ctxOf: (entry: CatalogEntry) => StoreCardContext;
}

export function useStoreData(): StoreData {
  const catalog = useMarketplaceCatalog();
  const { domains: authorDomains } = useAuthorDomains(catalog.entries.length);
  const repo = useCurrentRepo(authorDomains, catalog.entries);
  // 订阅一次 job 表（壳广播全量快照）——卡片内用纯函数 pickInstallJob 现查，⛔ 每卡一个订阅
  useInstallJobsSubscription();
  const online = useOnlineStatus();
  const { statusOf, identityOf, coreOf, localLoading } = useCatalogStatus();
  const { all } = useMarketplacePlugins();
  const { map: licenses, refresh: refreshLicenses } = useLicenseEntitlements();
  const urls = catalog.entries.map((e) => e.downloadUrl).filter((u): u is string => !!u);
  const counts = useDownloadCounts(urls);
  // 19 §5.2：左栏分类计数 = **当前仓**计数（切仓即刷新；不再是全源合并）
  const railOrderCounts = countByBucket(repo.entries, catalog.railOrder);

  const updateCount = catalog.entries.reduce((n, e) => n + (statusOf(e) === "update" ? 1 : 0), 0);

  const [authorSourceCount, setAuthorSourceCount] = useState(0);
  useEffect(() => {
    let alive = true;
    void readSourceRecords().then((rs) => {
      if (!alive) return;
      setAuthorSourceCount(rs.filter((r) => r.kind === "remote" && r.enabled).length);
    });
    return () => {
      alive = false;
    };
  }, [catalog.entries]);

  const ctxOf = useCallback(
    (entry: CatalogEntry): StoreCardContext => ({
      state: statusOf(entry),
      core: coreOf(entry.id),
      license: licenses.get(entry.id) ?? null,
      job: pickInstallJob(entry.id),
      online,
      dl: entry.downloadUrl ? counts.get(entry.downloadUrl) : undefined,
      installedIdentity: identityOf(entry.id),
    }),
    [statusOf, coreOf, licenses, online, counts, identityOf],
  );

  return {
    catalog,
    online,
    statusOf,
    identityOf,
    coreOf,
    localLoading,
    installedCount: all.length,
    updateCount,
    authorSourceCount,
    authorCount: authorDomains.length,
    authorDomains,
    repo,
    counts,
    railOrderCounts,
    refreshLicenses,
    ctxOf,
  };
}
