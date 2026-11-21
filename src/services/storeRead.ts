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
import type { CatalogEntry } from "./marketCatalog";
import { primaryCategoryOf } from "./marketCatalog";
import { getCatalogResult } from "./marketplaceShared/catalogStore";
import { derivePackageState, type LocalEntryInfo, type PackageState } from "./catalogStatus";
import { readCachedDownloadCount } from "./downloadCounts";
import { readSourceRecords, type SourceRecord } from "./marketSources";
import { ensureAuthorDomains, getLoadedAuthorDomains, knownAuthorIds } from "./authors";
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
  core: boolean;
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
  /** 当前路由下实际可见的条目 id（分类页按 category+authorId、作者店按仓、首页/榜单/库按各自可见集） */
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

function authorLabel(entry: CatalogEntry): string | undefined {
  if (!entry.author) return undefined;
  return typeof entry.author === "string" ? entry.author : entry.author.name;
}

function localMaps(list: PluginListEntry[], disabled: PluginInfoEntry[]) {
  const localById = new Map<string, LocalEntryInfo>();
  const disabledIds = new Set<string>();
  for (const p of disabled) {
    disabledIds.add(p.pluginId);
    localById.set(p.pluginId, { version: p.version ?? "", updatable: p.updatable, core: p.core });
  }
  for (const p of list) {
    localById.set(p.pluginId, {
      version: p.manifest.version ?? "",
      updatable: p.updatable,
      core: p.manifest.core,
    });
  }
  return { localById, disabledIds };
}

/** 只读快照——命令面消费；任何字段缺失如实留空，⛔ 不猜。 */
export async function readStoreState(): Promise<StoreReadState> {
  const route = await readCurrentStoreRoute();
  const catalog = getCatalogResult();
  const pm = window.linkdesk?.pluginManager;
  const [list, disabled, licenses, sources] = await Promise.all([
    pm?.list?.() ?? Promise.resolve([] as PluginListEntry[]),
    pm?.getDisabled?.() ?? Promise.resolve([] as PluginInfoEntry[]),
    window.linkdesk?.licenses?.list?.() ?? Promise.resolve([]),
    readSourceRecords(),
  ]);
  const { localById, disabledIds } = localMaps(list, disabled);
  const licenseById = new Map(
    (licenses ?? [])
      .filter((x) => x && typeof x.pluginId === "string")
      .map((x) => [x.pluginId, { exp: typeof x.exp === "number" ? x.exp : undefined }] as const),
  );

  const entries: StoreReadEntry[] = catalog.entries.map((entry) => {
    const state = derivePackageState(entry, localById, disabledIds);
    const core = localById.get(entry.id)?.core === true;
    const license = licenseById.get(entry.id) ?? null;
    return {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      description: entry.description,
      author: authorLabel(entry),
      authorId: entry.authorId,
      category: entry.category,
      categories: entry.categories,
      sourceName: entry.sourceName,
      official: entry.official,
      downloadUrl: entry.downloadUrl,
      pricing: entry.pricing,
      state,
      core,
      license,
      capabilities: {
        install: state === "install" && !!entry.downloadUrl,
        update: state === "update",
        uninstall: localById.has(entry.id) && !core,
        disable: state === "installed",
        enable: state === "disabled",
      },
    };
  });

  const ids = await knownAuthorIds();
  await ensureAuthorDomains(ids);
  const authors: StoreReadAuthor[] = getLoadedAuthorDomains().map((a) => ({
    authorId: a.authorId,
    name: a.name,
    storeTitle: a.storeTitle,
    repos: a.repos.map((r) => ({ id: r.id, name: r.name, pluginIds: r.plugins.map((p) => p.id) })),
  }));

  const unique = (ids: string[]) => [...new Set(ids)];
  const topByDownloads = (n: number) =>
    [...entries]
      .sort((a, b) => {
        const da = readCachedDownloadCount(a.downloadUrl) ?? -1;
        const db = readCachedDownloadCount(b.downloadUrl) ?? -1;
        return db - da || a.name.localeCompare(b.name, "zh");
      })
      .slice(0, n)
      .map((e) => e.id);

  const visibleEntryIds = (() => {
    switch (route.page) {
      case "category":
        if (route.official) {
          return entries
            .filter((e) => e.official === true && primaryCategoryOf(e) === route.category)
            .map((e) => e.id);
        }
        return entries
          .filter(
            (e) =>
              primaryCategoryOf(e) === route.category &&
              (!route.authorId || (e.authorId ?? "").toLowerCase() === route.authorId.toLowerCase()),
          )
          .map((e) => e.id);
      case "author": {
        const domain = authors.find((a) => a.authorId.toLowerCase() === route.authorId.toLowerCase());
        if (!domain) return entries.map((e) => e.id);
        const inStore = new Set(domain.repos.flatMap((r) => r.pluginIds));
        return entries.filter((e) => inStore.has(e.id)).map((e) => e.id);
      }
      case "home": {
        const banner = catalog.collections.find((c) => c.official === true && c.layout === "banner");
        const sections = [...catalog.collections]
          .filter((c) => c.official === true && c.layout !== "banner")
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return unique([
          ...(banner?.items ?? []).slice(0, 5),
          ...sections.flatMap((c) => c.items),
          ...entries
            .filter((e) => e.official === true && primaryCategoryOf(e) === "themes")
            .map((e) => e.id),
          ...topByDownloads(8),
        ]);
      }
      case "rank":
        return topByDownloads(50);
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
        if (!q) return entries.map((e) => e.id);
        return entries
          .filter((e) => [e.name, e.id, e.description ?? ""].some((s) => s.toLowerCase().includes(q)))
          .map((e) => e.id);
      }
      default:
        return [];
    }
  })();

  const visibleAuthorIds =
    route.page === "home" || route.page === "authors"
      ? [...authors].sort((a, b) => a.name.localeCompare(b.name, "zh")).map((a) => a.authorId)
      : route.page === "author"
        ? [route.authorId]
        : [];

  return {
    ok: true,
    route,
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
