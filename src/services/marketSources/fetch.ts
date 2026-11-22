/**
 * fetch — **单源**拉取（5min fresh 缓存 → fetch → parse 校验 → stale 兜底）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketSources.ts` 原样搬出，零行为变更。
 *
 * 缓存态读写归 `io.ts`（模块级 mutable 状态的唯一属主）；本文件只编排「一次拉取怎么走」。
 */

import { OFFICIAL_SOURCE_URL, parseCatalog, sourceNameOfUrl } from "../marketCatalog";
import { CACHE_TTL_MS, injectedFetch, readCache, writeCache } from "./io";
import type { SidecarResult, SourceResult } from "./types";

async function fetchText(url: string): Promise<string> {
  const injected = injectedFetch();
  if (injected) return injected(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    /* 2026-11-23 用户实机：`cache:"no-store"` 在本机 Chromium **不生效**——发版后同一个 raw 地址
     *  仍拿回旧内容（实测：默认/no-store 拿到 1.4.1，`reload` 立刻拿到 1.4.3）⇒ 用户点「检查更新」
     *  看不到新版。改 `reload`：绕过本地 HTTP 缓存并回写，发版后刷新即见。 */
    const res = await fetch(url, { signal: ctrl.signal, cache: "reload" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function isParseable(text: string): boolean {
  return parseCatalog(text).ok;
}

export async function fetchOne(url: string, force: boolean): Promise<SourceResult> {
  const sourceName = sourceNameOfUrl(url);
  const official = url === OFFICIAL_SOURCE_URL;
  const cached = readCache(url);
  const withinTtl = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  // 5min fresh 命中 → 直接交付缓存（01 §四：先读缓存；手动刷新由 force 显式绕过）
  if (cached && withinTtl && !force) {
    return { sourceName, official, text: cached.text, fresh: true, staleFallback: false };
  }

  let text: string;
  try {
    text = await fetchText(url);
  } catch (err) {
    // 网络失败 → stale 缓存兜底；无缓存 = 该源不可达
    if (cached) return { sourceName, official, text: cached.text, fresh: false, staleFallback: true };
    // R4-5.6：限流（HTTP 403）单独成因——内容热更新退避按 06 §六 §5 直接封顶 30min
    return { sourceName, official, reason: /HTTP 403/.test(String(err)) ? "rate-limited" : "network" };
  }

  if (isParseable(text)) {
    writeCache(url, text); // 实时内容写入缓存（含 force 重写）
    return { sourceName, official, text, fresh: true, staleFallback: false };
  }

  // parse 失败 → stale 缓存兜底；无缓存 = 该源目录损坏
  if (cached) return { sourceName, official, text: cached.text, fresh: false, staleFallback: true };
  return { sourceName, official, reason: "parse" };
}

/** 侧车文件拉取（vendors.json / plugin.json——R4-2.1/v2 与 K5 回落链用）。
 *  与目录源分开：**不做目录 parse 校验**（plugin.json 本来就不是目录），缓存键仍按 URL 独立。
 *  失败**不抛**——调用方按「没有就没有」处理（目录主状态不受侧车影响）。 */
export async function fetchSidecar(url: string, force: boolean): Promise<SidecarResult> {
  const cached = readCache(url);
  const withinTtl = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  if (cached && withinTtl && !force) return { ok: true, text: cached.text };

  let text: string;
  try {
    text = await fetchText(url);
  } catch (err) {
    if (cached) return { ok: true, text: cached.text }; // 网络失败 → stale 兜底
    return { ok: false, reason: /HTTP 404/.test(String(err)) ? "missing" : "network" };
  }
  writeCache(url, text);
  return { ok: true, text };
}
