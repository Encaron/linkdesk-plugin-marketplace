/**
 * ActionButton — 动作钮的**唯一判定与渲染件**（蓝图 `actionBtn(e)` 的 R4 落位；10 §一「ActionButton」）。
 *
 * 三段式契约（05 §三）：`resolveAction()` 纯判定该条目此刻该显示哪个动作/什么状态；
 * 本件只画；执行器由页面注入（`onAct`）——卡片永远蠢，业务动作全走 services 单一入口。
 *
 * 付费分支的裁决纪律（05 §三·4）：本件**只渲染状态**，不判断能不能装（壳安装门才是墙）。
 * 未购不给灰安装钮；作者未声明 licenseUrl 就不渲染外跳钮（08 §二·v3.64b）。
 */

import { useTranslation } from "react-i18next";
import type { CatalogEntry } from "../services/marketCatalog";
import type { PackageState } from "../services/catalogStatus";
import type { InstallJob } from "../services/installJobs";
import { Icon, type IconName } from "./icons";
import { isPaid, licenseDaysLeft, type LicenseView } from "./statusTag";

export type ActionId =
  | "open"
  | "install"
  | "update"
  | "retry"
  | "cancel"
  | "enable"
  | "disable"
  | "uninstall"
  | "buy"
  | "renew"
  | "have-key";

export interface ResolvedAction {
  id: ActionId;
  /** i18n key（中文原文） */
  labelKey: string;
  params?: Record<string, string | number>;
  kind: "primary" | "secondary" | "danger";
  icon?: IconName;
  disabled?: boolean;
  /** 置灰原因（悬停提示的 i18n key） */
  titleKey?: string;
  /** 进行中（spinner） */
  busy?: boolean;
}

export interface ActionContext {
  state: PackageState;
  online: boolean;
  core?: boolean;
  license?: LicenseView | null;
  /** 本插件当前 job（进度的唯一出处 = 壳 job 表） */
  job?: Pick<InstallJob, "state" | "terminal" | "stage" | "percent"> | null;
  /** 已 t() 的安装阶段短句（job 在跑时显示；缺省退「安装中」） */
  jobLabel?: string;
  /** 当前时刻（测试注入） */
  now?: number;
}

const price = (entry: CatalogEntry): string => {
  const p = entry.pricing!;
  return `${p.currency ?? "¥"}${p.price ?? 0}`;
};

/**
 * 动作判定（纯函数）。优先级照蓝图 `actionBtn`：
 *   付费域（订阅 → 即将支持；买断 → 许可分支）→ 禁用 → 安装中/排队/失败 → 已装(更新/已装) → 未装(安装)。
 */
export function resolveAction(entry: CatalogEntry, ctx: ActionContext): ResolvedAction {
  const pricing = entry.pricing;
  const days = licenseDaysLeft(ctx.license, ctx.now ?? Date.now());

  /* ── 付费域（isPaid = 买断与订阅都算；订阅 v1 不可购——B3 前「即将支持」） ── */
  if (isPaid(entry)) {
    if (pricing?.model === "subscription") {
      return {
        id: "install",
        labelKey: "即将支持",
        kind: "primary",
        disabled: true,
        titleKey: "订阅需服务器实时校验——B3 上线后开放",
      };
    }
    if (days !== undefined && days < 0) {
      return {
        id: "have-key",
        labelKey: "输入新密钥",
        kind: "primary",
        titleKey: "当前许可已过期——输入作者续费后发你的新密钥",
      };
    }
    if (!ctx.license) {
      // 作者声明了销售页才渲染外跳钮（⛔ 弹不弹作者说了算）
      if (pricing?.licenseUrl) {
        return {
          id: "buy",
          labelKey: "获取许可 {{price}}",
          params: { price: price(entry) },
          kind: "primary",
          titleKey: "作者声明了销售页——真机 shell.openExternal 弹到系统浏览器",
        };
      }
      return {
        id: "have-key",
        labelKey: "我有密钥",
        kind: "secondary",
        titleKey: "已有密钥？粘贴即可验证",
      };
    }
    // 有有效权益 → 继续走安装/已装分支（付费不改变安装语义）
  }

  if (ctx.state === "disabled") {
    return { id: "enable", labelKey: "启用", kind: "secondary" };
  }

  const job = ctx.job;
  if (job?.state === "running") {
    return {
      id: "cancel",
      labelKey: "安装中 {{label}}",
      params: { label: ctx.jobLabel ?? "" },
      kind: "primary",
      busy: true,
      disabled: true,
    };
  }
  if (job?.state === "queued") {
    return { id: "cancel", labelKey: "等待安装中", kind: "secondary", busy: true, disabled: true };
  }
  if (job?.state === "settled" && job.terminal === "failed") {
    return { id: "retry", labelKey: "重试", kind: "primary", icon: "refresh" };
  }

  if (ctx.state === "update") {
    return { id: "update", labelKey: "更新", kind: "primary" };
  }
  if (ctx.state === "installed") {
    return { id: "install", labelKey: "已安装", kind: "secondary", disabled: true };
  }
  if (!ctx.online) {
    return {
      id: "install",
      labelKey: "安装",
      kind: "secondary",
      disabled: true,
      titleKey: "联网后重试",
    };
  }
  return { id: "install", labelKey: "安装", kind: "primary", icon: "download" };
}

/* ═══ ⋯ 菜单（五卡同构；项随装态——未装不出现禁用） ═══ */

export interface MoreItem {
  id: ActionId;
  labelKey: string;
  danger?: boolean;
  disabled?: boolean;
  titleKey?: string;
  /** 该项前加分隔线（破坏动作前的一条） */
  sepBefore?: boolean;
}

/** 菜单项推导（纯函数；蓝图 `moreMenu(e)` 同构）——卸载 ⛔ 卡面主位，只在菜单里 */
export function moreMenuItems(entry: CatalogEntry, ctx: Pick<ActionContext, "state" | "core">): MoreItem[] {
  const items: MoreItem[] = [{ id: "open", labelKey: "查看详情" }];
  if (ctx.state === "disabled") items.push({ id: "enable", labelKey: "启用" });
  else if (ctx.state === "installed" || ctx.state === "update") items.push({ id: "disable", labelKey: "禁用" });

  const installed = ctx.state === "installed" || ctx.state === "update" || ctx.state === "disabled";
  const uninstallDisabled = !installed || !!ctx.core;
  items.push({
    id: "uninstall",
    labelKey: "卸载…",
    danger: true,
    sepBefore: true,
    disabled: uninstallDisabled,
    titleKey: ctx.core ? "内置插件不提供卸载按钮" : !installed ? "未安装，无可卸载内容" : undefined,
  });
  return items;
}

/* ═══ 渲染件 ═══ */

export function ActionButton({
  action,
  onAct,
  className,
}: {
  action: ResolvedAction;
  /** 执行器（页面注入——同一动作只有一个服务入口） */
  onAct: (id: ActionId) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t(action.labelKey, action.params);
  return (
    <button
      type="button"
      className={`marketplace-ui-btn is-${action.kind} ${className ?? ""}`.trim()}
      disabled={action.disabled}
      data-hint={action.titleKey ? t(action.titleKey) : undefined}
      aria-busy={action.busy || undefined}
      onClick={(e) => {
        // 卡面动作钮阻断整卡点击（整卡＝开详情）
        e.stopPropagation();
        onAct(action.id);
      }}
    >
      {action.busy ? <span className="marketplace-ui-spin" aria-hidden="true" /> : action.icon ? <Icon name={action.icon} size="sm" /> : null}
      <span className="marketplace-ui-btn-label">{label}</span>
    </button>
  );
}

export default ActionButton;
