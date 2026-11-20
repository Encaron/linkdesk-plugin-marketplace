/**
 * types — 目录运行时拉取域的数据形状。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketSources.ts` 原样搬出，零行为变更。
 */

import type {
  CatalogEntry,
  CatalogWarning,
  CollectionDecl,
  MergeConflict,
} from "../marketCatalog";

export type CatalogLoadState = "ok" | "corrupt" | "offline";

/** 源记录（09 §十「源记录（数据层）」——配置键 `marketplace.marketplaceSources` 的形状）。
 *  R4-2.1 升级读侧：旧 `string` / `{url}` 两形态照读（`normalizeSourceRecord` 归一），升级只加字段不改键。
 *  ⚠️ 写侧升级（来源管理页落盘）属棒 8——本棒只保证旧形态照读、新形态可读。 */
export interface SourceRecord {
  kind: "remote" | "local";
  /** remote 的源 URL（原始形态：用户粘的主页/直链原样；归一在拉取时做） */
  url?: string;
  /** local 的落点（复制安装的溯源路径——不参与远程拉取） */
  path?: string;
  /** 作者聚合键（GitHub owner；本地 = "__local"） */
  authorId: string;
  /** 仓库 id（GitHub repo；本地 = 目录名） */
  repoId: string;
  /** 源级停用（enabled=false ⇒ 不拉取、不出条目；记录仍留在来源页） */
  enabled: boolean;
  /** 上次拉取结果（来源页诊断用；本棒只读，写回属棒 8） */
  status: "ok" | "error" | "unknown";
  /** 上次成功拉取时刻（ms；无 = undefined） */
  fetchedAt?: number;
}

export interface CatalogLoadResult {
  entries: CatalogEntry[];
  state: CatalogLoadState;
  /** 单源彻底失败明细（{sourceName, reason}）——错误行展示/诊断不吞 */
  errors: Array<{ sourceName: string; reason: string }>;
  /** 当前在用的源名（官方 + 配置作者源）——条目来源标注、空态诊断展示 */
  sourceNames: string[];
  /** 是否有源走了降级 stale 缓存（网络失败/坏 parse 兜底，非 5min fresh 命中） */
  usedStale: boolean;
  /** 拉取时刻——「最后更新 x 前」展示 */
  fetchedAt: number;
  /** v2（R4-2.1/2.2）：rail 顺序 = 官方目录声明消费结果（未注册 slug 已滤除、`other` 恒末位） */
  railOrder: string[];
  /** v2：合集声明（官方 + 作者源合并，同 id 先到者胜；无声明 = 空数组） */
  collections: CollectionDecl[];
  /** v2：声明警告（条目级/根级，⛔ 不静默吞）——来源页「N 条声明提示」数据源 */
  warnings: CatalogWarning[];
  /** v2：同 id 多源冲突回执（诊断用；不改变「版本高者胜、平手先到者胜」规则） */
  deduped: MergeConflict[];
}

/** 目录 IO 注入点类型（jsdom 测试替换） */
export type FetchFn = (url: string) => Promise<string>;
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

/** 单源结果——text = 已通过 parse 校验的交付物（实时或缓存）；reason = 彻底失败原因（无缓存可兜）。
 *  official：该源即官方默认源（E6#30.8f——官方身份与拉取 URL 同源判定，缓存/网络路径一致携带） */
export type SourceResult =
  | { sourceName: string; official: boolean; text: string; fresh: boolean; staleFallback: boolean }
  | { sourceName: string; official: boolean; reason: "network" | "parse" };

/** 侧车文件（vendors.json / plugin.json）拉取结果——与目录源分开：不参与主状态判定。
 *  missing = HTTP 404（K5 回落链据它给「未找到 marketplace.json / plugin.json」文案）。 */
export type SidecarResult = { ok: true; text: string } | { ok: false; reason: "network" | "missing" };
