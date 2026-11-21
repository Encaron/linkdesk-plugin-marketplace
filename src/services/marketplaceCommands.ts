/**
 * marketplaceCommands —— I15 命令面（09 §三·补：新增 16 ＋既有 addSource）。
 *
 * 为什么集中在一个文件：09 的规则是「每个 GUI 动作都有可编程入口，且**同一动作只有一个 id**」。
 * 这 16 条是「打开/导航/读取/搜索/本地安装/移源/检查更新/刷新目录/全部已读/记住视图」的**唯一入口**，
 * 商店 UI（棒 6–10）与 AI（命令面板/CLI/MCP）走同一条路——⛔ 视图里再各写一份。
 *
 * 复用纪律（09 §三·补末行）：
 *   - 安装/更新/停用/启用/卸载 = **壳 `pluginManager` 的既有命令**，本文件一条都不新造；
 *   - 加源 = 既有 `marketplace.addSource`（`marketSourceAddCommand.ts`），本文件只在注册表里并存；
 *   - 检查更新 = `services/updateCheck.ts` 的唯一动作（不复制发现逻辑）；
 *   - 刷新目录 = `catalogStore.refreshCatalogNow()`（目录投影唯一属主）；
 *   - 视图偏好 = `marketplaceShared/uiPrefs.ts` 的唯一读写口；
 *   - 发现型已读 = `discoverReads.ts` 的唯一数据域。
 *
 * 回执形状照 09 §三·补表。两条实现边界（如实记，别当谎报）：
 *   ① `tabId`：壳 tabs API 是 **fire 型**（`tabs:create` 处理器无返回），只有 `openOrFocus`
 *      会广播 `tab:activated`（可据此拿到真 id）。故 store 六条命令返回真 tabId；
 *      `openPlugin`（必须用 create——openOrFocus 只按 type 去重，会聚焦到别的插件详情）回执
 *      的 `tabId` 恒空串，`ok` 表达「已发出打开请求」。
 *   ② 导航意图经 `storeNav` 持久信箱（跨进程/晚挂载都收得到），tab 打开只是让用户看见。
 */

import { decideRemoveSource } from "./marketSourceRemove";
import { checkForPluginUpdates } from "./updateCheck";
import { markAllRead, type DiscoverReadKind } from "./discoverReads";
import { recordLocalInstall } from "./localInstalls";
import { publishStoreNav, type StoreNavTarget } from "./storeNav";
import { getCatalogResult, refreshCatalogNow } from "./marketplaceShared/catalogStore";
import { readStoreState } from "./storeRead";
import {
  listenMarketplaceSearchBroadcast,
  setMarketplaceSearch,
} from "./marketplaceShared/searchState";
import { setViewPrefs } from "./marketplaceShared/uiPrefs";
import { setSourcesDefaultCollapsed } from "./sourcesPrefs";
import { openPluginDetailTab } from "./openDetailTab";
import i18n from "i18next";

const lk = () => window.linkdesk;

/** 本插件 id——真机壳 tab defaults 的 pluginId = `opts.pluginId ?? type`（R4-V.2 实机修正） */
const OWNER = "marketplace";

/** 作者源配置键——真相源 = 本仓 `plugin.json` 的 `contributes.configuration` 同名键 */
const CONFIG_KEY = "marketplace.marketplaceSources";

const STORE_TAB_TYPE = "marketplace-store"; // 棒 6：主区商店专用视图（入口别名 `marketplace` 同渲染 StoreView）
const DETAIL_TAB_TYPE = "plugin-detail";

export interface OpenTabResult {
  ok: boolean;
  /** 壳 tabs API 无 create 回执 ⇒ 只有 openOrFocus 路径能填真值（见文件头 ①） */
  tabId: string;
}

/* ═══ 参数形态（命令由 AI/命令面板调用，位置形与具名对象形都要认） ═══ */

function asRecord(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
}

/** 取字符串参数：`"x"` / `{ [key]: "x" }` / 位置形数组 `["x"]` 三形态 */
function stringArg(args: unknown, key: string, index: number): string {
  // 单串形态只代表**第一个**参数（否则 openAuthor("owner") 会把 repoId 也读成 "owner"）
  if (typeof args === "string") return index === 0 ? args.trim() : "";
  if (Array.isArray(args)) {
    const v = args[index];
    return typeof v === "string" ? v.trim() : "";
  }
  const v = asRecord(args)[key];
  return typeof v === "string" ? v.trim() : "";
}

/* ═══ 打开标签页 ═══ */

/** tabs.list 快照的局部窄化形——插件仓钉装的 @linkdesk/contracts 类型面尚未收录 list（壳已实装，M1 AI#3）；
 *  照 installFlow 的 catalogUrl 先例局部收窄，⛔ 升 contracts 前不加宽 */
/** 等 `tab:activated`（openOrFocus 的壳侧回执通道）——超时回落空串，⛔ 不让命令无限等。
 *  🔴 匹配键 = `pluginId === OWNER`（"marketplace"）：R4-V.2 带 `{pluginId}` 后 tab.pluginId 不再等于
 *  STORE_TAB_TYPE；且序列化 DTO（serializeGroups）**没有 type 字段**（tabs.list 认领路走不通）。
 *  详情标签的 DTO pluginId 恒为 "plugin-detail"（壳侧不设 pluginId）⇒ "marketplace" 只会命中
 *  商店/入口两类标签——本 waiter 紧跟 openOrFocus 发出，首个激活事件即本次聚焦的商店。 */
function waitTabActivated(
  timeoutMs = 800,
): { promise: Promise<string>; cancel: () => void } {
  const on = lk()?.events?.on;
  if (!on) return { promise: Promise.resolve(""), cancel: () => {} };

  let finish!: (id: string) => void;
  const promise = new Promise<string>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let un: (() => void) | undefined;
    finish = (id: string) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      try {
        un?.();
      } catch {
        /* 退订失败不影响回执 */
      }
      resolve(id);
    };
    try {
      un = on<{ tabId?: string; pluginId?: string }>("tab:activated", (p) => {
        if (p?.pluginId === OWNER && typeof p.tabId === "string") finish(p.tabId);
      });
    } catch {
      resolve("");
      return;
    }
    timer = setTimeout(() => finish(""), timeoutMs);
  });
  return { promise, cancel: () => finish("") };
}

/** 打开/聚焦商店标签页（singleton——`openOrFocus` 按 type 去重）。
 *  🔴 R4-V.2 真机缺陷修正（2026-11-21 隔离实例实机复现）：主区视图 tab 不带 `{pluginId}` 时，
 *  壳按 `opts.pluginId ?? resolveLegacyPluginId(type) ?? type` 把裸 type 当插件 id ⇒
 *  面板画「插件 "marketplace-store" 不可用」；带上 pluginId 后池按插件入口装载（入口别名渲染同一 StoreView）。
 *  label 用词典既有键（en.json "插件商店"）——否则 tab 标签回落裸 type 串。 */
async function openStoreTab(): Promise<OpenTabResult> {
  const tabs = lk()?.tabs;
  if (!tabs?.openOrFocus) return { ok: false, tabId: "" };
  const waiter = waitTabActivated();
  try {
    await tabs.openOrFocus(STORE_TAB_TYPE, { pluginId: OWNER, label: i18n.t("插件商店") });
  } catch {
    waiter.cancel();
    return { ok: false, tabId: "" };
  }
  return { ok: true, tabId: await waiter.promise };
}

/** 开插件详情标签页（create——同 type 多个 pluginId 并存，⛔ 不能用 openOrFocus）。
 *  R4-3.16：固定新开（pinned:true）走唯一入口 `services/openDetailTab`（与商店卡片/详情依赖跳转同一条）；
 *  只有命令调用方**显式**要预览态（pinned:false）时才落本函数自己的 create。 */
async function openDetailTab(pluginId: string, pinned: boolean, label: string): Promise<OpenTabResult> {
  if (pinned) return { ok: await openPluginDetailTab(pluginId, label), tabId: "" };
  const tabs = lk()?.tabs;
  if (!tabs?.create) return { ok: false, tabId: "" };
  try {
    await tabs.create(DETAIL_TAB_TYPE, { pluginId, pinned: false, label });
    return { ok: true, tabId: "" };
  } catch {
    return { ok: false, tabId: "" };
  }
}

/** 详情标签的显示名：目录条目 → 已装 manifest → pluginId（全部免网络） */
async function labelOf(pluginId: string): Promise<string> {
  const entry = getCatalogResult().entries.find((e) => e.id === pluginId);
  if (entry?.name) return entry.name;
  try {
    const list = (await lk()?.pluginManager?.list?.()) as
      | Array<{ pluginId?: string; manifest?: { name?: string } }>
      | undefined;
    const hit = Array.isArray(list) ? list.find((p) => p.pluginId === pluginId) : undefined;
    const name = hit?.manifest?.name;
    if (typeof name === "string" && name.trim()) return name;
  } catch {
    /* 已装列表不可用 → pluginId 兜底（标签名诚实） */
  }
  return pluginId;
}

/* ═══ 导航命令（先落意图、再开标签页） ═══ */

export async function runOpenStore(): Promise<OpenTabResult> {
  await publishStoreNav({ page: "home" }, true);
  return openStoreTab();
}

export async function runOpenCategory(args?: unknown): Promise<OpenTabResult> {
  const category = stringArg(args, "category", 0);
  if (!category) return { ok: false, tabId: "" };
  const authorId = stringArg(args, "authorId", 1);
  const official = asRecord(args).official === true || (Array.isArray(args) && args[2] === true);
  const target: StoreNavTarget = authorId
    ? { page: "category", category, authorId }
    : official
      ? { page: "category", category, official: true }
      : { page: "category", category };
  await publishStoreNav(target, true);
  return openStoreTab();
}

export async function runOpenRank(): Promise<OpenTabResult> {
  await publishStoreNav({ page: "rank" }, true);
  return openStoreTab();
}

export async function runOpenAuthors(): Promise<OpenTabResult> {
  await publishStoreNav({ page: "authors" }, true);
  return openStoreTab();
}

export async function runOpenLibrary(): Promise<OpenTabResult> {
  await publishStoreNav({ page: "library" }, true);
  return openStoreTab();
}

export async function runOpenAuthor(args?: unknown): Promise<OpenTabResult> {
  const authorId = stringArg(args, "authorId", 0);
  if (!authorId) return { ok: false, tabId: "" };
  const repoId = stringArg(args, "repoId", 1);
  const target: StoreNavTarget = repoId
    ? { page: "author", authorId, repoId }
    : { page: "author", authorId };
  await publishStoreNav(target, true);
  return openStoreTab();
}

export async function runOpenSources(): Promise<OpenTabResult> {
  await publishStoreNav({ page: "sources" }, true);
  return openStoreTab();
}

export async function runSearch(args?: unknown): Promise<OpenTabResult> {
  const query = stringArg(args, "query", 0);
  setMarketplaceSearch(query);
  // 跨进程：命令可能跑在壳渲染进程，池里的侧栏列表靠这条广播同步（searchState 内置订阅）
  try {
    lk()?.events?.emit("marketplace:search", query);
  } catch {
    /* 事件面缺失（预览）——池内本地状态已设 */
  }
  await publishStoreNav({ page: "search", query }, true);
  return openStoreTab();
}

/** AI 读取面（`marketplace.getState`）——当前实际路由 + 目录 + 本地状态 + 权益 + 作者/来源；只读。 */
export async function runGetState() {
  return readStoreState();
}

export async function runOpenPlugin(args?: unknown): Promise<OpenTabResult> {
  const pluginId = stringArg(args, "pluginId", 0);
  if (!pluginId) return { ok: false, tabId: "" };
  const rec = asRecord(args);
  // 08 v3.51 拍板：命令打开的详情是**用户主动要看的东西**，默认钉住（不参与预览替换）
  const pinned = Array.isArray(args) && typeof args[1] === "boolean"
    ? args[1]
    : typeof rec.pinned === "boolean"
      ? rec.pinned
      : true;
  const label = await labelOf(pluginId);
  return openDetailTab(pluginId, pinned, label);
}

/* ═══ 数据动作命令 ═══ */

/**
 * 本地安装面（R4-1.2 壳 API）——本仓 SDK 依赖 `@linkdesk/plugin-sdk@0.1.66` 的类型还没带上这个
 * 新方法（壳 0.2.56 起才在运行时提供），故在此按「可选方法」收窄：旧壳上 `undefined` ⇒ 回执
 * `unavailable`（⛔ 不假装装上了）。
 */
type LocalInstallPm = {
  installFromDirectory?: (path: string) => Promise<
    { ok: true; pluginId: string } | { ok: false; reason?: string }
  >;
};

/** 本地插件安装（09 §三·补2：复用壳 installFromDirectory，⛔ 第二套解压/复制） */
export async function runAddLocalPlugin(args?: unknown): Promise<{ ok: boolean; reason?: string }> {
  const path = stringArg(args, "path", 0);
  if (!path) return { ok: false, reason: "empty" };
  const pm = lk()?.pluginManager as LocalInstallPm | undefined;
  if (!pm?.installFromDirectory) return { ok: false, reason: "unavailable" };
  const r = await pm.installFromDirectory(path);
  if (!r || r.ok !== true) {
    return { ok: false, reason: (r && r.ok === false && r.reason) || "io" };
  }
  await recordLocalInstall(r.pluginId, path);
  return { ok: true };
}

function removeArg(args: unknown): string | number | undefined {
  if (typeof args === "string" || typeof args === "number") return args;
  if (Array.isArray(args)) {
    const v = args[0];
    return typeof v === "string" || typeof v === "number" ? v : undefined;
  }
  const r = asRecord(args);
  if (typeof r.index === "number") return r.index;
  if (typeof r.url === "string") return r.url;
  if (typeof r.path === "string") return r.path;
  return undefined;
}

/** 移除市场源（决策单点 `decideRemoveSource`；写回原始数组、不归一化） */
export async function runRemoveSource(args?: unknown): Promise<{ ok: boolean; reason?: string }> {
  const cfg = lk()?.configuration;
  if (!cfg?.get || !cfg.set) {
    throw new Error("配置写入面不可用（window.linkdesk.configuration.set）——移源未落盘");
  }
  let raw: unknown;
  try {
    raw = await cfg.get(CONFIG_KEY);
  } catch {
    raw = [];
  }
  const decision = decideRemoveSource(Array.isArray(raw) ? raw : [], removeArg(args));
  if (!decision.ok) return { ok: false, reason: decision.reason };
  await cfg.set(CONFIG_KEY, decision.next);
  return { ok: true };
}

/** 检查插件更新（唯一动作 = `updateCheck.checkForPluginUpdates`） */
export async function runCheckUpdates(): Promise<{ ok: boolean; count: number }> {
  const r = await checkForPluginUpdates();
  return { ok: r.state === "ok", count: r.updatableCount };
}

/** 刷新目录内容（唯一属主 = catalogStore；`changed` = 内容签名变化） */
export async function runRefreshCatalog(): Promise<{ ok: boolean; changed: boolean }> {
  return refreshCatalogNow();
}

/** 记号「全部已读」参数：`"all"` / `{kind:"all"}` / 位置形 */
function readKind(args: unknown): DiscoverReadKind | null {
  const raw = stringArg(args, "kind", 0);
  return raw === "category" || raw === "author" || raw === "all" ? raw : null;
}

/** 角标全部已读（仅发现型——⛔ 不碰任务型更新数字，见 discoverReads 头注） */
export async function runMarkAllRead(args?: unknown): Promise<{ cleared: number; reason?: string }> {
  const kind = readKind(args);
  if (!kind) return { cleared: 0, reason: "bad-arg" };
  return markAllRead(kind);
}

/** 记住视图/排序（06 §八；幂等写 pluginState） */
export async function runSetViewPrefs(args?: unknown): Promise<{ ok: boolean; reason?: string }> {
  const rec = asRecord(args);
  const page = typeof rec.page === "string" ? rec.page : "";
  const opts = {
    view: typeof rec.view === "string" ? rec.view : undefined,
    sort: typeof rec.sort === "string" ? rec.sort : undefined,
  };
  try {
    const r = await setViewPrefs(page, opts);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  } catch {
    return { ok: false, reason: "io" };
  }
}

/** 来源分组默认收起/展开（设置页同键；命令与 UI 共用唯一写口） */
export async function runSetSourcesDefaultCollapsed(
  args?: unknown,
): Promise<{ ok: boolean; collapsed?: boolean; reason?: string }> {
  const rec = asRecord(args);
  const raw = Array.isArray(args)
    ? args[0]
    : typeof args === "boolean"
      ? args
      : rec.collapsed;
  if (typeof raw !== "boolean") return { ok: false, reason: "bad-arg" };
  try {
    const ok = await setSourcesDefaultCollapsed(raw);
    return ok ? { ok: true, collapsed: raw } : { ok: false, reason: "unsupported" };
  } catch {
    return { ok: false, reason: "io" };
  }
}

/* ═══ 注册（入口模块链顶层调用——见 marketplaceShared/commands.ts 的注册时机说明） ═══ */

/** 本组命令的 id → handler → title（title 必须与 plugin.json 逐字一致；其余元数据只在 manifest） */
const COMMANDS: Array<[string, (args?: unknown) => Promise<unknown>, string]> = [
  ["marketplace.openStore", () => runOpenStore(), "打开插件市场"],
  ["marketplace.openCategory", (a) => runOpenCategory(a), "打开分类"],
  ["marketplace.openRank", () => runOpenRank(), "打开排行榜"],
  ["marketplace.openAuthors", () => runOpenAuthors(), "打开作者列表"],
  ["marketplace.openLibrary", () => runOpenLibrary(), "打开我的库"],
  ["marketplace.openAuthor", (a) => runOpenAuthor(a), "打开作者主页"],
  ["marketplace.openPlugin", (a) => runOpenPlugin(a), "打开插件详情"],
  ["marketplace.openSources", () => runOpenSources(), "打开来源管理"],
  ["marketplace.search", (a) => runSearch(a), "搜索插件市场"],
  ["marketplace.getState", () => runGetState(), "读取市场状态"],
  ["marketplace.addLocalPlugin", (a) => runAddLocalPlugin(a), "添加本地插件"],
  ["marketplace.removeSource", (a) => runRemoveSource(a), "移除市场源"],
  ["marketplace.checkUpdates", () => runCheckUpdates(), "检查插件更新"],
  ["marketplace.refreshCatalog", () => runRefreshCatalog(), "刷新目录内容"],
  ["marketplace.markAllRead", (a) => runMarkAllRead(a), "全部标为已读"],
  ["marketplace.setViewPrefs", (a) => runSetViewPrefs(a), "设置视图偏好"],
  ["marketplace.setSourcesDefaultCollapsed", (a) => runSetSourcesDefaultCollapsed(a), "设置来源分组默认收起"],
];

/**
 * 注册 16 条命令。
 * @returns 注册成功的条数（0 = `window.linkdesk.commands` 不可用）
 */
export function registerMarketplaceStoreCommands(): number {
  const reg = lk()?.commands?.registerCommand;
  if (!reg) return 0;
  // 跨进程搜索广播：命令跑在壳进程时，池里的侧栏列表靠这条订阅跟上（见 searchState 头注）
  listenMarketplaceSearchBroadcast();
  for (const [id, handler, title] of COMMANDS) reg(id, handler, { title });
  return COMMANDS.length;
}
