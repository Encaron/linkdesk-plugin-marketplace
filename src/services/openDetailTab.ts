/**
 * openDetailTab —— 打开插件详情标签的**唯一入口**（R4-3.16 · 08 v3.51）。
 *
 * 规则（用户 2026-11-19 拍板）：
 *   - 商店里点一个插件 = `pinned:true` 固定新开，点几个开几个，可并排对比；
 *   - 同一插件再点 = 壳按 `detailPluginId` 认身份，只聚焦已有标签（去重归壳，⛔ 本层不算第二份）；
 *   - **未装插件**在壳内没有 manifest，`getDefaultLabel` 会退成「插件详情」⇒ 调用方必须传 label；
 *   - ⛔ 标签栏/标签身份归壳，插件不造第二套、不往标签栏放说明字。
 *
 * 消费方：商店所有卡片入口（`useStoreActions.onOpen`）＋详情页依赖跳转（`DetailView` 门面）。
 * ⛔ 别在视图里各自写 `tabs.create("plugin-detail", …)`——全调用点只走这里。
 */

const lk = () => window.linkdesk;

export async function openPluginDetailTab(pluginId: string, label?: string): Promise<boolean> {
  const tabs = lk()?.tabs;
  if (!pluginId || !tabs?.create) return false;
  try {
    await tabs.create("plugin-detail", { pluginId, pinned: true, ...(label ? { label } : {}) });
    return true;
  } catch {
    return false;
  }
}
