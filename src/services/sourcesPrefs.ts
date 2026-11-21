/**
 * sourcesPrefs — 「来源」页作者/官方分组的默认开合（唯一读写口）。
 *
 * 真相源 = 本仓 `plugin.json` contributes.configuration 的 `marketplace.sourcesDefaultCollapsed`
 * （设置页可见）；命令面 `marketplace.setSourcesDefaultCollapsed` 写同一键——
 * ⛔ 视图不另存一份 pluginState，避免设置页/命令/页面三处不一致。
 */

export const SOURCES_COLLAPSED_KEY = "marketplace.sourcesDefaultCollapsed";

export async function readSourcesDefaultCollapsed(): Promise<boolean> {
  try {
    const v = await window.linkdesk?.configuration?.get<unknown>(SOURCES_COLLAPSED_KEY);
    return v === true;
  } catch {
    return false;
  }
}

export function onSourcesDefaultCollapsedChange(cb: (collapsed: boolean) => void): () => void {
  try {
    const un = window.linkdesk?.configuration?.onChange?.(SOURCES_COLLAPSED_KEY, (v) => cb(v === true));
    return typeof un === "function" ? un : () => {};
  } catch {
    return () => {};
  }
}

export async function setSourcesDefaultCollapsed(collapsed: boolean): Promise<boolean> {
  const cfg = window.linkdesk?.configuration;
  if (!cfg?.set) return false;
  await cfg.set(SOURCES_COLLAPSED_KEY, collapsed);
  return true;
}
