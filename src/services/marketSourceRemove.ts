/**
 * marketSourceRemove —— 「移除市场源」的**纯决策单点**（R4-2.5 `marketplace.removeSource`）。
 *
 * 与 `marketSourceAdd.ts` 对称：加源决策在那边、移源决策在本文件；命令层只负责「读原始配置
 * → 决策 → ok 才落盘」这一层接线（与加源同一写路径纪律：⛔ 命令/弹窗各判一套）。
 *
 * 🔴 **按原始数组删、不做归一化写回**：配置里存的可能是 string / {url} / 全记录三种形态
 *   （R4-2.1 读侧兼容），删一条后其余记录必须**原样保留**——归一化重写会把用户粘的主页 URL
 *   改成 HEAD 直链（违反「原始形态只此一份落盘」）。
 *
 * 身份判据：URL 走 `urlSourceKey`（owner/repo、分支无关——与加源判重、设置行内判重同一把钥匙）；
 * 本地记录走 path 归一比较（斜杠统一、去尾斜杠、Windows 大小写不敏感）。官方源恒不在册，
 * 传官方 URL = 调用不成立（⛔ 静默 no-op 让 AI 以为删掉了）。
 */

import { urlSourceKey } from "@linkdesk/ui";
import { OFFICIAL_SOURCE_URL } from "./marketCatalog";

export type RemoveSourceReason = "bad-arg" | "not-found" | "official";

export type RemoveSourceDecision =
  | { ok: true; next: unknown[] }
  | { ok: false; reason: RemoveSourceReason };

/** 本地路径归一（删除判等用）：斜杠统一、去尾斜杠、Windows 大小写不敏感。 */
function normalizePathKey(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** 单条原始配置值的身份键——URL 用 owner/repo；本地 path 用归一路径；认不出 = null */
function identityOf(item: unknown): { url?: string; path?: string } {
  if (typeof item === "string") {
    const url = item.trim();
    return url ? { url } : {};
  }
  if (typeof item !== "object" || item === null) return {};
  const rec = item as { url?: unknown; path?: unknown };
  return {
    url: typeof rec.url === "string" && rec.url.trim() ? rec.url.trim() : undefined,
    path: typeof rec.path === "string" && rec.path.trim() ? rec.path.trim() : undefined,
  };
}

/**
 * 移源决策。
 * @param items 配置原始数组（`configuration.get(CONFIG_KEY)` 的原值，未归一）
 * @param arg   `index`（数组下标）或 `url`/`path`（身份匹配）
 */
export function decideRemoveSource(
  items: readonly unknown[],
  arg: string | number | undefined,
): RemoveSourceDecision {
  const list = Array.isArray(items) ? items : [];

  // 形态一：下标（0 基）——越界/非整数 = 调用不成立
  if (typeof arg === "number") {
    if (!Number.isInteger(arg) || arg < 0 || arg >= list.length) return { ok: false, reason: "bad-arg" };
    return { ok: true, next: list.filter((_, i) => i !== arg) };
  }

  // 形态二：身份串（URL 或本地路径）
  const raw = typeof arg === "string" ? arg.trim() : "";
  if (!raw) return { ok: false, reason: "bad-arg" };

  const wantedUrlKey = urlSourceKey(raw);
  if (wantedUrlKey !== null && wantedUrlKey === urlSourceKey(OFFICIAL_SOURCE_URL)) {
    return { ok: false, reason: "official" };
  }
  const wantedPathKey = normalizePathKey(raw);

  const idx = list.findIndex((item) => {
    const id = identityOf(item);
    if (id.url && wantedUrlKey !== null) {
      const key = urlSourceKey(id.url);
      if (key !== null && key === wantedUrlKey) return true;
    }
    if (id.path && wantedPathKey) {
      if (normalizePathKey(id.path) === wantedPathKey) return true;
    }
    return false;
  });
  if (idx < 0) return { ok: false, reason: "not-found" };
  return { ok: true, next: list.filter((_, i) => i !== idx) };
}
