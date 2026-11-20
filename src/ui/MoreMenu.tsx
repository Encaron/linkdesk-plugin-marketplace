/**
 * MoreMenu — 卡片「⋯」菜单的**唯一实现**（蓝图 `moreMenu` 的 R4 落位；五卡同构）。
 *
 * 纪律：
 *   - 项由纯函数 `moreMenuItems()` 推导（随装态；未装不出现禁用；core 卸载置灰带原因）；
 *   - 菜单是**卡片内的绝对定位层**（不 portal、不脱体——蓝图同款），开合只动 opacity/transform/display，
 *     不影响任何文档流几何（机械守则）；
 *   - 点外部 / Esc 关闭；按钮与菜单项都 `stopPropagation`（整卡＝开详情，菜单动作不能误触）。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import type { ActionId, MoreItem } from "./ActionButton";

export function MoreMenu({
  items,
  onSelect,
  className,
}: {
  items: MoreItem[];
  onSelect: (id: ActionId) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    // eslint-disable-next-line linkdesk/no-global-key-listener -- 浮层 Esc 关闭是全局交互（只读 Esc、不 preventDefault、不吞其它键），菜单无独立焦点分区可挂
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`marketplace-ui-more ${className ?? ""}`.trim()} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="marketplace-ui-icon-btn"
        aria-label={t("更多动作")}
        data-hint={t("更多动作")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name="dots" size="sm" />
      </button>
      {open && (
        <div className="marketplace-ui-more-menu is-open" role="menu">
          {items.map((item, i) => (
          <div key={`${item.id}:${i}`}>
            {item.sepBefore && <div className="marketplace-ui-more-sep" />}
            <button
              type="button"
              role="menuitem"
              className={`marketplace-ui-more-item ${item.danger ? "is-danger" : ""}`}
              disabled={item.disabled}
              data-hint={item.titleKey ? t(item.titleKey) : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                setOpen(false);
                onSelect(item.id);
              }}
            >
              {t(item.labelKey)}
            </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MoreMenu;
