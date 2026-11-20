/**
 * MarketplaceView — 插件市场**入口标签页**（tab type = `marketplace`）。
 *
 * 棒 6 起：入口页不再是一段引导 hero，而是**主区 Plugin Store 本体**——
 *   ① 用户启用 `marketplace.openTabOnIcon` 后点图标 → 壳 `createTab("marketplace")` → 这里；
 *   ② 命令/Sidebar「进入 Plugin Store」打开专用主区视图 `marketplace-store`（同一组件）。
 * 两个标签类型指向同一台商店（入口别名），保证两条入口看到的都是同一份 UI/同一份数据。
 *
 * 池层零 `@src/core/*`；一切壳能力经 `services/` → `window.linkdesk.*`。
 */

import StoreView from "./views/store/StoreView";

export default function MarketplaceView({ isActive = true }: { isActive?: boolean }) {
  return <StoreView isActive={isActive} />;
}
