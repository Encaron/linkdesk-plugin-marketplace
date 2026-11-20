/**
 * StoreContext — 商店视图树的**显式依赖注入**（10 §三：props/context 传入，⛔ 隐式单例）。
 *
 * 为什么用 context 而不是逐层 props：rail / 首页 / 分类 / 搜索 / 榜单都吃同一组「数据 + 动作 +
 * 导航 + 偏好 + 筛选」；逐层透传会让每个板块文件都背十几个 props，且容易各页长出自己的一份状态。
 * provider 的值由 StoreView 一处组装（唯一属主），子视图只读。
 */

import { createContext, useContext, type ReactNode } from "react";
import type { StoreData } from "./useStoreData";
import type { StoreCardHandlers } from "./cards/cardParts";
import type { StoreRoute } from "./navigation";
import type { CatSort, InstallFilters } from "./storeData";
import type { AuthorSort, LibSort } from "../../services/marketplaceShared/uiPrefs";
import type { UIPrefs } from "../../services/marketplaceShared/uiPrefs";
import type { ViewMode } from "../../ui";

export interface StoreContextValue {
  data: StoreData;
  actions: StoreCardHandlers;
  route: StoreRoute;
  navigate: (route: StoreRoute) => void;
  /** 搜索输入（受控；键入即搜索，清空回原视图） */
  searchInput: string;
  setSearchInput: (v: string) => void;
  clearSearch: () => void;
  prefs: UIPrefs;
  setCatView: (v: ViewMode) => void;
  setCatSort: (s: CatSort) => void;
  setAuthorView: (v: ViewMode) => void;
  setAuthorSort: (s: AuthorSort) => void;
  setLibView: (v: ViewMode) => void;
  setLibSort: (s: LibSort) => void;
  filters: InstallFilters;
  setFilters: (f: InstallFilters) => void;
  /** 发现型未读分类（rail 6px 点；进入即已读） */
  unreadCats: ReadonlySet<string>;
  /** 发现型未读作者（rail 作者项 6px 点；进店即已读——与分类点同体系） */
  unreadAuthors: ReadonlySet<string>;
  /** 当前小类 chip（`null` = 全部；`__none` = 未标注兜底） */
  subChip: string | null;
  setSubChip: (chip: string | null) => void;
  contentPending: boolean;
  refreshContent: () => void;
  dismissContent: () => void;
  checkUpdates: () => void;
  addSource: () => void;
  /** 打开加源弹窗（网络/本地两页签；来源页两个大按钮也走这里） */
  openAddSource: (mode?: "remote" | "local") => void;
  /** 状态变化（排序/筛选/视图/chip）时保滚动位——机械守则：页面不跳 */
  keepScroll: (fn: () => void) => void;
}

const Ctx = createContext<StoreContextValue | null>(null);

export function StoreProvider({ value, children }: { value: StoreContextValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore 必须在 StoreProvider 内使用");
  return v;
}
