/**
 * MoreMenu — 卡片「⋯」菜单的**唯一实现**。
 *
 * 🔴 F21b（2026-11-21 用户抓「一套逻辑两个实现」）：菜单**不再手工拼项**——与侧栏齿轮菜单共用
 *   同一份 `marketplaceItemGear` 注册表（`services/marketplaceShared/commands.ts` 里的 registerItems）：
 *   - 当条件（`marketplace.extensionHasThemes/Languages/Config…`）→ 主题/语言/设置子菜单自动出现；
 *   - `group:"delete"` → 卸载自动红（与侧栏完全同色同交互）；
 *   - 快捷键/图标/禁用态全由壳菜单机制一处提供。
 *   卡片这边只做两件事：打开前按插件 manifest 设 context key、打开后清理。
 *   未安装条目没有可管理项 ⇒ 只给「查看详情」（onSelect 注入项）。
 * 菜单本体走共享 `<ContextMenu>`（浮层根内，永不裁剪）；外观仍为原磨砂（本笔零视觉改动）。
 */

import { useRef, useState } from "react";
import { ContextMenu } from "@linkdesk/ui";
import { useTranslation } from "react-i18next";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import { Icon } from "./icons";
import type { ActionId, MoreItem } from "./ActionButton";
import {
  applyExtensionMenuContext,
  clearExtensionMenuContext,
  EXTENSION_MENU_ID,
  findInstalledPlugin,
} from "../services/extensionMenu";

export function MoreMenu({
  pluginId,
  items,
  onSelect,
  disabled,
  className,
}: {
  /** 条目 pluginId（注册表菜单的 context） */
  pluginId: string;
  items: MoreItem[];
  onSelect: (id: ActionId) => void;
  /** 已禁用态（context key `marketplace.pluginDisabled` 用） */
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  /** 已装条目 → 走共享注册表菜单；未装 → 只给「查看详情」注入项 */
  const [registered, setRegistered] = useState<boolean | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const openMenu = async () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor({ x: r.right, y: r.bottom + 4 });
    // 侧栏列表可能尚未预热 ⇒ 拉一次再判定（未装条目只给「查看详情」）
    const installed = await findInstalledPlugin(pluginId);
    if (installed) {
      applyExtensionMenuContext(installed.manifest, !!disabled);
      setRegistered(true);
    } else {
      setRegistered(false);
    }
    setOpen(true);
  };

  const closeMenu = () => {
    if (registered) clearExtensionMenuContext();
    setOpen(false);
    setRegistered(null);
  };

  /** 未装条目的最小菜单（注入项；onSelect 就地回调） */
  const fallback: MenuItemDescriptor[] = items
    .filter((m) => m.id === "open")
    .map((m) => ({
      command: "",
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
          if (open) closeMenu();
          else void openMenu();
        }}
      >
        <Icon name="dots" size="sm" />
      </button>
      {open && registered === true && (
        <ContextMenu
          menuId={EXTENSION_MENU_ID}
          anchor={anchor}
          context={{ pluginId }}
          variant="non-modal"
          onClose={closeMenu}
        />
      )}
      {open && registered === false && (
        <ContextMenu
          menuId="marketplace-more"
          anchor={anchor}
          variant="non-modal"
          onClose={closeMenu}
          items={fallback}
        />
      )}
    </div>
  );
}

export default MoreMenu;
