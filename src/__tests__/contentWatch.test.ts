/**
 * contentWatch 单测（R4-5.6 / #12）——fake timers ＋ 注入 deps（fetchFresh/currentSignature/onSettled 全替身）。
 * 触发面/节流/退避逐条对 06 §六 §2/§5 正典。fixture 全虚构（硬约束 21）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKOFF_STEPS_MS,
  OPEN_THROTTLE_MS,
  FOCUS_THROTTLE_MS,
  checkContentNow,
  startContentWatch,
  stopContentWatch,
  __setContentWatchDeps,
  __resetNotifyDedupe,
  onContentWatchSettled,
  type ContentWatchDeps,
  type ContentWatchOutcome,
} from "../services/contentWatch";
import { catalogSignature } from "../services/marketCatalog";
import type { CatalogLoadResult } from "../services/marketSources";

function result(over?: Partial<CatalogLoadResult>): CatalogLoadResult {
  return {
    entries: [],
    state: "ok",
    errors: [],
    sourceNames: [],
    usedStale: false,
    fetchedAt: 1,
    railOrder: [],
    collections: [],
    ...over,
  } as CatalogLoadResult;
}

const entriesA = [{ id: "p-a", name: "A", version: "1.0.0" }] as CatalogLoadResult["entries"];
const entriesB = [{ id: "p-b", name: "B", version: "2.0.0" }] as CatalogLoadResult["entries"];

let outcomes: ContentWatchOutcome[] = [];
let fetchMock = vi.fn<() => Promise<CatalogLoadResult>>();

function mkDeps(over?: Partial<ContentWatchDeps>): ContentWatchDeps {
  return {
    fetchFresh: (...a) => fetchMock(...a),
    currentSignature: () => catalogSignature(entriesA),
    ...over,
  };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

let unsubscribe: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  outcomes = [];
  fetchMock = vi.fn(async () => result({ entries: entriesA }));
  __setContentWatchDeps(mkDeps());
  __resetNotifyDedupe();
  unsubscribe = onContentWatchSettled((o) => outcomes.push(o));
});

afterEach(() => {
  stopContentWatch();
  unsubscribe?.();
  unsubscribe = null;
  __setContentWatchDeps(null);
  vi.useRealTimers();
});

describe("contentWatch（R4-5.6 重校验层）", () => {
  it("启动一次：start 触发 startup 检查；重复 start 不重跑（进程生命周期单趟）", async () => {
    startContentWatch();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toEqual({ ran: true, changed: false, failed: false });
    stopContentWatch();
    startContentWatch();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // startupDone 钉死——同进程第二趟 start 不再拉
  });

  it("内容变化 → changed=true 回执；未变化 false", async () => {
    fetchMock.mockResolvedValue(result({ entries: entriesB }));
    const o = await checkContentNow("store-open");
    expect(o).toEqual({ ran: true, changed: true, failed: false });
    fetchMock.mockResolvedValue(result({ entries: entriesA }));
    const o2 = await checkContentNow("manual"); // 手动绕过 60s 开店节流
    expect(o2.changed).toBe(false);
  });

  it("F9：同一新内容重复轮询只报一次 changed；应用后再变更仍能通知（用户报障「连弹两次」根因）", async () => {
    fetchMock.mockResolvedValue(result({ entries: entriesB }));
    expect((await checkContentNow("store-open")).changed).toBe(true); // 首次发现新内容
    expect((await checkContentNow("manual")).changed).toBe(false); // 同签名重复轮询——不再打扰
    expect((await checkContentNow("manual")).changed).toBe(false);
    // 用户点「刷新」后 store 已应用 B ⇒ 印记清空（远端签名 == 现挂签名）
    __setContentWatchDeps(mkDeps({ currentSignature: () => catalogSignature(entriesB) }));
    expect((await checkContentNow("manual")).changed).toBe(false);
    // 之后再出新内容 ⇒ 仍能通知（不是一次性的哑火）
    fetchMock.mockResolvedValue(result({ entries: entriesA }));
    expect((await checkContentNow("manual")).changed).toBe(true);
  });

  it("首开未到（现挂目录为空）→ 只暖缓存不报变更", async () => {
    __setContentWatchDeps(mkDeps({ currentSignature: () => "" }));
    fetchMock.mockResolvedValue(result({ entries: entriesB }));
    const o = await checkContentNow("store-open");
    expect(o).toEqual({ ran: true, changed: false, failed: false });
  });

  it("store-open 60s 节流：窗内第二次被拦（manual 不受限）", async () => {
    expect((await checkContentNow("store-open")).ran).toBe(true);
    expect((await checkContentNow("store-open")).ran).toBe(false);
    vi.advanceTimersByTime(OPEN_THROTTLE_MS + 1);
    expect((await checkContentNow("store-open")).ran).toBe(true);
    expect((await checkContentNow("store-open")).ran).toBe(false);
    expect((await checkContentNow("manual")).ran).toBe(true);
  });

  it("focus 15min 节流", async () => {
    expect((await checkContentNow("focus")).ran).toBe(true);
    expect((await checkContentNow("focus")).ran).toBe(false);
    vi.advanceTimersByTime(FOCUS_THROTTLE_MS + 1);
    expect((await checkContentNow("focus")).ran).toBe(true);
  });

  it("失败退避：自动触发静默、手动放行、重试定时到点自动补跑", async () => {
    fetchMock.mockResolvedValue(result({ state: "offline", errors: [{ sourceName: "s", reason: "network" }] }));
    const o = await checkContentNow("store-open");
    expect(o).toEqual({ ran: true, changed: false, failed: true });
    // 退避期内：自动档静默，手动放行（manual 也失败 → 阶梯步进到 5min）
    expect((await checkContentNow("focus")).ran).toBe(false);
    expect((await checkContentNow("manual")).ran).toBe(true);
    // 重试定时器到点 → 自动补跑（此刻退避已过期，恢复成功）
    fetchMock.mockResolvedValue(result({ entries: entriesA }));
    await vi.advanceTimersByTimeAsync(BACKOFF_STEPS_MS[1]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(outcomes[outcomes.length - 1]).toEqual({ ran: true, changed: false, failed: false });
  });

  it("限流（rate-limited）直接 30min 封顶——29min 仍拦、30min 放行", async () => {
    fetchMock.mockResolvedValue(
      result({ state: "offline", errors: [{ sourceName: "s", reason: "rate-limited" }] }),
    );
    await checkContentNow("manual");
    expect((await checkContentNow("manual")).ran).toBe(true); // manual 无视退避
    fetchMock.mockResolvedValue(result({ entries: entriesA }));
    vi.advanceTimersByTime(29 * 60_000);
    expect((await checkContentNow("focus")).ran).toBe(false);
    await vi.advanceTimersByTimeAsync(1 * 60_000);
    expect((await checkContentNow("focus")).ran).toBe(true);
  });

  it("恢复成功清空退避", async () => {
    fetchMock.mockResolvedValue(result({ state: "offline" }));
    await checkContentNow("manual");
    fetchMock.mockResolvedValue(result({ entries: entriesA }));
    await checkContentNow("manual"); // 成功
    expect((await checkContentNow("focus")).ran).toBe(true); // 退避已清零
  });

  it("网络恢复（online 事件）触发一次检查（监听器随 start 装/随 stop 卸）", async () => {
    startContentWatch();
    await flush();
    const before = fetchMock.mock.calls.length; // startupDone 跨测试保持 ⇒ 本测 start 可能不拉
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(fetchMock.mock.calls.length).toBe(before + 1);
    stopContentWatch();
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(fetchMock.mock.calls.length).toBe(before + 1); // 卸载后不再触发
  });

  it("后台定时隐藏跳过、visibility 恢复补一次", async () => {
    startContentWatch();
    await flush();
    const before = fetchMock.mock.calls.length;
    const desc = Object.getOwnPropertyDescriptor(document, "hidden");
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    await vi.advanceTimersByTimeAsync(36 * 60_000); // 30min±5min 抖动的最大值——tick 必已到点
    expect(fetchMock.mock.calls.length).toBe(before); // 隐藏期 tick 跳过
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(fetchMock.mock.calls.length).toBe(before + 1); // 恢复补一次
    if (desc) Object.defineProperty(document, "hidden", desc);
  });
});
