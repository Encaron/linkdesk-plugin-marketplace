/**
 * statusTag — 单角标状态机的**唯一判定源**（蓝图 v3.65 `statusTag(e)` 的 R4 落位；08 §二·单角标状态机）。
 *
 * 优先级（用户拍板原序，⛔ 不改）：
 *   已停用 ＞ 许可过期 ＞ 有更新 ＞ 订阅临期 ＞ 剩 N 天 ＞ 已安装 ＞ 已购(永久) ＞ 订阅价 ＞ 买断价 ＞ 免费
 * 主面永远只显**当前最要紧的一个词**；全量徽标只许出现在 hover 层与详情（徽标分层 v3.64d）。
 *
 * 纯函数、零 i18n 依赖：返回 `{ key, params?, kind }`，由消费方 `t(key, params)`——⛔ 本模块不出中文。
 */

import type { CatalogEntry } from "../services/marketCatalog";
import type { PackageState } from "../services/catalogStatus";

/** 角标视觉系（08 §二·v3.65b：实底系 paid/update/expired/soon；纯字系 installed/free） */
export type CornerKind = "paid" | "update" | "expired" | "soon" | "installed" | "free";

/** 条目授权态（壳 licenses.list() 的展示投影） */
export interface LicenseView {
  /** 载荷 exp（unix 秒）；undefined = 永久 */
  exp?: number;
}

/** statusTag 输入上下文——state 来自唯一状态推导层（services/catalogStatus），license 来自壳权益面 */
export interface StatusContext {
  state: PackageState;
  license?: LicenseView | null;
  /** 当前时刻（测试注入；缺省 Date.now） */
  now?: number;
}

export interface StatusTag {
  key: string;
  params?: Record<string, string | number>;
  kind: CornerKind;
  /** 卡片两行呈现（付费价）：模型词与金额分开——金额**永远完整显示**（⛔ 截价格）。
   *  仅 `stacked` 角标消费；其余消费方仍用 `key/params` 的整句。 */
  modelKey?: string;
  amount?: { key: string; params?: Record<string, string | number> };
}

/** 许可剩余天数（向上取整；已过期 = 负数）；undefined = 永久/无 exp */
export function licenseDaysLeft(license: LicenseView | null | undefined, now = Date.now()): number | undefined {
  if (!license || typeof license.exp !== "number") return undefined;
  return Math.ceil((license.exp * 1000 - now) / 86_400_000);
}

/** 是否收费（买断/订阅都算——09 §三·补3「收费域」） */
export function isPaid(entry: Pick<CatalogEntry, "pricing">): boolean {
  return !!entry.pricing;
}

/**
 * 单角标判定——九级优先级逐条短路。
 * 注意：`state === "update"` 已由状态层把「已装 + 有新版」合成为一个状态（sidebar 同款 updateTargetFor 判据）。
 */
export function statusTag(entry: Pick<CatalogEntry, "pricing">, ctx: StatusContext): StatusTag {
  const { state, license } = ctx;
  const now = ctx.now ?? Date.now();
  const days = licenseDaysLeft(license, now);

  if (state === "disabled") return { key: "已停用", kind: "installed" };
  if (days !== undefined && days < 0) return { key: "许可过期", kind: "expired" };
  if (state === "update") return { key: "有更新", kind: "update" };

  const pricing = entry.pricing;
  if (pricing?.model === "subscription" && days !== undefined) {
    return { key: "订阅剩 {{days}} 天", params: { days }, kind: "soon" };
  }
  if (days !== undefined && days <= 30) return { key: "剩 {{days}} 天", params: { days }, kind: "soon" };
  if (state === "installed") return { key: "已安装", kind: "installed" };

  const owned = !!pricing && !!license && days === undefined;
  if (owned) return { key: "已购", kind: "installed" };

  if (pricing) {
    if (pricing.model === "subscription") {
      const params = {
        currency: pricing.currency ?? "¥",
        price: pricing.price ?? 0,
        period: pricing.period ?? "月",
      };
      return {
        key: "订阅 {{currency}}{{price}}/{{period}}",
        params,
        kind: "paid",
        modelKey: "订阅",
        amount: { key: "{{currency}}{{price}}/{{period}}", params },
      };
    }
    const params = { currency: pricing.currency ?? "¥", price: pricing.price ?? 0 };
    return {
      key: "买断 {{currency}}{{price}}",
      params,
      kind: "paid",
      modelKey: "买断",
      amount: { key: "{{currency}}{{price}}", params },
    };
  }
  return { key: "免费", kind: "free" };
}

/* ═══ 全量徽标行（hover 层 / 详情 —— 同源一处渲染，仅密度分层） ═══ */

/** 徽标种类（蓝图 `.badge.*` 十类 + muted 兜底；muted 视觉同 core） */
export type BadgeKind =
  | "official"
  | "third"
  | "local"
  | "core"
  | "price"
  | "soon"
  | "expired"
  | "owned"
  | "installed"
  | "update"
  | "fail"
  | "muted";

export interface BadgeDesc {
  kind: BadgeKind;
  key: string;
  params?: Record<string, string | number>;
}

/** 来源身份（05 §二·① 与 09 §一·补2 的展示合成）：
 *   vendorId 命中注册表 → 官方 ✓（发布者身份）；官方目录条目 → 官方（分发事实）；其余 → 社区。
 *   ⛔ 不按作者名猜、⛔ 不开放作者自声明徽标文本。 */
export function sourceKind(entry: Pick<CatalogEntry, "official" | "vendorId">): "official" | "third" {
  return entry.vendorId || entry.official ? "official" : "third";
}

export function sourceBadge(entry: Pick<CatalogEntry, "official" | "vendorId">): BadgeDesc {
  return entry.vendorId
    ? { kind: "official", key: "官方 ✓" }
    : sourceKind(entry) === "official"
      ? { kind: "official", key: "官方" }
      : { kind: "third", key: "社区" };
}

/** 价格徽标（单条）——买断/订阅价；⛔ 只由下面两个许可函数调用，避免第三份取字。 */
function priceBadgeOf(entry: Pick<CatalogEntry, "pricing">): BadgeDesc {
  const p = entry.pricing!;
  return p.model === "subscription"
    ? {
        kind: "price",
        key: "订阅 {{currency}}{{price}}/{{period}}",
        params: { currency: p.currency ?? "¥", price: p.price ?? 0, period: p.period ?? "月" },
      }
    : {
        kind: "price",
        key: "买断 {{currency}}{{price}}",
        params: { currency: p.currency ?? "¥", price: p.price ?? 0 },
      };
}

/**
 * **单徽标位**的许可徽标（库行 / 「已购未安装」行等一次只画一枚的位置）——
 * 优先级照蓝图 licBadge：过期 ＞ 临期 ＞ 已购 ＞ 价格。
 * 🔴 单徽标位 ⛔ 不许拿 `licenseBadges()[0]`：那是**多徽标行**（临期时是 [价格, 到期天数]），
 *    第一项是价格，会把「剩 N 天」画成价格（2026-11-22 用户抓漏）。
 * 临期文案与卡面 `statusTag` 同口径：订阅「订阅剩 N 天」/ 买断「剩 N 天」。
 */
export function licenseBadgeOf(
  entry: Pick<CatalogEntry, "pricing">,
  license: LicenseView | null | undefined,
  now = Date.now(),
): BadgeDesc | null {
  if (!isPaid(entry)) return null;
  const days = licenseDaysLeft(license, now);
  if (days !== undefined && days < 0) return { kind: "expired", key: "许可已过期" };
  if (days !== undefined && days <= 30) {
    return entry.pricing!.model === "subscription"
      ? { kind: "soon", key: "订阅剩 {{days}} 天", params: { days } }
      : { kind: "soon", key: "剩 {{days}} 天", params: { days } };
  }
  if (license) return { kind: "owned", key: "已购 ✓" };
  return priceBadgeOf(entry);
}

/** 许可徽标**多枚行**（详情头部 / 全量徽标：过期 ＞ 临期[价格＋天数] ＞ 已购 ＞ 价格；⛔ 静默降级）。
 *  单徽标位请用 `licenseBadgeOf()`。 */
export function licenseBadges(
  entry: Pick<CatalogEntry, "pricing">,
  license: LicenseView | null | undefined,
  now = Date.now(),
): BadgeDesc[] {
  if (!isPaid(entry)) return [];
  const days = licenseDaysLeft(license, now);
  const price = priceBadgeOf(entry);
  if (days !== undefined && days < 0) return [{ kind: "expired", key: "许可已过期" }];
  if (days !== undefined && days <= 30) {
    return [price, { kind: "soon", key: "{{days}} 天后到期", params: { days } }];
  }
  if (license) return [{ kind: "owned", key: "已购 ✓" }];
  return [price];
}

/** 全量徽标行（顺序照蓝图 badges()：已安装 → 已禁用 → 有更新 → 内置 → 许可 → 来源） */
export function allBadges(
  entry: Pick<CatalogEntry, "pricing" | "official" | "vendorId">,
  ctx: { state: PackageState; essential?: boolean; license?: LicenseView | null; now?: number },
): BadgeDesc[] {
  const out: BadgeDesc[] = [];
  if (ctx.state === "installed") out.push({ kind: "installed", key: "已安装" });
  if (ctx.state === "disabled") out.push({ kind: "muted", key: "已禁用" });
  if (ctx.state === "update") out.push({ kind: "update", key: "有更新" });
  if (ctx.essential) out.push({ kind: "core", key: "内置" });
  out.push(...licenseBadges(entry, ctx.license, ctx.now));
  out.push(sourceBadge(entry));
  return out;
}
