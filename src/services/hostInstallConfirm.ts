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

import type { CatalogEntry } from "./marketCatalog";

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
}

interface ConfirmResult {
  confirmed?: boolean;
  cancelled?: boolean;
  reason?: string;
}

interface BatchResult {
  confirmed?: boolean;
  cancelled?: boolean;
  jobIds?: string[];
}

/** 壳托管确认面（P1 新壳才有） */
export interface HostInstallConfirmApi {
  requestInstall(req: HostInstallRequest): Promise<ConfirmResult>;
  requestUpdateBatch(reqs: HostInstallRequest[]): Promise<BatchResult>;
}

/**
 * 取壳托管确认面——**形状守卫必须核对象**：dev 宿主的契约 Proxy 对树外路径返回 call-stub 函数
 * （不是对象），只判 `!== undefined` 会让 null 检查通过、当场抛（照 hostApi.ts 的同款教训）。
 */
export function installConfirmApi(): HostInstallConfirmApi | null {
  const lk = window.linkdesk as unknown as { plugins?: unknown } | undefined;
  const plugins = lk?.plugins;
  if (!plugins || typeof plugins !== "object") return null;
  const candidate = plugins as Partial<HostInstallConfirmApi>;
  if (typeof candidate.requestInstall !== "function") return null;
  // 批量面缺失时用单项面兜底（逐条问 = 老行为，⛔ 不静默放弃）
  return {
    requestInstall: candidate.requestInstall.bind(plugins),
    requestUpdateBatch:
      typeof candidate.requestUpdateBatch === "function"
        ? candidate.requestUpdateBatch.bind(plugins)
        : async (reqs) => {
            for (const req of reqs) {
              const r = await candidate.requestInstall!(req);
              if (!r?.confirmed) return { confirmed: false, cancelled: r?.cancelled, jobIds: [] };
            }
            return { confirmed: true, jobIds: [] };
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
  return {
    id: entry.sourceName || entry.sourceUrl || "unknown",
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
    // P1 过渡期：目录条目还没有 sha256（kit 0.1.8 起 publish 才写），缺省 = 壳标「未校验」不阻断
    sha256: undefined,
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
  };
}
