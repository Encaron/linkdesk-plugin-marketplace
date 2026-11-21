/**
 * MoreMenu — 卡片「⋯」菜单的**唯一实现**（五卡同构）。
 *
 * 🔴 F21（2026-11-21 用户定稿「橱窗判据」）：菜单本体＝**共享 `<ContextMenu>`**（@linkdesk/ui）
 *    ——此前卡内绝对定位自绘版被横滚容器裁剪（「查看详情/禁用」下半截被切的真机实拍）＋玻璃下
 *    半透透底；共享件浮层根内永不裁剪＋玻璃皮现成＋外点/Esc/子菜单/快捷键标注全白得。
 *    ⛔ 回退卡内自绘面板（同型裁剪必复发）。
 * 项仍由纯函数 `moreMenuItems()` 推导（随装态）；**disabled 项不渲染**（ContextMenu 无置灰形态——
 *    core 的卸载项直接隐藏＝诚实；置灰原因留在卡面动作钮上）。
 * 整卡＝开详情，菜单动作不能误触：按钮/菜单动作 `stopPropagation`。
 */

import { useRef, useState } from "react";
import { ContextMenu } from "@linkdesk/ui";
import { useTranslation } from "react-i18next";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
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
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor({ x: r.right, y: r.bottom + 4 });
    setOpen(true);
  };

  /** MoreItem → 注入描述符：onSelect 池侧回调（关菜单→派发动作）；disabled 项不渲染 */
  const descriptors: MenuItemDescriptor[] = items
    .filter((m) => !m.disabled)
    .map((m) => ({
      command: "", // 仅作 id 载体；动作走 onSelect（不注册壳命令）
      label: t(m.labelKey),
      group: t("更多动作"),
      onSelect: () => {
        setOpen(false);
        onSelect(m.id);
      },
    }));

  return (
    <div className={`marketplace-ui-more ${className ?? ""}`.trim()} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className="marketplace-ui-icon-btn"
        aria-label={t("更多动作")}
        data-hint={t("更多动作")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
      >
        <Icon name="dots" size="sm" />
      </button>
      {open && (
        <ContextMenu
          menuId="marketplace-more"
          anchor={anchor}
          variant="non-modal"
          onClose={() => setOpen(false)}
          items={descriptors}
        />
      )}
    </div>
  );
}

export default MoreMenu;
