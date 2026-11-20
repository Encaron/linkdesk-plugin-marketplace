/**
 * signature —— 目录**内容签名**（R4-2.5 `marketplace.refreshCatalog` 的 `changed` 判据）。
 *
 * 为什么单开一个纯函数：`changed` 要回答「这次强刷之后用户看到的东西变没变」。判据必须与
 * 「目录里有什么」同一份数据面（entries / collections / railOrder），⛔ 不能拿 `fetchedAt`
 * 冒充（时间变了不代表内容变了）。纯函数 ⇒ vitest 直测，也把「签名口径」钉在一处。
 *
 * ⚠️ **v1 是结构签名，不是 contentHash**：06 §六 的内容热更新（R4-5.6）会引入 `contentHash`
 * 做跨进程比对；届时把本函数换成同一份哈希实现即可——**调用方只认 `catalogSignature()` 这个名字**，
 * 签名形状不进任何契约。本函数刻意保留条目顺序（顺序 = 合集/榜单的展示事实，排序会漏掉换序）。
 */

import type { CatalogEntry, CollectionDecl } from "./types";

/** 目录内容签名——同一内容恒等、内容变化即变（顺序敏感：合集/榜单换序也是内容变化）。 */
export function catalogSignature(
  entries: readonly CatalogEntry[],
  collections: readonly CollectionDecl[] = [],
  railOrder: readonly string[] = [],
): string {
  return JSON.stringify({ entries, collections, railOrder });
}
