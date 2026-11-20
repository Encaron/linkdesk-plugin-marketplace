/**
 * vendors — 厂商注册表（`vendors.json`）解析与「官方 ✓」注入（09 §一·补2）。
 *
 * 判定链唯一：条目 `authorId` → 注册表命中 ⇒ 官方 ✓；未命中 ⇒ 社区；本地 ⇒ 本地。
 * ⛔ 不看作者名叫不叫官方（可重名）；⛔ 不开放作者自声明徽标文本。
 *
 * 注入在**合并期**（与 `official` 同构：身份随条目携带，UI 零再判）——本模块只做纯变换。
 */

import type { CatalogEntry, VendorRecord } from "./types";

/** 解析 vendors.json 文本——坏 JSON / 非数组返回 []（注册表是官方运营者文件，失败不阻塞目录） */
export function parseVendors(text: string): VendorRecord[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(json)) return [];
  const out: VendorRecord[] = [];
  for (const item of json) {
    const r = item as Partial<VendorRecord> | null;
    if (!r || typeof r.vendorId !== "string" || !r.vendorId.trim()) continue;
    out.push({
      vendorId: r.vendorId.trim(),
      name: typeof r.name === "string" ? r.name : r.vendorId,
      domains: Array.isArray(r.domains) ? r.domains.filter((d): d is string => typeof d === "string") : undefined,
      githubOrgs: Array.isArray(r.githubOrgs)
        ? r.githubOrgs.filter((o): o is string => typeof o === "string")
        : undefined,
      verifiedBy: typeof r.verifiedBy === "string" ? r.verifiedBy : undefined,
      verifiedAt: typeof r.verifiedAt === "string" ? r.verifiedAt : undefined,
    });
  }
  return out;
}

/** 注册表键集合（判定只认 vendorId；展示名不参与匹配） */
export function vendorIdSetOf(records: VendorRecord[]): Set<string> {
  return new Set(records.map((r) => r.vendorId));
}

/** 合并注入：authorId 命中注册表 ⇒ 条目带 `vendorId`（= 命中的键）。空集合原样返回（零改动路径）。 */
export function withVendorIds(entries: CatalogEntry[], vendorIds: ReadonlySet<string>): CatalogEntry[] {
  if (vendorIds.size === 0) return entries;
  return entries.map((entry) => {
    const authorId = entry.authorId?.trim();
    return authorId && vendorIds.has(authorId) ? { ...entry, vendorId: authorId } : entry;
  });
}
