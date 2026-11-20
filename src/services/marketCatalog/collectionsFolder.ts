/**
 * collectionsFolder — 合集**拆分写法**读取（R4-4.5，批4b；06 §二·3b「向后兼容两读」）。
 *
 * 两读形态（同一根级字段 `collections[]`）：**对象 = inline 声明；字符串 = `collections/<id>.json`
 * 文件夹引用**（publish v2 维护——R4-4.5 同笔拍板）。市场侧**有字符串引用才拉对应文件**：
 * v1 目录（无引用）零探针、零新增请求（棒 3 坑 1 纪律「v1 兼容路径零新增请求」的落地，
 * ⛔ 不做无条件目录探针，⛔ 不调 GitHub 目录列举 API——匿名 60 次/时限额）。
 *
 * 同 id 冲突 = **inline 主文件正典胜** + `duplicate-collection` 警告（不警告 = 作者改了文件夹
 * 以为生效了其实没有）。
 *
 * 本文件只做纯解析/合并（零 IO——fetch 编排在 marketSources/load.ts，vitest 注入 fetcher 直测）。
 */

import type { CatalogWarning, CollectionDecl } from "./types";

/** 文件名 = `<id>.json`（id 已过 slug 形状关——parse 侧拒非 slug 引用，无路径穿越面） */
export function collectionFileOf(id: string): string {
  return `collections/${id}.json`;
}

/** 文件夹合集 ⊕ 主文件 inline 合集——同 id **inline 胜**（06 §二·3b 主文件正典）+ 重复声明警告 */
export function mergeFolderWithInline(
  inline: CollectionDecl[] | undefined,
  folder: CollectionDecl[],
): { collections: CollectionDecl[]; warnings: CatalogWarning[] } {
  const warnings: CatalogWarning[] = [];
  const byId = new Map<string, CollectionDecl>();
  for (const c of inline ?? []) byId.set(c.id, c);
  const out: CollectionDecl[] = [...(inline ?? [])];
  for (const c of folder) {
    if (byId.has(c.id)) {
      warnings.push({ code: "duplicate-collection", detail: c.id });
      continue;
    }
    byId.set(c.id, c);
    out.push(c);
  }
  return { collections: out, warnings };
}
