/**
 * catalogWarnings —— 目录声明警告的**展示文案映射**（来源页「N 条声明提示」）。
 *
 * 数据（code/entryId/detail/source）由 `services/marketCatalog/parse` 产出，`marketSources/load`
 * 在合并期回填 `source`；本件只把 code 映射成 t() 文案，⛔ 不重新判声明（判据只有一份）。
 *
 * R4-3.18（05 §02）：抓取/派生型字段缺失（`missing-entry-field`）也走这条线——详情页不画该行、
 * 来源页把「目录缺字段」暴露给用户/作者（⛔ 不在详情页写「未提供」掩盖）。
 */

import type { CatalogWarning } from "../../../services/marketCatalog";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** 单条目录警告的可读文案（一行一条；detail 是作者自己写的原值/字段名） */
export function catalogWarningText(t: T, w: CatalogWarning): string {
  const entry = w.entryId ? `${w.entryId}：` : "";
  switch (w.code) {
    case "unknown-category":
      return `${entry}${t("未知主分类「{{slug}}」——已按「其他」归桶", { slug: w.detail ?? "" })}`;
    case "unknown-subcategory":
      return `${entry}${t("未知小分类「{{slug}}」——该标签未渲染", { slug: w.detail ?? "" })}`;
    case "unknown-rail-category":
      return t("分类栏声明了未启用的分类「{{slug}}」——已跳过", { slug: w.detail ?? "" });
    case "screenshot-video-restricted":
      return `${entry}${t("截图里的视频项越位（{{at}}）——最多 1 段且必须排第一，多余项已丢弃", {
        at: w.detail ?? "",
      })}`;
    case "screenshot-url-invalid":
      return `${entry}${t("截图/封面地址不是 https 绝对 URL（{{at}}）——未装用户看不到，卡上已跳过该帧", {
        at: w.detail ?? "",
      })}`;
    case "invalid-source-link":
      return t("已审核源声明不合形——该行已跳过");
    case "invalid-collection":
      return w.detail
        ? t("合集声明不合形（{{detail}}）——该板块未渲染", { detail: w.detail })
        : t("合集声明不合形——该板块未渲染");
    case "missing-entry-field":
      return `${entry}${t("目录缺抓取字段「{{field}}」——详情页对应行不显示", { field: w.detail ?? "" })}`;
    default:
      return `${entry}${t("声明提示")}`;
  }
}

/** 目录域全部提示（来源页悬停明细用；一行一条） */
export function catalogWarningLines(t: T, warnings: readonly CatalogWarning[]): string[] {
  return warnings.map((w) => catalogWarningText(t, w));
}
