/**
 * hostInstallConfirm — 壳托管安装/更新确认的**窄门面**（P1）。
 *
 * 为什么单独成文件：本仓 `@linkdesk/contracts` 的类型面按发布节奏走（当前 0.1.48），
 * 而壳侧的 `plugins.requestInstall` 面是本轮新发（contracts 0.1.53）——直接 `window.linkdesk.plugins.requestInstall`
 * 会 tsc 报不存在。照 `hostApi.ts` 的既有处置：**只收窄本仓要用到的面**、运行时缺面回落旧链、
 * ⛔ 不改依赖版本、⛔ 删功能。
 *
 * 🔴 回落判据（拍板）：`requestInstall` **存在就只走新链**——新壳把远程来源的旧链
 * `pluginManager.install/update` 一律拒（no-token）；先回落只会白撞一次红字。
 * 只有「老壳」（无该函数）才走市场自绘确认卡 + 旧链。
 *
 * 归一化：来源身份只在这里推导一次（`sourceIdentityOf`），⛔ 各调用点各拼一遍。
 */

import { urlSourceKey } from "@linkdesk/ui";
import i18n from "i18next";
import type { CatalogEntry } from "./marketCatalog";
import type { PluginConfirmViewPayload } from "@linkdesk/contracts";
import { notifyError } from "./marketplaceShared/notifications";

/** 壳侧 `PluginSourceIdentity`（contracts 0.1.53 同形；本仓类型面未跟进，故收窄一份） */
export interface HostSourceIdentity {
  id: string;
  url: string;
  repo?: string;
  publisher?: string;
}

/** 壳侧 `PluginInstallRequest`（同上，收窄本仓用到的字段） */
export interface HostInstallRequest {
  mode: "install" | "update";
  pluginId: string;
  version: string;
  downloadUrl: string;
  sha256?: string;
  source: HostSourceIdentity;
  display: {
    name: string;
    icon?: string;
    description?: string;
    changelogUrl?: string;
    size?: number;
  };
  allowOlder?: boolean;
  catalogUrl?: string;
  /** 目录条目声明的最低壳版本（壳会自己再判一次，不满足直接拦） */
  minAppVersion?: string;
}

interface ConfirmResult {
  confirmed?: boolean;
  /** 执行结果（confirmed 只表示「用户同意了」）——false = 没装成 */
  ok?: boolean;
  error?: string;
  cancelled?: boolean;
  reason?: string;
}

interface BatchResult {
  confirmed?: boolean;
  cancelled?: boolean;
}

/**
 * 计划过期提示（2026-11-25 用户拍板）：确认计划的句柄只活 5 分钟——用户把卡晾在那儿再点确认时，
 * 壳回 `unknown-plan`。此前被当成"取消"静默吞掉，用户会以为按钮坏了。这里统一说一句人话。
 */
function notifyPlanExpired(): void {
  void notifyError(i18n.t("确认已过期，请重新发起"));
}

/** 市场自绘卡的视图 id —— 与 `plugin.json` 的 `contributes.views.main` 同值（唯一登记处） */
export const MARKET_CONFIRM_VIEWS = {
  install: "marketplace-install-confirm",
  batch: "marketplace-update-batch",
} as const;

/** 两步确认第一跳的回执（壳 `prepareInstall` / `prepareUpdateBatch`） */
interface HostPrepared {
  planId: string;
  plan: { ask: unknown[] };
  view: PluginConfirmViewPayload;
  /** 壳指定这张卡该谁画（风险分档，2026-11-25 拍板）：host = 首装/来源变更/降级/未信任来源 */
  cardOwner?: "host" | "market";
}

/** 壳的两步确认面（D1′）——缺任何一个 ⇒ 走 `requestInstall` 快捷路径（契约保留的兜底） */
interface HostTwoStep {
  prepareInstall?(req: HostInstallRequest): Promise<HostPrepared>;
  prepareUpdateBatch?(reqs: HostInstallRequest[]): Promise<HostPrepared>;
  commitInstall?(planId: string): Promise<ConfirmResult>;
  discardInstall?(planId: string): Promise<void>;
}

/** 壳托管确认面（P1 新壳才有） */
export interface HostInstallConfirmApi {
  requestInstall(req: HostInstallRequest): Promise<ConfirmResult>;
  requestUpdateBatch(reqs: HostInstallRequest[]): Promise<BatchResult>;
}

/** 内容弹窗面（`dialog.confirmContent`）——没有它就没法自绘（壳面缺失 ⇒ 取消，安全方向） */
function confirmContentApi(): ((o: { pluginId: string; viewId: string; payload: unknown }) => Promise<boolean>) | null {
  const dlg = (window.linkdesk as unknown as { dialog?: { confirmContent?: unknown } } | undefined)?.dialog;
  return typeof dlg?.confirmContent === "function"
    ? (dlg.confirmContent as (o: { pluginId: string; viewId: string; payload: unknown }) => Promise<boolean>)
    : null;
}

/**
 * 弹**市场自绘卡**（壳提供对话框外壳：遮罩/居中/Esc/焦点锁；内容与按钮归市场）。
 * 返回 true = 用户确认；false = 取消/关闭/无法弹。
 */
async function showMarketCard(view: PluginConfirmViewPayload): Promise<boolean> {
  const confirmContent = confirmContentApi();
  if (!confirmContent) return false;
  try {
    return await confirmContent({ pluginId: "marketplace", viewId: MARKET_CONFIRM_VIEWS[view.kind], payload: view });
  } catch {
    return false; // 内容槽解析失败 → 当取消（⛔ 当成功是灾难）
  }
}

/**
 * 取壳托管确认面——**形状守卫必须核对象**：dev 宿主的契约 Proxy 对树外路径返回 call-stub 函数
 * （不是对象），只判 `!== undefined` 会让 null 检查通过、当场抛（照 hostApi.ts 的同款教训）。
 *
 * 🔴 2026-11-25（D8′）：`requestInstall`/`requestUpdateBatch` 现在是**编排**——
 *   有 `prepare*`/`commit*` ⇒ 先要计划，**需要确认时弹市场自绘卡**（VIEW = 共享件），再 `commit`；
 *   没有两步面 ⇒ 走壳的 `requestInstall` 快捷路径（壳画默认卡）。
 *   判定/令牌/执行仍在壳；市场只决定「怎么画」。调用方一行都不用改（单一入口）。
 */
export function installConfirmApi(): HostInstallConfirmApi | null {
  const lk = window.linkdesk as unknown as { plugins?: unknown } | undefined;
  const plugins = lk?.plugins;
  if (!plugins || typeof plugins !== "object") return null;
  const candidate = plugins as Partial<HostInstallConfirmApi> & HostTwoStep;
  if (typeof candidate.requestInstall !== "function") return null;

  // 两步面按**kind 分别**判定：单项要 prepareInstall，批量要 prepareUpdateBatch（缺哪个就只回落那一条）
  const hasCommit = typeof candidate.commitInstall === "function";
  const canPrepare = hasCommit && typeof candidate.prepareInstall === "function";
  const canPrepareBatch = hasCommit && typeof candidate.prepareUpdateBatch === "function";

  return {
    requestInstall: async (req) => {
      if (!canPrepare) return candidate.requestInstall!(req); // 壳无两步面 ⇒ 快捷路径（壳画卡）
      const prepared = await candidate.prepareInstall!(req);
      /* 高风险 ⇒ 壳画（壳的默认卡才能保证用户看到的内容有壳背书）。市场在这里让路，⛔ 不硬画。 */
      if (prepared.cardOwner === "host") {
        await candidate.discardInstall?.(prepared.planId);
        return candidate.requestInstall!(req);
      }
      if (prepared.plan.ask.length > 0) {
        const ok = await showMarketCard(prepared.view);
        if (!ok) {
          await candidate.discardInstall?.(prepared.planId);
          return { confirmed: false, cancelled: true };
        }
      }
      const done = await candidate.commitInstall!(prepared.planId);
      if (done?.reason === "unknown-plan") notifyPlanExpired();
      return done;
    },
    requestUpdateBatch: async (reqs) => {
      if (canPrepareBatch) {
        const prepared = await candidate.prepareUpdateBatch!(reqs);
        if (prepared.cardOwner === "host") {
          await candidate.discardInstall?.(prepared.planId);
          return typeof candidate.requestUpdateBatch === "function"
            ? candidate.requestUpdateBatch.bind(plugins)(reqs)
            : { confirmed: false, cancelled: true };
        }
        if (prepared.plan.ask.length > 0) {
          const ok = await showMarketCard(prepared.view);
          if (!ok) {
            await candidate.discardInstall?.(prepared.planId);
            return { confirmed: false, cancelled: true };
          }
        }
        const r = await candidate.commitInstall!(prepared.planId);
        if (r?.reason === "unknown-plan") notifyPlanExpired();
        return { confirmed: r.confirmed, cancelled: r.cancelled };
      }
      // 批量面缺失 ⇒ 逐条走单项面（逐条问 = 老行为，⛔ 不静默放弃）
      if (typeof candidate.requestUpdateBatch === "function") return candidate.requestUpdateBatch.bind(plugins)(reqs);
      for (const req of reqs) {
        const r = await candidate.requestInstall!(req);
        if (!r?.confirmed) return { confirmed: false, cancelled: r?.cancelled };
      }
      return { confirmed: true };
    },
  };
}

/** 发布者显示名——author 两种形态（{name,url} / string）的唯一归一 */
export function publisherOf(entry: CatalogEntry): string | undefined {
  const a = entry.author;
  if (!a) return undefined;
  if (typeof a === "string") return a;
  return a.name || undefined;
}

/**
 * 来源身份——**本仓唯一推导点**。
 * `official: true`（合并期注入） ⇒ 固定 id `official`（与壳的 OFFICIAL_SOURCE_ID 同值）；
 * 其余用 来源仓库名（owner/repo）当 id（稳定、可读），缺省退到源 URL。
 */
export function sourceIdentityOf(entry: CatalogEntry): HostSourceIdentity {
  const url = entry.sourceUrl ?? "";
  if (entry.official) {
    return { id: "official", url, repo: entry.sourceName, publisher: publisherOf(entry) };
  }
  /**
   * 🔴 来源 id **必须**与「设置里那本信任清单」同一个词（2026-11-24 实机：信任了 A 却按 B 判定 ⇒ 开关永远无效）。
   * 统一用 `urlSourceKey`（`owner/repo`，小写）——它是市场加源去重、设置 StringListEditor 去重共用的那把钥匙；
   * 拿 `sourceName`（只有仓库名、没有 owner）或自造短名都会造出第二套词。
   */
  return {
    id: urlSourceKey(url) ?? entry.sourceName ?? url ?? "unknown",
    url,
    repo: entry.sourceName,
    publisher: publisherOf(entry),
  };
}

/**
 * 目录条目 + 版本 → 壳请求。
 * @param downloadUrl 实际下载地址（版本级地址由调用方解析，⛔ 这里不猜）
 */
export function buildInstallRequest(
  entry: CatalogEntry,
  mode: "install" | "update",
  downloadUrl: string,
  opts?: { version?: string; allowOlder?: boolean; changelogUrl?: string },
): HostInstallRequest {
  return {
    mode,
    pluginId: entry.id,
    version: opts?.version ?? entry.version,
    downloadUrl,
    // P1（spec §七）：校验和按**目标版本**从版本历史里取——壳在下载落盘后立刻校验，
    // 不符即删包拒装。旧条目没有该字段 ⇒ 传 undefined（壳标「未提供校验值」，过渡期不阻断）。
    sha256: versionSha256Of(entry, opts?.version ?? entry.version),
    source: sourceIdentityOf(entry),
    display: {
      name: entry.name,
      // 展示图优先（市场身份图口径：marketIcon → icon），壳只当字符串用
      icon: entry.marketIcon ?? entry.icon,
      description: entry.description,
      changelogUrl: opts?.changelogUrl,
      size: entry.size,
    },
    allowOlder: opts?.allowOlder,
    // 🔴 依赖自动安装要用目录源（壳在同一 job 内按它解析 requires）——旧链一直传，切新链时漏了 = 依赖装不上
    catalogUrl: entry.sourceUrl,
    // 最低壳版本照抄目录条目——壳会自己再判一次（不满足直接拦，不弹卡）
    minAppVersion: entry.minAppVersion,
  };
}

/** 目标版本的 sha256——查版本历史；查不到返回 undefined（⛔ 不拿别的版本的哈希凑数） */
export function versionSha256Of(entry: CatalogEntry, version: string): string | undefined {
  const hit = entry.versions?.find((v) => v.version === version);
  return hit?.sha256;
}
