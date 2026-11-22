/**
 * uiPrefs —— UI 偏好（视图方式/排序）的**唯一读写口**（06 §八，R4-2.4 I9）。
 *
 * 存储：`pluginState("marketplace", "ui.prefs")` → 壳 `plugin-states.json`（⛔ 不自建文件、
 *   ⛔ 不进 `contributes.configuration`——那是用户可见的公开设置，视图习惯是静默状态）。
 * 键集（06 §八）：`{ libView, libSort, authorView, authorSort, catView, catSort }`。
 *
 * 取值域 = **蓝图 v3 的真实读数**（mockups/03-主区专注蓝图-v3.html）：
 *   - 视图 `grid`（平铺）｜`list`（详细）——顺序恒「平铺在前」（10 §一 UI 归一化）；
 *   - 分类排序 `dl`｜`upd`｜`az`｜`author`｜`repo`（默认 `dl`）；
 *   - 库排序 `name`｜`updated`｜`size`｜`source`｜`author`｜`repo`（默认 `name`）；
 *   - 作者排序 `name`｜`plugins`｜`repos`（默认 `name`）；
 *   - 缺省视图：库 `list`（管理面默认详细行）、作者/分类 `grid`。
 * 读缺省回落以上默认值（坏值/缺字段一律回落，⛔ 让坏配置炸 UI）。
 *
 * 跨表面：内存槽 + 事件广播 + pluginState.onChange 三路（消费方各自 realm 的副本都能跟上）。
 */

import { realmSlot } from "../realmSlot";

export type ViewMode = "grid" | "list";
export type LibSort = "name" | "updated" | "size" | "source" | "author" | "repo";
export type CatSort = "dl" | "upd" | "az" | "author" | "repo";
export type AuthorSort = "name" | "plugins" | "repos";

export interface UIPrefs {
  libView: ViewMode;
  libSort: LibSort;
  authorView: ViewMode;
  authorSort: AuthorSort;
  catView: ViewMode;
  catSort: CatSort;
  /** 19 §3.2：作者页一次性提示已关闭（× 之后工具栏留小 ?；清 app data/市场缓存才重置） */
  authorTipDismissed: boolean;
  /** 19 §六：作者坞底部提示已关闭（同上） */
  dockTipDismissed: boolean;
  /** 2026-11-23 用户口径：作者页上次打开的模式（浏览/管理来源）——直接点作者时沿用；
   *  坞的「作者页」「管理来源」按钮与命令面 openAuthors/openSources 会显式覆盖并写回。 */
  authorMode: "browse" | "manage";
}

export const DEFAULT_UI_PREFS: UIPrefs = {
  libView: "list",
  libSort: "name",
  authorView: "grid",
  authorSort: "name",
  catView: "grid",
  catSort: "dl",
  authorTipDismissed: false,
  dockTipDismissed: false,
  authorMode: "browse",
};

const AUTHOR_MODES = ["browse", "manage"] as const;

const VIEW_MODES: readonly ViewMode[] = ["grid", "list"];
const LIB_SORTS: readonly LibSort[] = ["name", "updated", "size", "source", "author", "repo"];
const CAT_SORTS: readonly CatSort[] = ["dl", "upd", "az", "author", "repo"];
const AUTHOR_SORTS: readonly AuthorSort[] = ["name", "plugins", "repos"];

/** 页面 → 两个偏好键（`marketplace.setViewPrefs` 的 page 参数域） */
const PAGE_KEYS = {
  lib: { view: "libView", sort: "libSort" },
  author: { view: "authorView", sort: "authorSort" },
  cat: { view: "catView", sort: "catSort" },
} as const satisfies Record<string, { view: keyof UIPrefs; sort: keyof UIPrefs }>;

export type PrefPage = keyof typeof PAGE_KEYS;

const OWNER = "marketplace";
const KEY = "ui.prefs";
const CHANNEL = "marketplace:uiPrefs";

interface PrefsStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  onChange?(key: string, cb: (value: unknown) => void): () => void;
}

let _store: PrefsStore | null = null;
/** 测试注入 store；传 null 恢复 `window.linkdesk.pluginState`（owner "marketplace"） */
export function __setPrefsStore(store: PrefsStore | null): void {
  _store = store;
}

function store(): PrefsStore | null {
  if (_store !== null) return _store;
  const ps = window.linkdesk?.pluginState;
  if (!ps) return null;
  return {
    get: (k) => ps.get(OWNER, k),
    set: (k, v) => ps.set(OWNER, k, v),
    onChange: (k, cb) => ps.onChange(OWNER, k, cb),
  };
}

interface PrefsState {
  prefs: UIPrefs | null;
  listeners: Set<() => void>;
  bridgeStarted: boolean;
}

const state = realmSlot<PrefsState>("uiPrefs/v1", () => ({
  prefs: null,
  listeners: new Set<() => void>(),
  bridgeStarted: false,
}));

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** 读侧归一——六个键逐个校验，坏值回落对应默认 */
export function normalizeUIPrefs(raw: unknown): UIPrefs {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_UI_PREFS };
  const r = raw as Record<string, unknown>;
  return {
    libView: pick(r.libView, VIEW_MODES, DEFAULT_UI_PREFS.libView),
    libSort: pick(r.libSort, LIB_SORTS, DEFAULT_UI_PREFS.libSort),
    authorView: pick(r.authorView, VIEW_MODES, DEFAULT_UI_PREFS.authorView),
    authorSort: pick(r.authorSort, AUTHOR_SORTS, DEFAULT_UI_PREFS.authorSort),
    catView: pick(r.catView, VIEW_MODES, DEFAULT_UI_PREFS.catView),
    catSort: pick(r.catSort, CAT_SORTS, DEFAULT_UI_PREFS.catSort),
    authorTipDismissed: r.authorTipDismissed === true,
    dockTipDismissed: r.dockTipDismissed === true,
    authorMode: pick(r.authorMode, AUTHOR_MODES, DEFAULT_UI_PREFS.authorMode),
  };
}

function notify(): void {
  state.listeners.forEach((fn) => fn());
}

function apply(raw: unknown): void {
  const next = normalizeUIPrefs(raw);
  if (state.prefs && JSON.stringify(next) === JSON.stringify(state.prefs)) return;
  state.prefs = next;
  notify();
}

function ensureBridge(): void {
  if (state.bridgeStarted) return;
  const s = store();
  const on = window.linkdesk?.events?.on;
  if (on) on(CHANNEL, apply);
  s?.onChange?.(KEY, apply);
  if (!!on || typeof s?.onChange === "function") state.bridgeStarted = true;
}

/** 同步缓存读（UI 首帧用——真值由 `readUIPrefs()` 补上；未加载 = 默认值） */
export function getCachedUIPrefs(): UIPrefs {
  ensureBridge();
  return state.prefs ?? { ...DEFAULT_UI_PREFS };
}

export async function readUIPrefs(): Promise<UIPrefs> {
  ensureBridge();
  if (state.prefs) return state.prefs;
  const s = store();
  if (s) {
    try {
      state.prefs = normalizeUIPrefs(await s.get(KEY));
    } catch {
      state.prefs = { ...DEFAULT_UI_PREFS };
    }
  }
  return state.prefs ?? { ...DEFAULT_UI_PREFS };
}

/**
 * 合并写（幂等）——只改传入的键；无变化不落盘。
 * @throws 持久面缺失/写入抛错（⛔ 不吞成假成功——调用方要知道偏好没记住）
 */
export async function writeUIPrefs(patch: Partial<UIPrefs>): Promise<UIPrefs> {
  const s = store();
  if (!s) throw new Error("pluginState 不可用——UI 偏好未落盘");
  const current = await readUIPrefs();
  const next = normalizeUIPrefs({ ...current, ...patch });
  const changed = JSON.stringify(next) !== JSON.stringify(current);
  state.prefs = next;
  if (changed) {
    await s.set(KEY, next);
    notify();
    try {
      window.linkdesk?.events?.emit(CHANNEL, next);
    } catch {
      /* 事件面缺失（预览）——内存槽已生效 */
    }
  }
  return next;
}

export function onUIPrefsChange(fn: () => void): () => void {
  ensureBridge();
  state.listeners.add(fn);
  return () => {
    state.listeners.delete(fn);
  };
}

/** 测试专用：清本模块内存态（槽对象被模块捕获，`__resetRealmSlots` 清不到它）。产线不调。 */
export function __resetUIPrefsState(): void {
  state.prefs = null;
  state.listeners.clear();
  state.bridgeStarted = false;
}

/**
 * 命令 `marketplace.setViewPrefs` 的落点：校验 page/view/sort 后合并写。
 * 幂等——同一组值重复调用零落盘、零副作用。
 */
export async function setViewPrefs(
  page: string,
  opts: { view?: string; sort?: string },
): Promise<{ ok: boolean; reason?: string; prefs?: UIPrefs }> {
  if (!(page in PAGE_KEYS)) return { ok: false, reason: "bad-page" };
  const keys = PAGE_KEYS[page as PrefPage];
  const patch: Partial<UIPrefs> = {};

  if (opts.view !== undefined) {
    if (!(VIEW_MODES as readonly string[]).includes(opts.view)) return { ok: false, reason: "bad-view" };
    (patch as Record<string, unknown>)[keys.view] = opts.view;
  }
  if (opts.sort !== undefined) {
    const allowed =
      keys.sort === "libSort" ? LIB_SORTS : keys.sort === "catSort" ? CAT_SORTS : AUTHOR_SORTS;
    if (!(allowed as readonly string[]).includes(opts.sort)) return { ok: false, reason: "bad-sort" };
    // 三个 sort 键的取值域互不相同——上面的 allowed 已按 page 校验，这里只是把联合类型收窄
    (patch as Record<string, unknown>)[keys.sort] = opts.sort;
  }

  if (Object.keys(patch).length === 0) return { ok: true }; // 只有 page：幂等 no-op
  const prefs = await writeUIPrefs(patch);
  return { ok: true, prefs };
}
