/**
 * repoContext — 商店的**唯一浏览上下文 `currentRepo`**（19 §一；2026-11-22 拍板 D1/D2）。
 *
 * D1：首页 / 分类 / 搜索 / 排行 / 全部插件**全部只算 currentRepo**；没有「全源」概念。
 * D2：作者坞点作者 → 该作者**首位仓库**（本文件只提供 set 原语；首位判定在 `resolveRepoRef`）。
 *
 * 存储：`pluginState("marketplace", "ui.repo")` —— 与 `ui.prefs` 同层（静默浏览状态，⛔ 公开设置）。
 * 三路同步（内存槽 + 事件广播 + pluginState.onChange）照 `uiPrefs` / `storeNav` 既有范式：
 * 池内多表面（入口标签 + 主区商店）与跨进程的迟挂载都读得到。
 *
 * 解析纪律：
 *   - 存的 ref 可能指向**已被删除/停用**的源 ⇒ 解析期回落官方核心仓（⛔ 写盘时偷偷改，
 *     用户重新添加同一源后原选择自动恢复）；
 *   - 作者存在但仓 id 不存在 ⇒ 该作者**首位仓**（D2 同一条规则）；
 *   - 官方作者身份 = 合成域（`officialDomainOf`；官方目录条目没有 authorId）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { officialDomainOf, type AuthorDomain, type AuthorHomepageDecl, type AuthorRepoView } from "./authors";
import type { CatalogEntry } from "./marketCatalog";
import { OFFICIAL_AUTHOR_ID, OFFICIAL_CORE_REPO_ID, isOfficialCoreRepo } from "./officialRepo";
import { realmSlot } from "./realmSlot";

export interface RepoRef {
  authorId: string;
  repoId: string;
}

/** 默认浏览上下文 = 官方核心仓（19 §一：官方市场 = 初始 currentRepo） */
export const OFFICIAL_REPO_REF: RepoRef = {
  authorId: OFFICIAL_AUTHOR_ID,
  repoId: OFFICIAL_CORE_REPO_ID,
};

export interface ResolvedRepo {
  /** 实际解析出的上下文（磁盘值不可用时是回落值） */
  ref: RepoRef;
  authorId: string;
  repoId: string;
  domain?: AuthorDomain;
  repo?: AuthorRepoView;
  name: string;
  storeTitle?: string;
  homepage?: AuthorHomepageDecl;
  /** 当前仓的插件（唯一浏览池；分类/搜索/排行/首页都吃这一份） */
  entries: CatalogEntry[];
  official: boolean;
  core: boolean;
  /** 磁盘值解析不到 → 已回落官方核心仓（UI 可提示，⛔ 不伪装成用户选择） */
  fallback: boolean;
}

const OWNER = "marketplace";
const KEY = "ui.repo";
const CHANNEL = "marketplace:currentRepo";

export function normalizeRepoRef(raw: unknown): RepoRef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const authorId = typeof r.authorId === "string" ? r.authorId.trim() : "";
  const repoId = typeof r.repoId === "string" ? r.repoId.trim() : "";
  if (!authorId || !repoId) return null;
  return { authorId, repoId };
}

interface RepoState {
  ref: RepoRef | null;
  loaded: boolean;
  listeners: Set<() => void>;
  bridgeStarted: boolean;
}

const state = realmSlot<RepoState>("repoContext/v1", () => ({
  ref: null,
  loaded: false,
  listeners: new Set<() => void>(),
  bridgeStarted: false,
}));

function notify(): void {
  state.listeners.forEach((fn) => fn());
}

function apply(raw: unknown): void {
  const next = normalizeRepoRef(raw);
  if (!next) {
    if (state.loaded && state.ref === null) return;
    state.ref = null;
    state.loaded = true;
    notify();
    return;
  }
  if (state.ref && state.ref.authorId === next.authorId && state.ref.repoId === next.repoId) return;
  state.ref = next;
  state.loaded = true;
  notify();
}

function ensureBridge(): void {
  if (state.bridgeStarted) return;
  const ps = window.linkdesk?.pluginState;
  const on = window.linkdesk?.events?.on;
  if (on) on(CHANNEL, apply);
  let un: (() => void) | undefined;
  try {
    un = ps?.onChange?.(OWNER, KEY, apply);
  } catch {
    un = undefined;
  }
  if (!!on || typeof un === "function") state.bridgeStarted = true;
}

/** 同步缓存（UI 首帧；真值由 `readCurrentRepoRef()` 补上；未加载 = null ⇒ 默认官方核心） */
export function getCachedRepoRef(): RepoRef | null {
  ensureBridge();
  return state.ref;
}

/** 磁盘真值（命令面/读取面用；无存储 = null） */
export async function readCurrentRepoRef(): Promise<RepoRef | null> {
  ensureBridge();
  if (state.loaded) return state.ref;
  const ps = window.linkdesk?.pluginState;
  if (ps) {
    try {
      state.ref = normalizeRepoRef(await ps.get(OWNER, KEY));
    } catch {
      state.ref = null;
    }
  }
  state.loaded = true;
  return state.ref;
}

/** 写当前仓（幂等；同一 ref 零落盘）。抛错 = 没记住（⛔ 吞成假成功）。 */
export async function writeCurrentRepoRef(ref: RepoRef): Promise<void> {
  ensureBridge();
  const next = normalizeRepoRef(ref);
  if (!next) throw new Error("currentRepo 非法");
  if (state.ref && state.ref.authorId === next.authorId && state.ref.repoId === next.repoId) return;
  state.ref = next;
  state.loaded = true;
  notify();
  const ps = window.linkdesk?.pluginState;
  if (!ps?.set) throw new Error("pluginState 不可用——currentRepo 未落盘");
  await ps.set(OWNER, KEY, next);
  try {
    window.linkdesk?.events?.emit(CHANNEL, next);
  } catch {
    /* 事件面缺失（预览）——内存槽已生效 */
  }
}

export function onRepoRefChange(fn: () => void): () => void {
  ensureBridge();
  state.listeners.add(fn);
  return () => {
    state.listeners.delete(fn);
  };
}

/** 测试专用：清本模块内存态 */
export function __resetRepoContextState(): void {
  state.ref = null;
  state.loaded = false;
  state.listeners.clear();
  state.bridgeStarted = false;
}

/* ═══ 解析（纯函数） ═══ */

function findDomain(domains: readonly AuthorDomain[], authorId: string): AuthorDomain | undefined {
  const key = authorId.toLowerCase();
  return domains.find((d) => d.authorId.toLowerCase() === key);
}

/**
 * ref → 可渲染上下文。解析不到 = 官方核心仓（`fallback:true`）。
 * @param domains 已加载作者域（`useAuthorDomains` / `ensureAuthorDomains` 之后）
 * @param entries 全量目录条目（官方合成域从官方条目派生）
 */
export function resolveRepoRef(
  ref: RepoRef | null,
  domains: readonly AuthorDomain[],
  entries: readonly CatalogEntry[],
): ResolvedRepo {
  const wanted = ref ?? OFFICIAL_REPO_REF;

  const buildOfficial = (): ResolvedRepo => {
    const domain = officialDomainOf(entries) ?? undefined;
    const wantedOfficialRepo =
      wanted.authorId.toLowerCase() === OFFICIAL_AUTHOR_ID ? wanted.repoId : OFFICIAL_CORE_REPO_ID;
    const repo =
      domain?.repos.find((r) => r.id === wantedOfficialRepo) ?? domain?.repos[0];
    return {
      ref: { authorId: OFFICIAL_AUTHOR_ID, repoId: repo?.id ?? OFFICIAL_CORE_REPO_ID },
      authorId: OFFICIAL_AUTHOR_ID,
      repoId: repo?.id ?? OFFICIAL_CORE_REPO_ID,
      ...(domain ? { domain } : {}),
      ...(repo ? { repo } : {}),
      name: repo?.name ?? "官方 Plugin Store",
      ...(repo?.storeTitle ? { storeTitle: repo.storeTitle } : { storeTitle: "官方 Plugin Store" }),
      ...(repo?.homepage ? { homepage: repo.homepage } : {}),
      entries: repo?.plugins ?? [],
      official: true,
      core: isOfficialCoreRepo(OFFICIAL_AUTHOR_ID, repo?.id ?? OFFICIAL_CORE_REPO_ID),
      fallback: false,
    };
  };

  if (wanted.authorId.toLowerCase() === OFFICIAL_AUTHOR_ID) return buildOfficial();

  const domain = findDomain(domains, wanted.authorId);
  if (!domain) {
    const official = buildOfficial();
    return { ...official, fallback: true };
  }
  const repo = domain.repos.find((r) => r.id === wanted.repoId) ?? domain.repos[0];
  if (!repo) {
    return {
      ref: { authorId: domain.authorId, repoId: "" },
      authorId: domain.authorId,
      repoId: "",
      domain,
      name: domain.name,
      ...(domain.storeTitle ? { storeTitle: domain.storeTitle } : {}),
      entries: [],
      official: domain.official,
      core: false,
      fallback: false,
    };
  }
  return {
    ref: { authorId: domain.authorId, repoId: repo.id },
    authorId: domain.authorId,
    repoId: repo.id,
    domain,
    repo,
    name: repo.name,
    ...((repo.storeTitle ?? domain.storeTitle)
      ? { storeTitle: repo.storeTitle ?? domain.storeTitle }
      : {}),
    ...(repo.homepage ? { homepage: repo.homepage } : {}),
    entries: repo.plugins,
    official: domain.official,
    core: isOfficialCoreRepo(domain.authorId, repo.id),
    fallback: false,
  };
}

/* ═══ React 绑定（视图唯一读口） ═══ */

export interface CurrentRepo extends ResolvedRepo {
  setRepo: (ref: RepoRef) => void;
}

/**
 * 当前仓（订阅持久层；domains/entries 变化时重新解析）。
 * ⚠️ `domains` 尚未加载时第三方 ref 会短暂回落官方——作者域到达后自动切回（同一 ref 重新解析）。
 */
export function useCurrentRepo(
  domains: readonly AuthorDomain[],
  entries: readonly CatalogEntry[],
): CurrentRepo {
  const [tick, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    state.listeners.add(rerender);
    void readCurrentRepoRef().then(() => {
      if (alive) rerender();
    });
    return () => {
      alive = false;
      state.listeners.delete(rerender);
    };
  }, [rerender]);
  const resolved = useMemo(() => {
    void tick; // 持久层变化（state.ref 在 realmSlot 里）不走 React state ⇒ 用 tick 触发重新解析
    return resolveRepoRef(state.ref, domains, entries);
  }, [domains, entries, tick]);
  return {
    ...resolved,
    setRepo: useCallback((ref: RepoRef) => {
      void writeCurrentRepoRef(ref).catch(() => {
        /* 写失败 = 没记住；UI 保持在解析值，下次进入仍回落（⛔ 假成功提示在这里不做）*/
      });
    }, []),
  };
}
