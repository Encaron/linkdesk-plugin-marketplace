/**
 * authorWarnings — 作者块声明提示的**展示文案映射**（09 §二；来源页作者行「N 条声明提示」）。
 *
 * 数据（code/repoId/detail）由 `services/authors` 产出——本件只把 code 映射成 t() 文案，
 * ⛔ 不在这里重新判声明（判据只有一份）。
 */

import type { AuthorWarning } from "../../../services/authors";

/** 单条声明的可读文案（i18n 走调用方 t()；detail 是作者自己写的原值/数量） */
export function authorWarningText(t: (key: string, opts?: Record<string, unknown>) => string, w: AuthorWarning): string {
  const repo = w.repoId ? `${w.repoId}：` : "";
  switch (w.code) {
    case "duplicate-hero":
      return `${repo}${t("声明了 {{count}} 个大屏——只有第 1 个占据置顶首视觉，其余按声明顺序就地渲染", {
        count: Number(w.detail ?? 0),
      })}`;
    case "unknown-section":
      return `${repo}${t("未知板块类型「{{type}}」——已跳过", { type: w.detail ?? "" })}`;
    case "missing-collection":
      return `${repo}${t("合集「{{id}}」不存在——该板块未渲染", { id: w.detail ?? "" })}`;
    default:
      return `${repo}${t("声明提示")}`;
  }
}

/** 作者域全部提示（来源页悬停明细用；一行一条） */
export function authorWarningLines(
  t: (key: string, opts?: Record<string, unknown>) => string,
  warnings: readonly AuthorWarning[],
): string[] {
  return warnings.map((w) => authorWarningText(t, w));
}
