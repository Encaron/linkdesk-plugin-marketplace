/**
 * storeRead —— 商店的**AI 读取面**（`marketplace.getState` 的唯一实现）。
 *
 * 为什么需要它（2026-11-21 AI 友好总纲）：命令面只解决“我能操作什么”，AI 还要能**读到**
 * 「现在在哪个页 / 当前目录里有什么 / 每个插件多少钱和什么状态 / 作者与仓库怎么分组 /
 * 下一步有哪些命令与操作」。本文件只读、零写入，数据全部复用既有单点：
 *   - 目录：`catalogStore.getCatalogResult()`（唯一目录投影）
 *   - 本地状态：`pluginManager.list()/getDisabled()` + `catalogStatus.derivePackageState`（唯一推导）
 *   - 权益：壳 `licenses.list()`（档案在壳，市场只读）
 *   - 作者：`authors.knownAuthorIds()/ensureAuthorDomains()/getLoadedAuthorDomains()`
 *   - 来源：`marketSources.readSourceRecords()`
 *   - 路由：`storeNav.readCurrentStoreRoute()`（StoreView 每次实际导航回写）
 *   - 导航命令：`storeNav.NAV_COMMANDS`（每个页面一条，门禁测试守着）
 * ⛔ 不读 DOM、不点鼠标——外部 AI 直接用命令拿到结构化结果。
 */

import type { PluginInfoEntry, PluginListEntry } from "@linkdesk/contracts";
import { authorLabel } from "./catalogText"; // P1 归一化：作者显示名唯一实现
import type { CatalogEntry } from "./marketCatalog";
import { primaryCategoryOf } from "./marketCatalog";
import { getCatalogResult } from "./marketplaceShared/catalogStore";
import { derivePackageState, type LocalEntryInfo, type PackageState } from "./catalogStatus";
import { readCachedDownloadCount } from "./downloadCounts";
import { readSourceRecords, type SourceRecord } from "./marketSources";
import { ensureAuthorDomains, getLoadedAuthorDomains, knownAuthorIds } from "./authors";
import { readCurrentRepoRef, resolveRepoRef } from "./repoContext";
import { buildSourceOrder, declaredAuthorMapOf, declaredRepoMapOf, orderSnapshot } from "./sourceOrder";
import { readRawSourceConfig } from "./sourceAdmin";
import { NAV_COMMANDS, readCurrentStoreRoute, type StoreNavTarget } from "./storeNav";

export interface StoreReadEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  authorId?: string;
  category?: string;
  categories?: string[];
  sourceName?: string;
  /** 官方默认目录源条目（官方店「更多」的页主范围判据） */
  official?: boolean;
  downloadUrl?: string;
  /** 原样声明：免费件无此字段；买断/订阅看 model/price/currency/period */
  pricing?: CatalogEntry["pricing"];
  /** 本地状态（唯一推导：install / installed / update / disabled） */
  state: PackageState;
  essential: boolean;
  /** 壳权益投影（exp 缺省 = 永久） */
  license: { exp?: number } | null;
  /** 可执行能力——对应壳 pluginManager API（install/uninstall/disable/enable/update） */
  capabilities: {
    install: boolean;
    update: boolean;
    uninstall: boolean;
    disable: boolean;
    enable: boolean;
  };
}

export interface StoreReadAuthorRepo {
  id: string;
  name: string;
  pluginIds: string[];
}

export interface StoreReadAuthor {
  authorId: string;
  name: string;
  storeTitle?: string;
  repos: StoreReadAuthorRepo[];
}

export interface StoreReadCollection {
  id: string;
  title: string;
  layout?: string;
  items: string[];
}

export interface StoreReadSource {
  kind: SourceRecord["kind"];
  url?: string;
  path?: string;
  authorId: string;
  repoId: string;
  enabled: boolean;
  status: SourceRecord["status"];
}

export interface StoreReadState {
  ok: true;
  /** 当前实际页面（不是最后一条命令意图） */
  route: StoreNavTarget;
  /** 唯一浏览上下文（D1）：首页/分类/搜索/排行/全部插件都只算它 */
  currentRepo: { authorId: string; repoId: string };
  currentRepoName: string;
  /** 作者容器顺序（`marketplaceSources` 数组序；本地组不在列） */
  authorOrder: string[];
  /** 作者 → 仓顺序（官方核心仓恒第一） */
  repoOrder: Record<string, string[]>;
  /** 作者顺序里的可见作者（有已启用源；官方恒可见） */
  visibleAuthors: string[];
  /** 可见仓（按作者/仓顺序展开） */
  visibleRepos: Array<{ authorId: string; repoId: string }>;
  /** 当前路由下实际可见的条目 id（分类页按 category、作者店按仓、首页/榜单/库按各自可见集） */
  visibleEntryIds: string[];
  /** 当前页可见作者（首页/作者列表按名排序；作者店只有当前作者；其它页空） */
  visibleAuthorIds: string[];
  /** 每个页面一条导航命令（AI 可据此切页） */
  navCommands: string[];
  entries: StoreReadEntry[];
  collections: StoreReadCollection[];
  authors: StoreReadAuthor[];
  sources: StoreReadSource[];
  counts: {
    entries: number;
    installed: number;
    updates: number;
    authors: number;
    remoteSources: number;
  };
}

function localMaps(list: PluginListEntry[], disabled: PluginInfoEntry[]) {
  const localById = new Map<string, LocalEntryInfo>();
  const disabledIds = new Set<string>();
  for (const p of disabled) {
    disabledIds.add(p.pluginId);
    localById.set(p.pluginId, { version: p.version ?? "", updatable: p.updatable, essential: p.essential });
  }
  for (const p of list) {
    localById.set(p.pluginId, {
      version: p.manifest.version ?? "",
      updatable: p.updatable,
      essential: p.manifest.essential,
    });
  }
  return { localById, disabledIds };
}

/** 只读快照——命令面消费；任何字段缺失如实留空，⛔ 不猜。 */
export async function readStoreState(): Promise<StoreReadState> {
  const route = await readCurrentStoreRoute();
  const catalog = getCatalogResult();
  const pm = window.linkdesk?.pluginManager;
  const [list, disabled, licenses, sources, rawSources, storedRepo] = await Promise.all([
    pm?.list?.() ?? Promise.resolve([] as PluginListEntry[]),
    pm?.getDisabled?.() ?? Promise.resolve([] as PluginInfoEntry[]),
    window.linkdesk?.licenses?.list?.() ?? Promise.resolve([]),
    readSourceRecords(),
    readRawSourceConfig(),
    readCurrentRepoRef(),
  ]);
  const { localById, disabledIds } = localMaps(list, disabled);
  const licenseById = new Map(
    (licenses ?? [])
      .filter((x) => x && typeof x.pluginId === "string")
      .map((x) => [x.pluginId, { exp: typeof x.exp === "number" ? x.exp : undefined }] as const),
  );

  const entries: StoreReadEntry[] = catalog.entries.map((entry) => {
    const state = derivePackageState(entry, localById, disabledIds);
    const essential = localById.get(entry.id)?.essential === true;
    const license = licenseById.get(entry.id) ?? null;
    return {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      description: entry.description,
      author: authorLabel(entry.author),
      authorId: entry.authorId,
      category: entry.category,
      categories: entry.categories,
      sourceName: entry.sourceName,
      official: entry.official,
      downloadUrl: entry.downloadUrl,
      pricing: entry.pricing,
      state,
      essential,
      license,
      capabilities: {
        install: state === "install" && !!entry.downloadUrl,
        update: state === "update",
        uninstall: localById.has(entry.id) && !essential,
        disable: state === "installed",
        enable: state === "disabled",
      },
    };
  });

  const ids = await knownAuthorIds();
  await ensureAuthorDomains(ids);
  const domains = getLoadedAuthorDomains();
  const authors: StoreReadAuthor[] = domains.map((a) => ({
    authorId: a.authorId,
    name: a.name,
    storeTitle: a.storeTitle,
    repos: a.repos.map((r) => ({ id: r.id, name: r.name, pluginIds: r.plugins.map((p) => p.id) })),
  }));
  // D1（19 §一）：currentRepo 是唯一浏览上下文；磁盘 ref 不可用 ⇒ 回落官方核心仓（fallback 如实）
  const repo = resolveRepoRef(storedRepo, domains, catalog.entries);
  const repoEntryIds = new Set(repo.entries.map((e) => e.id));
  const order = buildSourceOrder(rawSources, {
    declaredAuthorBySource: declaredAuthorMapOf(catalog.entries),
    declaredRepoBySourceUrl: declaredRepoMapOf(domains),
  });
  const orderSnap = orderSnapshot(order);

  const unique = (ids: string[]) => [...new Set(ids)];
  const topByDownloads = (n: number, pool: StoreReadEntry[] = entries) =>
    [...pool]
      .sort((a, b) => {
        const da = readCachedDownloadCount(a.downloadUrl) ?? -1;
        const db = readCachedDownloadCount(b.downloadUrl) ?? -1;
        return db - da || a.name.localeCompare(b.name, "zh");
      })
      .slice(0, n)
      .map((e) => e.id);
  const repoEntriesRead = entries.filter((e) => repoEntryIds.has(e.id));

  const visibleEntryIds = (() => {
    switch (route.page) {
      case "category":
        // D1：分类页只算 currentRepo（⛔ 不再吃 route.authorId/official 的全源预过滤）
        return repoEntriesRead
          .filter((e) => primaryCategoryOf(e) === route.category)
          .map((e) => e.id);
      case "author": {
        const domain = authors.find((a) => a.authorId.toLowerCase() === route.authorId.toLowerCase());
        if (!domain) return repoEntriesRead.map((e) => e.id);
        const inStore = new Set(domain.repos.flatMap((r) => r.pluginIds));
        return entries.filter((e) => inStore.has(e.id)).map((e) => e.id);
      }
      case "home":
        // D1：首页 = 当前仓首页（批 B 接槽位后这里再按声明板块展开）
        return repo.entries.map((e) => e.id);
      case "repo-all":
        // 全部插件页（19 §七）：范围 = currentRepo，⛔ 跨仓混合
        return repo.entries.map((e) => e.id);
      case "rank":
        return topByDownloads(50, repoEntriesRead);
      case "library": {
        const installed = new Set(list.map((p) => p.pluginId));
        const disabledSet = new Set(disabled.map((p) => p.pluginId));
        const installedIds = entries
          .filter((e) => installed.has(e.id) || disabledSet.has(e.id))
          .map((e) => e.id);
        const purchasedIds = entries
          .filter((e) => !!e.pricing && licenseById.has(e.id) && !installed.has(e.id))
          .map((e) => e.id);
        return unique([...installedIds, ...purchasedIds]);
      }
      case "search": {
        const q = route.query.trim().toLowerCase();
        if (!q) return repoEntriesRead.map((e) => e.id);
        return repoEntriesRead
          .filter((e) => [e.name, e.id, e.description ?? ""].some((s) => s.toLowerCase().includes(q)))
          .map((e) => e.id);
      }
      default:
        return [];
    }
  })();

  // 作者列表 = 顺序模型里的作者 ∪ 已加载作者域（厂商整店可能没有用户源；官方恒在）
  const visibleAuthors = [...order.authorOrder];
  for (const d of domains) {
    if (!visibleAuthors.some((id) => id.toLowerCase() === d.authorId.toLowerCase())) {
      visibleAuthors.push(d.authorId);
    }
  }
  const visibleAuthorIds =
    route.page === "authors"
      ? [...visibleAuthors]
      : route.page === "home"
        ? [repo.authorId]
        : route.page === "author"
          ? [route.authorId]
          : [];
  const visibleRepos = visibleAuthors.flatMap((authorId) => {
    const key = Object.keys(order.repoOrder).find((k) => k.toLowerCase() === authorId.toLowerCase());
    const ordered = key ? order.repoOrder[key] : [];
    const domain = domains.find((d) => d.authorId.toLowerCase() === authorId.toLowerCase());
    const extra = (domain?.repos ?? []).map((r) => r.id).filter((id) => !ordered.includes(id));
    return [...ordered, ...extra].map((repoId) => ({ authorId, repoId }));
  });

  return {
    ok: true,
    route,
    currentRepo: { authorId: repo.authorId, repoId: repo.repoId },
    currentRepoName: repo.name,
    authorOrder: orderSnap.authorOrder,
    repoOrder: orderSnap.repoOrder,
    visibleAuthors,
    visibleRepos,
    visibleEntryIds,
    visibleAuthorIds,
    navCommands: Object.values(NAV_COMMANDS),
    entries,
    collections: catalog.collections.map((c) => ({
      id: c.id,
      title: c.title,
      layout: c.layout,
      items: [...c.items],
    })),
    authors,
    sources: sources.map((s) => ({
      kind: s.kind,
      url: s.url,
      path: s.path,
      authorId: s.authorId,
      repoId: s.repoId,
      enabled: s.enabled,
      status: s.status,
    })),
    counts: {
      entries: entries.length,
      installed: list.length,
      updates: entries.filter((e) => e.state === "update").length,
      authors: authors.length,
      remoteSources: sources.filter((s) => s.kind === "remote" && s.enabled).length,
    },
  };
}
