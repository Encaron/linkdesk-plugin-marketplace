/**
 * extensionMenu — 插件「管理菜单」的**上下文键与菜单 id**（单一来源）。
 *
 * 侧栏齿轮菜单与商店卡片 ⋯ 菜单共用同一份 `marketplaceItemGear` 注册表（当条件/危险色/主题·语言子菜单
 * 全由壳菜单机制提供）⇒ F21b（2026-11-21 用户：「一套逻辑两个实现」）归一化：⛔ 再手工拼菜单项。
 */

import type { PluginListEntry, PluginListSubset } from "@linkdesk/contracts";

/** 与 commands.ts 的 registerItems 同一个 id（改一处即两处生效） */
export const EXTENSION_MENU_ID = "marketplaceItemGear";

/** 打开菜单前按 manifest 设置 when 条件消费的 context key */
export function applyExtensionMenuContext(manifest: PluginListSubset | undefined, disabled: boolean): void {
  const c = manifest?.contributes ?? {};
  const set = window.linkdesk?.contextKey?.set;
  set?.("marketplace.pluginDisabled", disabled);
  set?.("marketplace.extensionHasThemes", !!c.themes);
  set?.("marketplace.extensionHasLanguages", !!c.languages);
  set?.("marketplace.extensionHasIconThemes", !!c.iconThemes);
  set?.("marketplace.extensionHasConfiguration", !!c.configuration);
  set?.("marketplace.extensionHasKeybindings", !!c.keybindings);
}

/** 菜单关闭后清理 */
export function clearExtensionMenuContext(): void {
  const set = window.linkdesk?.contextKey?.set;
  set?.("marketplace.pluginDisabled", false);
  set?.("marketplace.extensionHasThemes", false);
  set?.("marketplace.extensionHasLanguages", false);
  set?.("marketplace.extensionHasIconThemes", false);
  set?.("marketplace.extensionHasConfiguration", false);
  set?.("marketplace.extensionHasKeybindings", false);
}

/** 查已装/内置行（含 manifest）——直接问壳，不依赖侧栏列表是否预热。
 *  卡片 ⋯ 与侧栏齿轮共用同一判定，⛔ 各自缓存第二份。 */
export async function findInstalledPlugin(pluginId: string): Promise<PluginListEntry | undefined> {
  try {
    const list = await window.linkdesk?.pluginManager?.list?.();
    return list?.find((p) => p.pluginId === pluginId);
  } catch {
    return undefined;
  }
}
