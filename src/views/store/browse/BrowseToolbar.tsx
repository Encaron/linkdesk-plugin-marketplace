/**
 * BrowseToolbar — 分类页/搜索页共用的工具行（排序 chips ＋ 筛选下拉 ＋ 平铺⇄详细）。
 *
 * 归一化（10 §一）：整行只有这一份——⛔ 页面自拼 seg/chips；筛选只放**可枚举事实**
 * （安装状态/更新/来源），⛔ 名称/作者名输入（那等于搜索）。
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenu } from "@linkdesk/ui";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import { Icon, SORT_SETS, SortChips, ViewSeg } from "../../../ui";
import { EMPTY_FILTERS, filterCount, type CatSort, type InstallFilters } from "../storeData";
import { useStore } from "../StoreContext";

/**
 * BrowseToolbar — 分类页/搜索页共用的工具行（排序 chips ＋ 筛选 ＋ 平铺⇄详细）。
 *
 * 归一化（10 §一）：整行只有这一份——⛔ 页面自拼 seg/chips；筛选只放**可枚举事实**
 * （安装状态/更新/来源），⛔ 名称/作者名输入（那等于搜索）。
 * 🔴 F17（2026-11-21 用户定稿「橱窗判据」）：筛选弹层＝**共享 `<ContextMenu>` 打勾式**
 *    （checked 勾选态＋group 分组头＋onSelect 池侧回调）——此前自绘小框被用户点名换装；
 *    ⛔ 回退 `.marketplace-store-sel-*` 自绘弹层。
 */

function FilterMenu() {
  const { t } = useTranslation();
  const { filters, setFilters, keepScroll } = useStore();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const n = filterCount(filters);
  const toggle = (key: keyof InstallFilters) =>
    keepScroll(() => setFilters({ ...filters, [key]: !filters[key] }));

  /** 打勾项：group 分组头 + checked 勾选态 + onSelect 池侧回调（ContextMenu 一等字段） */
  const descriptors: MenuItemDescriptor[] = [
    ...(
      [
        ["installed", "已安装"],
        ["uninstalled", "未安装"],
        ["update", "有更新"],
      ] as Array<[keyof InstallFilters, string]>
    ).map(([key, label]) => ({
      command: "", // 仅作 id 载体；动作走 onSelect（不注册壳命令）
      label: t(label),
      group: t("安装状态"),
      checked: !!filters[key],
      onSelect: () => toggle(key),
    })),
    ...(
      [
        ["official", "官方"],
        ["third", "社区"],
        ["local", "本地插件"],
      ] as Array<[keyof InstallFilters, string]>
    ).map(([key, label]) => ({
      command: "", // 仅作 id 载体；动作走 onSelect（不注册壳命令）
      label: t(label),
      group: t("来源"),
      checked: !!filters[key],
      onSelect: () => toggle(key),
    })),
    {
      command: "", // 同上（onSelect 执行）
      label: t("清除筛选"),
      group: t("操作"),
      onSelect: () => keepScroll(() => setFilters({ ...EMPTY_FILTERS })),
    },
  ];

  return (
    <button
      ref={btnRef}
      type="button"
      className="marketplace-store-sel"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => {
        if (open) {
          setOpen(false);
          return;
        }
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setAnchor({ x: r.left, y: r.bottom + 4 });
        setOpen(true);
      }}
    >
      <Icon name="funnel" size="sm" />
      {n ? t("筛选 · {{count}}", { count: n }) : t("筛选")}
      <Icon name="chevron-down" size="sm" className="marketplace-store-sel-caret" />
      {open && (
        <ContextMenu
          menuId="marketplace-filter"
          anchor={anchor}
          variant="non-modal"
          keepOpenOnSelect
          onClose={() => setOpen(false)}
          items={descriptors}
        />
      )}
    </button>
  );
}

export function BrowseToolbar() {
  const { t } = useTranslation();
  const { prefs, setCatSort, setCatView } = useStore();
  return (
    <div className="marketplace-store-toolbar">
      <span className="marketplace-store-tb-label">{t("排序")}</span>
      <SortChips value={prefs.catSort} options={SORT_SETS.cat} onChange={(v) => setCatSort(v as CatSort)} />
      <FilterMenu />
      <ViewSeg value={prefs.catView} onChange={setCatView} />
    </div>
  );
}

export default BrowseToolbar;
