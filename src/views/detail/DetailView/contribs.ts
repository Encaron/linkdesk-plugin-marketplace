/**
 * contribs——`contributes` 四组的解析（命令 / 配置项 / 键绑定 / 菜单项）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `views/DetailFeaturesTab.tsx` 原样搬出，零行为变更
 * （该文件同期迁入 `views/DetailView/FeaturesTab.tsx`）。
 *
 * 数据 = `list().manifest.contributes`（现成字段，壳零新 API）。contributes 只在已装**启用**分支存在
 * （list() 序列化子集含 contributes；禁用 getDisabled 子集与未装目录均无）→ 无数据由视图走空态引导措辞分档。
 * 逐 key 收窄：容忍缺省形状，个别坏项不崩整组。
 *
 * 🔴 E6#151 修（本文件「个别坏项不崩整组」这句曾**做不到**）：清单里 `commands: [null]` 这类空槽进来时，
 * `cmdIdOf` 直读 `c.id` 抛 TypeError ⇒ 详情页「功能」页签整块渲染崩（被壳 ErrorBoundary 兜住）。
 * 根因是**形状未必可信**——壳装插件只验 pluginId/version/name，`contributes` 整块零校验（作者侧 schema
 * 只在 SDK `validate` 里跑）⇒ 手写清单写坏了会原样走到这里。故本文件收口两层：
 * ① `isItem` 先剔掉非对象项（字段一律不读）；② 取字函数自己也吃 `null`（对任何未来调用方同一保证）。
 * 壳侧同族修复见 `src/pluginLoader/contributions/contributions.ts`——那边坏项会吃掉该插件后续**全部**贡献，更隐蔽。
 */

export type CmdItem = { id?: string; title?: string; command?: string };
export type KbItem = { key?: string; command?: string };
export type MenuItem = { command?: string };
export type ConfigItem = [string, { description?: string } | undefined];

function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** 项是不是可安全读字段的对象——`null` / 数组 / 原始值一律不是（坏项在取字之前就出列）。 */
function isItem(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 命令标识取字——`id` 优先、`command` 兜底，两者皆无 = 空串（调用方据此过滤该项）。
 *  收 `null`/`undefined`：导出的取字函数对自己的入参负责，不把「调用方记得先过滤」当契约。 */
export function cmdIdOf(c: CmdItem | null | undefined): string {
  return (c?.id ?? c?.command ?? "").trim();
}

/** 四组解析——有声明才出现（每组 0 项不渲染组壳） */
export function parseContribs(contributes?: Record<string, unknown>): {
  commands: CmdItem[];
  configs: ConfigItem[];
  keybindings: KbItem[];
  menuRows: Array<{ menu: string; command: string }>;
} {
  const commands: CmdItem[] = asList(contributes?.commands)
    .filter(isItem)
    .map((c) => c as CmdItem)
    .filter((c) => cmdIdOf(c));
  const configObj = (contributes?.configuration ?? {}) as { properties?: Record<string, { description?: string }> };
  const configs: ConfigItem[] = configObj.properties ? Object.entries(configObj.properties) : [];
  const keybindings: KbItem[] = asList(contributes?.keybindings)
    .filter(isItem)
    .map((k) => k as KbItem)
    .filter((k) => k.command || k.key);
  // 表本身得是键值表：写成数组（`menus: [...]`）时 Object.entries 会产出 "0"/"1" 这种假菜单名，
  // 详情页会渲染出一片无意义的菜单行——与其余三组「形状不对 = 按空处理」同一口径。
  const menusRaw =
    contributes?.menus && typeof contributes.menus === "object" && !Array.isArray(contributes.menus)
      ? (contributes.menus as Record<string, unknown>)
      : {};
  const menuRows: Array<{ menu: string; command: string }> = [];
  for (const [menu, items] of Object.entries(menusRaw)) {
    const list = Array.isArray(items) ? items : [];
    for (const it of list) {
      const cmd = isItem(it) ? (it as MenuItem).command : undefined;
      if (cmd) menuRows.push({ menu, command: cmd });
    }
  }
  return { commands, configs, keybindings, menuRows };
}
