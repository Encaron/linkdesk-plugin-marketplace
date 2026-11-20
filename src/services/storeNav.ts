/**
 * storeNav —— 商店**导航意图**（跨表面 / 跨进程唯一入口，R4-2.5 六条 open* 命令的落点）。
 *
 * 为什么需要它：命令（`marketplace.openCategory` 等）要告诉「商店 UI 去哪个页」，但
 *   - 命令可能跑在**壳渲染进程**（外部 AI 经命令面板/CLI），商店 UI 住在**池渲染进程**；
 *   - `realmSlot` 只保证同一 document 内多份模块副本共享一份（池内各表面），跨进程不生效；
 *   - 首次打开商店时视图晚于命令挂载，一次性广播会**错过**。
 * ⇒ 三层一起用：① 内存槽（池内各表面即时同步）② 插件事件广播（已挂载的 UI 立即响应）
 *   ③ `pluginState` 持久键（晚挂载/跨进程的 UI 读得到）。键 `storeNav` 只是**意图信箱**，
 *   不是浏览偏好（视图/排序走 `ui.prefs`，⛔ 混为一处）。
 *
 * 消费方（棒 6/7/8 商店壳）：`readStoreNavTarget()` 取意图、`onStoreNavChange()` 订阅变化；
 * 消费后可 `publishStoreNav({ page: "home" })` 复位，防下次冷启动回到旧页。
 */

import { realmSlot } from "./realmSlot";

export type StoreNavTarget =
  | { page: "home" }
  | { page: "category"; category: string }
  | { page: "library" }
  | { page: "author"; authorId: string; repoId?: string }
  | { page: "sources" }
  | { page: "search"; query: string };

const OWNER = "marketplace";
const KEY = "storeNav";
const CHANNEL = "marketplace:storeNav";

const DEFAULT_TARGET: StoreNavTarget = { page: "home" };

interface NavState {
  target: StoreNavTarget;
  /** 是否已从持久层/事件里拿到过真实意图（false ⇒ 仍是默认 home） */
  loaded: boolean;
  listeners: Set<() => void>;
  bridgeStarted: boolean;
}

const state = realmSlot<NavState>("storeNav/v1", () => ({
  target: DEFAULT_TARGET,
  loaded: false,
  listeners: new Set<() => void>(),
  bridgeStarted: false,
}));

/** 意图归一（持久层是用户可改的磁盘值——认不出就丢弃，⛔ 不把坏值当页面） */
export function normalizeStoreNavTarget(raw: unknown): StoreNavTarget | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  switch (r.page) {
    case "home":
      return { page: "home" };
    case "category": {
      const category = typeof r.category === "string" ? r.category.trim() : "";
      return category ? { page: "category", category } : null;
    }
    case "library":
      return { page: "library" };
    case "author": {
      const authorId = typeof r.authorId === "string" ? r.authorId.trim() : "";
      if (!authorId) return null;
      const repoId = typeof r.repoId === "string" && r.repoId.trim() ? r.repoId.trim() : undefined;
      return repoId ? { page: "author", authorId, repoId } : { page: "author", authorId };
    }
    case "sources":
      return { page: "sources" };
    case "search": {
      const query = typeof r.query === "string" ? r.query : "";
      return { page: "search", query };
    }
    default:
      return null;
  }
}

function notify(): void {
  state.listeners.forEach((fn) => fn());
}

function apply(raw: unknown): void {
  const target = normalizeStoreNavTarget(raw);
  if (!target) return;
  if (JSON.stringify(target) === JSON.stringify(state.target)) return;
  state.target = target;
  state.loaded = true;
  notify();
}

/** 事件订阅（一次/每 realm）——池内已挂载的商店壳即时跟随；壳/池各注册自己那份 */
function ensureBridge(): void {
  if (state.bridgeStarted) return;
  const on = window.linkdesk?.events?.on;
  if (!on) return; // 预览环境无事件面——内存槽仍可用
  on(CHANNEL, apply);
  // 同一份意图的持久层变更也当来源（多壳窗/未来多池都以此汇合）
  const onChange = window.linkdesk?.pluginState?.onChange;
  if (onChange) onChange(OWNER, KEY, apply);
  state.bridgeStarted = true;
}

export function getStoreNavTarget(): StoreNavTarget {
  ensureBridge();
  return state.target;
}

/** 读意图（优先持久层——晚挂载的商店壳靠这一步拿到「命令打开的是哪个页」） */
export async function readStoreNavTarget(): Promise<StoreNavTarget> {
  ensureBridge();
  if (state.loaded) return state.target;
  const ps = window.linkdesk?.pluginState;
  if (ps) {
    try {
      const raw = await ps.get(OWNER, KEY);
      const target = normalizeStoreNavTarget(raw);
      if (target) {
        state.target = target;
        state.loaded = true;
      }
    } catch {
      /* 读失败回落 home（意图丢失只影响一次导航） */
    }
  }
  return state.target;
}

/** 发布意图：内存 → 持久 → 广播（顺序保证「先写盘再开标签页」的调用方拿到一致结果） */
export async function publishStoreNav(target: StoreNavTarget): Promise<void> {
  ensureBridge();
  apply(target);
  const ps = window.linkdesk?.pluginState;
  if (ps) {
    try {
      await ps.set(OWNER, KEY, target);
    } catch {
      /* 持久失败不影响内存/广播路径 */
    }
  }
  try {
    window.linkdesk?.events?.emit(CHANNEL, target);
  } catch {
    /* 事件面缺失（预览）——内存槽已生效 */
  }
}

export function onStoreNavChange(fn: () => void): () => void {
  ensureBridge();
  state.listeners.add(fn);
  return () => {
    state.listeners.delete(fn);
  };
}

/** 测试专用：清本模块内存态（槽对象被模块捕获，`__resetRealmSlots` 清不到它）。产线不调。 */
export function __resetStoreNavState(): void {
  state.target = DEFAULT_TARGET;
  state.loaded = false;
  state.listeners.clear();
  state.bridgeStarted = false;
}
