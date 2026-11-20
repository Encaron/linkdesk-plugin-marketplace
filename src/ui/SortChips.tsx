/**
 * SortChips — 排序 chips 的**唯一来源**（蓝图 `sortChips()/applySort()` 的 R4 落位，10 §一）。
 *
 * 规则：`SORT_SETS` 只放**选项**（值 + i18n key）；页面只给 ctx 与当前值、收变更回调。
 * ⛔ 不在页面里 `options.map(button)` 自拼第二份 chips。
 *
 * 取值域 = 蓝图 v3 真实读数（与 `marketplaceShared/uiPrefs.ts` 的 CatSort/LibSort/AuthorSort 同域）：
 *   lib   = name / updated / size / source / author / repo
 *   cat   = dl / upd / az / author / repo
 *   author= name / plugins / repos
 */

import { useTranslation } from "react-i18next";

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

export function SortChips({
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
    <div className="marketplace-ui-chips" role="group" aria-label={ariaLabel ?? t("排序")}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={`marketplace-ui-chip ${value === o.value ? "is-on" : ""}`}
          data-sort={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {t(o.key)}
        </button>
      ))}
    </div>
  );
}

export default SortChips;
