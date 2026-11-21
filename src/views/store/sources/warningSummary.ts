/**
 * warningSummary — 来源页「声明提示」的**可读聚合**（F5，2026-11-21 用户拍板：同意按警告码聚合＋悬停明细）。
 *
 * 为什么不在调用点各拼一份：来源页有两处（官方锁定行 / 作者组），且两侧警告来自两个域
 * （作者块 `AuthorWarning` / 目录 `CatalogWarning`）——码表只此一份，文案只此一份。
 *
 * 形态：`缺抓取字段 ×1500 · 重复大屏 ×6`；超过两类时尾部 `+N 类`。明细仍在 data-hint（原逐条文案）。
 */

export interface WarningLike {
  code: string;
}

/** 码 → 用户面短名（⛔ 不把市场内部错误码直接上屏） */
const CODE_LABEL: Record<string, string> = {
  // 作者块域（services/authors）
  "duplicate-hero": "重复大屏",
  "unknown-section": "未知板块",
  "missing-collection": "缺失合集",
  // 目录域（services/marketCatalog）
  "unknown-category": "未注册分类",
  "unknown-subcategory": "未注册小类",
  "unknown-rail-category": "分类栏越界",
  "invalid-source": "源声明不合形",
  "invalid-collection": "合集声明不合形",
  "missing-entry-field": "缺抓取字段",
};

/** 最多展示几类（其余折成 +N 类） */
const SHOW_TOP = 2;

export interface WarningSummary {
  /** 聚合短标（两行内；无警告 = 空串） */
  label: string;
  /** 按数量降序的全部类别（测试/明细用） */
  groups: Array<{ name: string; count: number }>;
}

export function summarizeWarnings(
  t: (key: string, opts?: Record<string, unknown>) => string,
  warnings: readonly WarningLike[],
): WarningSummary {
  const counts = new Map<string, number>();
  for (const w of warnings) {
    const name = CODE_LABEL[w.code] ?? w.code;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  // 并列时按**首次出现顺序**（稳定、与运行环境 locale 无关——⛔ localeCompare 会让文案随语言变）
  const groups = [...counts.entries()].map(([name, count], idx) => ({ name: t(name), count, idx }))
    .sort((a, b) => b.count - a.count || a.idx - b.idx)
    .map(({ name, count }) => ({ name, count }));
  const top = groups.slice(0, SHOW_TOP);
  const rest = groups.length - top.length;
  let label = top.map((g) => t("{{name}} ×{{count}}", { name: g.name, count: g.count })).join(" · ");
  if (rest > 0) label += t(" · +{{count}} 类", { count: rest });
  return { label, groups };
}
