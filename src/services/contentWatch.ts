/**
 * contentWatch — 内容热更新的**后台重校验层**（06 §六；R4-5.6 / #12）。
 *
 * 🔴 单一属主：触发面（06 §六 §2 全表）＋ 节流 ＋ 失败退避 ＋ contentHash 比对全在本层——
 * UI 层（StoreView）只消费回执做分层提示（06 §六 §3），⛔ 不自建第二套调度。
 *
 * 触发面逐条（正典 06 §六 §2）：
 *   - 应用启动一次（进程生命周期内仅一趟——`startupDone` 钉死，StrictMode 双挂载不重复拉）；
 *   - 打开商店（`store-open`，UI 层在 isActive 变化时调）——60s 节流；
 *   - 窗口聚焦（`focus`）——15min 节流；
 *   - 后台定时（`timer`）——30min ±5min 抖动；页面隐藏时跳过（`missedTick`），visibility 恢复补一次；
 *   - 网络恢复（`online`）——offline→online 事件合并一次；
 *   - 手动（`manual`）——**无视节流与退避**（来源页单源刷新另有其路，不在此）。
 *
 * 失败退避（06 §六 §5）：1 → 5 → 15 → 30min 封顶；限流（HTTP 403，fetch 层透传 `rate-limited`
 * 成因）直接 30min；恢复成功清空退避。退避期内**所有自动触发静默**（⛔ 重复打扰），手动不受限。
 *
 * 比对：`catalogSignature`（contentHash，顺序敏感）before/after。**首开未到（现挂目录为空）⇒
 * 只暖缓存不报变更**（06 §六：首开绝不弹常驻条——空 vs 全量是「目录到了」不是「内容变了」）。
 * 🔴 本层 **⛔ 不写目录 store**——应用策略归 catalogStore/用户「刷新」（浏览中静默换内容撞机械守则；
 * 「变更到达时商店不可见 → 下次打开直接应用」由 UI 层按回执裁决）。
 */

import { catalogSignature } from "./marketCatalog";
import { forceRefreshCatalog, type CatalogLoadResult } from "./marketSources";
import { getCatalogResult } from "./marketplaceShared/catalogStore";

export type ContentWatchReason =
  | "startup"
  | "store-open"
  | "focus"
  | "timer"
  | "online"
  | "visibility"
  | "manual";

export interface ContentWatchOutcome {
  /** 本趟是否真跑了（false = 被节流/退避/并发闸拦下） */
  ran: boolean;
  /** 内容签名变化（首开未到/失败/未跑恒 false） */
  changed: boolean;
  /** 全源零交付（退避依据） */
  failed: boolean;
}

export interface ContentWatchDeps {
  fetchFresh: () => Promise<CatalogLoadResult>;
  /** 现挂目录签名——空目录返回 ""（首开未到，不比对） */
  currentSignature: () => string;
}

const settleListeners = new Set<(o: ContentWatchOutcome) => void>();
/** 订阅回执（UI 分层提示与测试取证同一通道；返回退订函数） */
export function onContentWatchSettled(fn: (o: ContentWatchOutcome) => void): () => void {
  settleListeners.add(fn);
  return () => settleListeners.delete(fn);
}

function notifySettled(o: ContentWatchOutcome): void {
  for (const fn of settleListeners) fn(o);
}

/** 测试注入；传 null 恢复默认实现 */
export function __setContentWatchDeps(deps: ContentWatchDeps | null): void {
  _deps = deps;
  cleanup();
}

function deps(): ContentWatchDeps {
  return (
    _deps ?? {
      fetchFresh: forceRefreshCatalog,
      currentSignature: () => {
        const r = getCatalogResult();
        if (r.entries.length === 0) return "";
        return catalogSignature(r.entries, r.collections, r.railOrder);
      },
    }
  );
}

// ── 节流/退避常量（06 §六 §2/§5 逐条照抄） ──────────────────────────────

export const OPEN_THROTTLE_MS = 60_000; // 打开商店 60s
export const FOCUS_THROTTLE_MS = 15 * 60_000; // 窗口聚焦 15min
export const TICK_BASE_MS = 30 * 60_000; // 后台定时 30min ±5min 抖动
export const TICK_JITTER_MS = 5 * 60_000;
/** 退避阶梯：1 → 5 → 15 → 30min 封顶（06 §六 §5）；限流 = 直接顶档（第 len 档 = 30min） */
export const BACKOFF_STEPS_MS = [1, 5, 15, 30].map((m) => m * 60_000);

// ── 模块级可变状态（本域唯一属主；测试经 __setContentWatchDeps(null) 复位） ──

let _deps: ContentWatchDeps | null = null;
let started = false;
let running = false;
let startupDone = false;
let lastOpenAt = 0;
let lastFocusAt = 0;
let backoffFailures = 0;
let blockedUntil = 0;
let tickTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let missedTick = false;
/** F9（2026-11-21 用户报障）：**同一新内容只通知一次**的判据——用户没点「刷新」前，store 内容
 *  不变 ⇒ 每轮轮询都会重新算出 changed=true。此前每轮各弹一条 Toast＋面板记录（用户看到
 *  「连弹两次」）。记最后已通知的远端内容签名：同签名不再报 changed；内容被应用到 store
 *  （远端签名 == 现挂签名）后清空，同内容再次变更仍能通知。 */
let lastNotifiedSignature: string | null = null;

function now(): number {
  return Date.now();
}

// ── 定时器 ──────────────────────────────────────────────────────────────

function scheduleTick(): void {
  if (tickTimer) clearTimeout(tickTimer);
  const jitter = TICK_BASE_MS - TICK_JITTER_MS + Math.floor(Math.random() * TICK_JITTER_MS * 2);
  tickTimer = setTimeout(() => {
    tickTimer = null;
    void autoTick();
  }, jitter);
}

async function autoTick(): Promise<void> {
  // 页面隐藏时跳过本轮（06 §六 §2 脚注），visibility 恢复补一次
  if (typeof document !== "undefined" && document.hidden) {
    missedTick = true;
  } else {
    await checkContentNow("timer");
  }
  scheduleTick();
}

/** 退避重试——独立于环境 tick 的单发定时器（失败后按阶梯延时重试一次） */
function armRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(
    () => {
      retryTimer = null;
      if (typeof document !== "undefined" && document.hidden) {
        missedTick = true; // 隐藏期到点 → 挂起，恢复时补
        return;
      }
      void checkContentNow("timer");
    },
    Math.max(blockedUntil - now(), 1_000),
  );
}

function armBackoff(rateLimited: boolean): void {
  // 第 N 次连续失败 → 阶梯第 N 档（1→5→15→30min 封顶）；限流直接顶档
  backoffFailures = rateLimited ? BACKOFF_STEPS_MS.length : backoffFailures + 1;
  const delay = BACKOFF_STEPS_MS[Math.min(backoffFailures - 1, BACKOFF_STEPS_MS.length - 1)];
  blockedUntil = now() + delay;
}

// ── 事件监听（模块级具名函数——removeEventListener 要同一引用） ──────────

function onFocus(): void {
  const t = now();
  if (t - lastFocusAt < FOCUS_THROTTLE_MS) return;
  lastFocusAt = t;
  void checkContentNow("focus");
}

function onVisibility(): void {
  if (typeof document !== "undefined" && document.hidden) return;
  if (!missedTick) return;
  missedTick = false;
  void checkContentNow("visibility");
}

function onOnline(): void {
  void checkContentNow("online");
}

function cleanup(): void {
  if (tickTimer) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (started && typeof window !== "undefined") {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
  }
  started = false;
  running = false;
  missedTick = false;
  // 节流/退避状态随停一并复位（startupDone 除外——进程生命周期单趟，跨 start/stop 保持）
  lastOpenAt = 0;
  lastFocusAt = 0;
  backoffFailures = 0;
  blockedUntil = 0;
  // lastNotifiedSignature **不清**——StoreView 卸载重挂不重弹同一条内容提醒（用户报障 F9 的根因面）
}

// ── 启停（StoreView keep-alive 挂载即启动；StrictMode 双挂载安全） ────────

export function startContentWatch(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  scheduleTick();
  // 应用启动一次（06 §六 §2 首行）——startupDone 钉死进程生命周期单趟
  void checkContentNow("startup");
}

/**
 * 测试专用：清 F9 通知去重印记。生产路径 ⛔ 不清（StoreView 卸载重挂不应重弹同一条内容提醒）。
 * 单测各例要独立断言 changed，需在 beforeEach 清。
 */
export function __resetNotifyDedupe(): void {
  lastNotifiedSignature = null;
}

export function stopContentWatch(): void {
  cleanup();
}

// ── 核心：一次重校验 ────────────────────────────────────────────────────

/** 手动/自动统一的检查入口。自动档受节流＋退避闸；手动无视两者（06 §六 §2「无视节流」）。
 *  **本函数不抛**——任何失败都折成 `failed:true` 回执（失败 ⛔ 不弹 Toast，来源页承担可见性）。 */
export async function checkContentNow(reason: ContentWatchReason): Promise<ContentWatchOutcome> {
  const idle: ContentWatchOutcome = { ran: false, changed: false, failed: false };
  if (running) return idle;
  const t = now();
  if (reason !== "manual") {
    if (t < blockedUntil) return idle; // 退避期内自动触发静默
    if (reason === "startup" && startupDone) return idle;
    if (reason === "store-open" && t - lastOpenAt < OPEN_THROTTLE_MS) return idle;
    if (reason === "focus" && t - lastFocusAt < FOCUS_THROTTLE_MS) return idle;
  }
  if (reason === "startup") startupDone = true;
  if (reason === "store-open") lastOpenAt = t;
  if (reason === "focus") lastFocusAt = t;

  running = true;
  try {
    const before = deps().currentSignature();
    let outcome: ContentWatchOutcome;
    try {
      const next = await deps().fetchFresh();
      const rateLimited = (next.errors ?? []).some((e) => e.reason === "rate-limited");
      const failed = next.state !== "ok";
      const remoteSig = catalogSignature(next.entries, next.collections, next.railOrder);
      // F9：changedRaw = 远端与现挂不同；changed = 还要「这次变更没通知过」（同签名重复轮询不再打扰）。
      const changedRaw = !failed && before !== "" && remoteSig !== before;
      const changed = changedRaw && remoteSig !== lastNotifiedSignature;
      if (changed) lastNotifiedSignature = remoteSig;
      // 内容已应用到 store（用户点了刷新）⇒ 清通知印记，下一轮同内容真变更可再通知
      if (!failed && remoteSig === before) lastNotifiedSignature = null;
      outcome = { ran: true, changed, failed };
      if (failed) {
        armBackoff(rateLimited);
        armRetry();
      } else {
        backoffFailures = 0; // 恢复成功清空退避（06 §六 §5）
        blockedUntil = 0;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
      }
    } catch {
      outcome = { ran: true, changed: false, failed: true };
      armBackoff(false);
      armRetry();
    }
    notifySettled(outcome);
    return outcome;
  } finally {
    running = false;
  }
}
