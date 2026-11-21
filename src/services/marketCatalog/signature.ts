/**
 * signature —— 目录**内容签名**（contentHash，R4-2.5 `changed` 判据＋R4-5.6/#12 跨进程比对）。
 *
 * 为什么单开一个纯函数：`changed` 要回答「这次强刷之后用户看到的东西变没变」。判据必须与
 * 「目录里有什么」同一份数据面（entries / collections / railOrder），⛔ 不能拿 `fetchedAt`
 * 冒充（时间变了不代表内容变了）。纯函数 ⇒ vitest 直测，也把「签名口径」钉在一处。
 *
 * ✅ **R4-5.6 起为真 contentHash**（06 §六）：FNV-1a 32-bit（零依赖、确定性——同输入恒同输出，
 * 跨进程/跨时间可比对）作用于同一份结构 JSON。**调用方只认 `catalogSignature()` 这个名字**，
 * 哈希形状不进任何契约（只做相等比较）。32-bit 碰撞率 ≈ 2⁻³²/次——误报一次「内容已更新」的
 * 代价是用户多点一次「刷新」，可接受；⛔ 不当安全哈希用。本函数刻意保留条目顺序（顺序 =
 * 合集/榜单的展示事实，排序会漏掉换序）。`catalogKeySignature` 同一哈希域——发现型已读点的
 * 逐桶增量（06 §八·补）与全目录比对共用一份实现（⛔ 两套哈希）。
 */

import type { CatalogEntry, CollectionDecl } from "./types";

/** FNV-1a 32-bit——零依赖确定性哈希（`Math.imul` 保 32 位乘法不溢出精度）。 */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 目录内容签名（contentHash）——同一内容恒等、内容变化即变（顺序敏感：合集/榜单换序也是内容变化）。 */
export function catalogSignature(
  entries: readonly CatalogEntry[],
  collections: readonly CollectionDecl[] = [],
  railOrder: readonly string[] = [],
): string {
  return fnv1a(JSON.stringify({ entries, collections, railOrder }));
}

/** 目录任一子集的内容签名——发现型已读点的逐桶/逐作者增量（06 §八·补）。
 *  与 `catalogSignature` 同一哈希域、同一顺序敏感语义；传什么比什么（调用方决定子集）。 */
export function catalogKeySignature(entries: readonly CatalogEntry[]): string {
  return fnv1a(JSON.stringify(entries));
}
