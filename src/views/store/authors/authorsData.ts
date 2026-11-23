/**
 * authorsData — 作者域视图的**纯推导层**（排序 / 仓卡扇出 / 计数 / 作者作用域过滤）。
 *
 * 纪律（10 §六）：排序与聚合不进 JSX；数据聚合的唯一权威是 `services/authors.ts`，
 * 本文件只做「拿聚合结果怎么排、怎么收敛成卡面形状」，⛔ 不重解析作者块。
 */

import type { AuthorDomain, AuthorRepoView } from "../../../services/authors";
import type { AuthorSort } from "../../../services/marketplaceShared/uiPrefs";

/** 仓卡扇出项（蓝图 authorDeck：1 仓满宽「唯一仓库」；4+ 前 2＋「+N 个仓库」汇总） */
export interface AuthorDeckItem {
  name: string;
  /** 仓名语言槽位——卡面按应用语言解析（与 domain/repo 同一套 locales） */
  locales?: AuthorRepoView["locales"];
  count: number;
  /** 汇总卡（+N）——文案由视图出（作者数据里没有这个名字） */
  more?: boolean;
}

/**
 * 仓卡扇出收敛（蓝图 v3.30 容量边界）：
 *   - 1 仓：单张（视图侧给「唯一仓库」副标，⛔ 假装扇出）；
 *   - 2~3 仓：逐张；
 *   - 4+：前 2 ＋ 汇总卡（⛔ 溢出卡片）。
 */
export function authorDeckOf(repos: readonly AuthorRepoView[]): AuthorDeckItem[] {
  const items = repos.map((r) => ({ name: r.name, locales: r.locales, count: r.plugins.length, id: r.id }));
  if (items.length > 3) {
    const rest = items.slice(2);
    return [
      ...items.slice(0, 2),
      { name: "", count: rest.reduce((n, r) => n + r.count, 0), more: true },
    ];
  }
  return items.map(({ name, locales, count }) => ({ name, locales, count }));
}

/** 汇总卡的实际仓数（+N 的 N） */
export function authorDeckRestCount(repos: readonly AuthorRepoView[]): number {
  return repos.length > 3 ? repos.length - 2 : 0;
}

/** 作者插件总数（仓卡/列表行共用；空仓照实 0） */
export function authorPluginCount(domain: Pick<AuthorDomain, "repos">): number {
  return domain.repos.reduce((n, r) => n + r.plugins.length, 0);
}

/** 作者列表排序（名称 A→Z / 插件数降序 / 仓库数降序；同值时名称兜底） */
export function sortAuthorDomains(domains: readonly AuthorDomain[], sort: AuthorSort): AuthorDomain[] {
  const list = [...domains];
  const byName = (a: AuthorDomain, b: AuthorDomain) => a.name.localeCompare(b.name, "zh");
  if (sort === "plugins") {
    return list.sort((a, b) => authorPluginCount(b) - authorPluginCount(a) || byName(a, b));
  }
  if (sort === "repos") {
    return list.sort((a, b) => b.repos.length - a.repos.length || byName(a, b));
  }
  return list.sort(byName);
}
