/**
 * collectionLayout — 合集生效 layout 的**唯一判定**（作者 section 覆盖 > 合集声明 > 缺省 strip）。
 * 纯函数；`CollectionRenderer` 与测试共用，⛔ 不在组件里再写第二份。
 */

import type { CollectionDecl } from "../../services/marketCatalog";
import type { AuthorSectionDecl } from "../../services/authors";

export type CollectionLayout = "banner" | "strip" | "duo" | "grid" | "mega" | "small";

export function collectionLayoutOf(
  collection: Pick<CollectionDecl, "layout">,
  section?: Pick<AuthorSectionDecl, "layout">,
): CollectionLayout {
  return (section?.layout ?? collection.layout ?? "strip") as CollectionLayout;
}
