/**
 * SortSelect — 排序的**唯一实现**（F42 · 2026-11-21）：共享 `SelectBox`（单选下拉）。
 *
 * 规则同旧 SortChips：`SORT_SETS` 只放**选项**（值 + i18n key）；页面只给 ctx 与当前值、收变更回调。
 * ⛔ 不在页面里自拼第二份排序控件；⛔ 不再用一排 chips 占整行。
 *
 * 取值域 = 蓝图 v3 真实读数（与 `marketplaceShared/uiPrefs.ts` 的 CatSort/LibSort/AuthorSort 同域）：
 *   lib   = name / updated / size / source / author / repo
 *   cat   = dl / upd / az / author / repo
 *   author= name / plugins / repos
 */

import { useTranslation } from "react-i18next";
import { SelectBox } from "@linkdesk/ui";

export type SortContext = "lib" | "cat" | "author";

export interface SortOption {
  value: string;
  /** i18n key（中文原文） */
  key: string;
}

export const SORT_SETS: Record<SortContext, readonly SortOption[]> = {
  lib: [
    { value: "name", key: "名称" },
    { value: "updated", key: "最近更新" },
    { value: "size", key: "包大小" },
    { value: "source", key: "来源" },
    { value: "author", key: "作者" },
    { value: "repo", key: "仓库" },
  ],
  cat: [
    { value: "dl", key: "最多下载" },
    { value: "upd", key: "最近更新" },
    { value: "az", key: "字母 A→Z" },
    { value: "author", key: "按作者" },
    { value: "repo", key: "按仓库" },
  ],
  author: [
    { value: "name", key: "名称 A→Z" },
    { value: "plugins", key: "插件数" },
    { value: "repos", key: "仓库数" },
  ],
};

/** 取某上下文的选项（防御：未知 ctx 退 cat——只发生在类型外调用） */
export function sortOptionsOf(ctx: SortContext): readonly SortOption[] {
  return SORT_SETS[ctx] ?? SORT_SETS.cat;
}

export function SortSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: readonly SortOption[];
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <SelectBox
      title={ariaLabel ?? t("排序")}
      value={value}
      options={options.map((o) => ({ value: o.value, label: t(o.key) }))}
      onChange={onChange}
    />
  );
}

export default SortSelect;
