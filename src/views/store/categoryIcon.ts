/**
 * categoryIcon — 分类 slug → 图标名的**唯一映射**（rail 与首页瓷片共用；未知 slug 落「其他」的点图标）。
 */

import type { IconName } from "../../ui";

const MAP: Record<string, IconName> = {
  development: "code",
  documents: "filetext",
  hardware: "plug",
  network: "network",
  productivity: "zap",
  themes: "palette",
  reading: "book",
  entertainment: "gamepad",
  other: "dots",
};

export function categoryIcon(slug: string): IconName {
  return MAP[slug] ?? "dots";
}
