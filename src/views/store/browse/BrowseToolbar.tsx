/**
 * BrowseToolbar — 分类页/搜索页共用的工具行（排序 chips ＋ 筛选下拉 ＋ 平铺⇄详细）。
 *
 * 归一化（10 §一）：整行只有这一份——⛔ 页面自拼 seg/chips；筛选只放**可枚举事实**
 * （安装状态/更新/来源），⛔ 名称/作者名输入（那等于搜索）。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, SORT_SETS, SortChips, ViewSeg } from "../../../ui";
import { EMPTY_FILTERS, filterCount, type CatSort, type InstallFilters } from "../storeData";
import { useStore } from "../StoreContext";

function FilterMenu() {
  const { t } = useTranslation();
  const { filters, setFilters, keepScroll } = useStore();
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
    // eslint-disable-next-line linkdesk/no-global-key-listener -- 下拉浮层 Esc 关闭（只读 Esc、不 preventDefault），trigger 无独立焦点分区可挂
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const n = filterCount(filters);
  const toggle = (key: keyof InstallFilters) =>
    keepScroll(() => setFilters({ ...filters, [key]: !filters[key] }));
  const item = (key: keyof InstallFilters, label: string) => (
    <button
      type="button"
      className={`marketplace-store-sel-item ${filters[key] ? "is-on" : ""}`}
      role="menuitemcheckbox"
      aria-checked={filters[key]}
      onClick={() => toggle(key)}
    >
      <span className="marketplace-store-sel-check" />
      {label}
    </button>
  );

  return (
    <div className="marketplace-store-sel-wrap" ref={rootRef}>
      <button
        type="button"
        className="marketplace-store-sel"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="funnel" size="sm" />
        {n ? t("筛选 · {{count}}", { count: n }) : t("筛选")}
        <Icon name="chevron-down" size="sm" className="marketplace-store-sel-caret" />
      </button>
      {open && (
        <div className="marketplace-store-sel-menu" role="menu">
          <div className="marketplace-store-sel-sec">{t("安装状态")}</div>
          {item("installed", t("已安装"))}
          {item("uninstalled", t("未安装"))}
          {item("update", t("有更新"))}
          <div className="marketplace-store-sel-sec">{t("来源")}</div>
          {item("official", t("官方"))}
          {item("third", t("社区"))}
          {item("local", t("本地插件"))}
          <div className="marketplace-store-sel-sep" />
          <button
            type="button"
            className="marketplace-store-sel-item"
            onClick={() => keepScroll(() => setFilters({ ...EMPTY_FILTERS }))}
          >
            {t("清除筛选")}
          </button>
        </div>
      )}
    </div>
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
