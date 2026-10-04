/**
 * configLabel——市场「功能」页配置行**上行**的取字（配置项短名案 T3／D3，纯函数零依赖）。
 *
 * 级联：短名（`title`）→ 说明（`description`）→ 配置键（`key`）。
 *   · 短名 = 声明里的人工短名（与设置页行名同源，D1）——有它就用它，两处界面同一行名；
 *   · 无短名（第三方存量声明）⇒ 回退显说明，行为与改造前一致（E1 零影响）；
 *   · 再没有 ⇒ 配置键兜底（永不空白）。
 * 🔴 **两种原文都要过 `t()`**：它们是中文原文 = i18n key。改造前这一行**没过 t()** ⇒ 英文界面
 *    整块中文裸奔（01 层 3 的判据⑤）；`translate` 入参把这件强制成调用方无法跳过的一步。
 * 下行仍原样保留配置键（D3）——市场用「短名 ＋ key」两行式，与设置页只显短名刻意不同。
 */

export function configLabel(
  desc: { title?: string; description?: string } | undefined,
  key: string,
  translate: (s: string) => string,
): string {
  if (desc?.title) return translate(desc.title);
  if (desc?.description) return translate(desc.description);
  return key;
}
