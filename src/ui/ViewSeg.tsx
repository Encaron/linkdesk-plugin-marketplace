/**
 * ViewSeg — 平铺⇄详细分段钮的**唯一来源**（蓝图 `viewSeg()/applyView()` 的 R4 落位，10 §一）。
 *
 * 顺序全站固定：**平铺（▦）在前、详细（☰）在后**——⛔ 任何页面不得反过来、不得自拼 seg。
 * 状态与持久化由调用方（页面）持有；本件只画与回调（蠢组件）。
 */

import { useTranslation } from "react-i18next";
import { Icon } from "./icons";

export type ViewMode = "grid" | "list";

export function ViewSeg({
  value,
  onChange,
  ariaLabel,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  /** 读屏组标签（缺省 = t("显示方式")） */
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const one = (mode: ViewMode, icon: "grid2" | "list", label: string) => (
    <button
      type="button"
      className={`marketplace-ui-seg-btn ${value === mode ? "is-on" : ""}`}
      data-view={mode}
      data-hint={label}
      aria-label={label}
      aria-pressed={value === mode}
      onClick={() => onChange(mode)}
    >
      <Icon name={icon} size="sm" />
    </button>
  );
  return (
    <div className="marketplace-ui-seg" role="group" aria-label={ariaLabel ?? t("显示方式")}>
      {one("grid", "grid2", t("平铺"))}
      {one("list", "list", t("详细"))}
    </div>
  );
}

export default ViewSeg;
