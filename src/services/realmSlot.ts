/**
 * realmSlot — **跨表面共享状态的地基**（2026-09-30 立案：多表面模块单例塌缩）。
 *
 * 🔴 为什么必须有它：SDK 多表面打包把**每个 `contributes.views[].render` 编成一份独立自包含 bundle**
 *   （`views/SearchView.bundle.js`、`views/DetailView.bundle.js`…）。ESM 的模块身份 = URL ⇒ 同源的
 *   `services/...` 被 7 份 bundle 各内联一份，**模块级单例在表面之间各长一个**：侧栏点「检查更新」翻新的
 *   是侧栏那份目录投影，详情页读的是它自己那份旧投影（2026-09-30 用户实机报障：行内徽标翻新、详情页
 *   版本下拉不动、更新钮不出现，要退软件重进）。
 *
 * 修法：**模块级可变状态不放在模块作用域，放本 realm 的全局槽**——同一 realm（同一 document，池里所有
 *   市场视图共用一份 document）里的 N 份模块副本，从槽里取到的是**同一个对象**。
 *
 * 用法（唯一姿势——状态对象连同它的注释仍住原域文件，本 helper 只管「同一份」）：
 * ```ts
 * interface FooState { value: number; listeners: Set<() => void>; }
 * const state = realmSlot("fooStore", (): FooState => ({ value: 0, listeners: new Set() }));
 * ```
 * 规矩：**每个域的状态归该域文件唯一属主**（0d.10-8「模块级 mutable 状态各归单域属主」）——别处要读，
 *   走该域导出的 accessor，不许直接摸槽。
 *
 * ⚠️ 槽按 `globalThis` 活，而池里**所有插件共用一份 realm** ⇒ key 必须带插件自己的命名空间
 *   （本文件硬编码 `marketplace`）。别改成裸 key。
 * ⚠️ **状态形状变了就换 key**（`"fooStore/v2"`），别原地改形状——插件升级后旧副本可能还在同一个 realm 里
 *   活着（模块图不随磁盘文件替换而重载），同槽两形状会互相毒化。
 * ⚠️ 测试：vitest 的 `vi.resetModules()` 只换模块实例、**不换 globalThis** ⇒ 槽会跨用例残留；
 *   `vitest.setup.ts` 每例前调 `__resetRealmSlots()` 复位（等价于模块单例时代「每例全新实例」）。
 *
 * 🏛️ 平台层正典（长期）：本 helper 是插件侧的地基实现；SDK 层「多表面共享模块提升为共享 chunk」或
 *   「SDK 提供同名原语」的正解另立案（壳仓 `docs/02-Electron架构/插件生态与发布/01-插件独立构建/
 *   12-多表面共享状态塌缩-立案.md`）。届时本文件整体换成 SDK 版，调用点不动。
 */

/** 槽注册表挂载名——带插件命名空间（同一 realm 里还有别的插件与壳自身的全局） */
const REGISTRY_KEY = "__linkdesk_pluginSlots__marketplace";

type SlotRegistry = Record<string, unknown>;

function registry(): SlotRegistry {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = {} as SlotRegistry;
  return g[REGISTRY_KEY] as SlotRegistry;
}

/** 取本 realm 的共享槽；首次调用（无论来自哪份表面副本）执行 `init` 建槽，之后一律拿同一份。
 *  `init` 必须同步、无重依赖（只在第一个到达的副本里跑一次）。 */
export function realmSlot<T>(key: string, init: () => T): T {
  const reg = registry();
  if (!(key in reg)) reg[key] = init();
  return reg[key] as T;
}

/** 测试专用：清空本插件全部槽——vitest.setup.ts 每例前调用；产线不调。 */
export function __resetRealmSlots(): void {
  delete (globalThis as unknown as Record<string, unknown>)[REGISTRY_KEY];
}
