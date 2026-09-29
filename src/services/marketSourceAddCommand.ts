/**
 * marketSourceAddCommand — 「添加市场源」的命令面（M2 生长格 `AI#56`）。
 *
 * ## 补的是哪条唯一鼠标路径
 *
 * `SearchView` 动作行的「市场源」钮 → `AddSourcePopup` 弹窗里粘 URL → 提交。**加源只有这一条路**
 * （开弹窗要按钮，提交要按弹窗里的钮）⇒ 命令面板与外部 AI（CLI/MCP）都够不着
 * 「把某个作者仓库加进来」——而这件事本身就是一条 URL，正该有非鼠标路径。
 *
 * ## 与弹窗同一条写路径（⛔ 不是第二套判重）
 *
 * 读现作者源（`readConfiguredAuthorSources`）→ **纯决策单点**（`decideAddSource`——官方恒不入册、
 * 同身份判重都在它里面）→ ok 才 `configuration.set("marketplace.marketplaceSources", next)`。
 * 弹窗与本命令共用这三步，本文件只多一层「回执」。落盘后照旧由既有 config watch 自动
 * `forceRefreshCatalog`（几秒内该源插件上架）——⛔ 本命令自己不拉目录、不缓存。
 *
 * ## 回执三态（照 `AI#55`/`AI#60` 立下的口径：`ok` 不等于「做到了」）
 *
 * - **加上了**：`{ ok: true, added }`——`added` = 实际落盘的那份**原始形态**（决策不归一：仓库主页
 *   保持主页，与读边界「原始形态只此一份落盘」同约定）。
 * - **调用成立、但没有变化**：`{ ok: true, noop: true, reason }`——`official`（官方源恒内置，
 *   任何形态都不入册）· `duplicate`（同身份已在列表）。
 * - **调用本身不成立**：`{ ok: false, noop: true, reason }`——`empty`（没给 URL）·
 *   `bad-url`（归一失败：非 http(s) 或非 github 形态）。
 *
 * 写盘失败**大声抛**（⛔ 不回假 ok）：`configuration` 写入面缺失或 `set` 抛错 ⇒ 异常上抛，`exec`
 * 侧如实报失败——「什么都没发生」比报错更难查（与 `settings.editKeybinding` 同口径）。
 *
 * ⚠️ 元数据（`title`/`description`/`params`）只写在 `plugin.json` 的 `contributes.commands[]`——
 * 本仓其余五条命令的运行期注册也只带 `title`；池侧重注册不带 `description`/`params` 时，
 * 壳注册表**不会**抹掉声明面那份（`CommandRegistry.registerPoolCommandMetadata` 的「有值才覆盖」）。
 */

import { decideAddSource, type AddSourceRejectReason } from "./marketSourceAdd";
import { readConfiguredAuthorSources } from "./marketSources";

/** 作者源数组的配置键——真相源 = 本仓 `plugin.json` 的 `contributes.configuration` 同名键 */
const CONFIG_KEY = "marketplace.marketplaceSources";

export interface AddSourceResult {
  /** 调用是否成立（⛔ 不代表「加上了」——加了看 `added`，没变看 `noop` ＋ `reason`） */
  ok: boolean;
  noop?: true;
  reason?: AddSourceRejectReason;
  /** 实际落盘的那份原始形态（trim 后；只在真加上时在） */
  added?: string;
}

/** 两种调用形：位置形（一串 URL）或具名对象形（`{ url }`——参数只有一条 ⇒ 壳不展开，对象原样进来） */
export type AddSourceArgs = string | { url?: string } | undefined;

/**
 * 命令 handler——读现作者源 → 纯决策 → ok 才落盘。
 * @throws `configuration` 写入面不可用 / `set` 抛错（⛔ 不吞成假 ok）
 */
export async function runAddSource(args?: AddSourceArgs): Promise<AddSourceResult> {
  const raw = typeof args === "string" ? args : (args?.url ?? "");
  const decision = decideAddSource(raw, await readConfiguredAuthorSources());
  if (!decision.ok) {
    // empty / bad-url = 调用本身不成立；official / duplicate = 调用成立但状态没变（判据在 decideAddSource）
    return decision.reason === "empty" || decision.reason === "bad-url"
      ? { ok: false, noop: true, reason: decision.reason }
      : { ok: true, noop: true, reason: decision.reason };
  }
  const cfg = window.linkdesk?.configuration;
  if (!cfg?.set) throw new Error("配置写入面不可用（window.linkdesk.configuration.set）——加源未落盘");
  await cfg.set(CONFIG_KEY, decision.next);
  return { ok: true, added: raw.trim() };
}

/**
 * 注册命令。入口模块链顶层调用（`marketplaceShared/commands.ts` 的 `ensureMarketplaceCommands`）——
 * 无视图时外部 AI 经 `exec` 打进来，靠池的 on-command 激活 `import()` 本插件入口
 * ⇒ 顶层副作用才是唯一注册时机（`settings.editKeybinding` 同款先例）。
 * @returns 注册成功的条数（0 = `window.linkdesk.commands` 不可用）
 */
export function registerMarketSourceAddCommand(): number {
  const reg = window.linkdesk?.commands?.registerCommand;
  if (!reg) return 0;
  reg("marketplace.addSource", async (args?: AddSourceArgs) => runAddSource(args), { title: "添加市场源" });
  return 1;
}
