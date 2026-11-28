/**
 * DetailActionBar——详情页头部右上动作列（`.marketplace-mpd-acts`）：row1 主钮（三态分支）+ row2 版本偏好副控制。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 的 `<div className="marketplace-mpd-acts">` 段
 * 原样搬出，零行为变更。
 *
 * 三分支判据由调用方算好传入（`disabledRow` / `pending` / `hasInfo`，顺序即优先级）；五个「小件」
 * （版本下拉 / 安装下拉 / 版本动作钮 / 自动更新勾 / 「已停在 vX」说明件）由 `actionBits` 构造后传入。
 * 本件零业务判断，只有版式。
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@linkdesk/ui";
import { licenseDaysLeft, type LicenseView } from "../../../ui";
import type { PricingDecl } from "../../../services/marketCatalog";

export default function DetailActionBar({
  disabledRow,
  pending,
  pendingReason,
  hasInfo,
  isEssential,
  online,
  belowMinApp,
  minAppVersion,
  busy,
  updating,
  installingHere,
  queuedHere,
  uninstallingHere,
  installFailed,
  installLabel,
  installMessage,
  versionPicker,
  installPicker,
  actButton,
  autoUpdateToggle,
  pinnedNote,
  pricing,
  license,
  onBuy,
  onHaveKey,
  onRenew,
  onEnable,
  onDisable,
  onUninstall,
  onInstallClick,
  onRetryInstall,
}: {
  /** 禁用态分支（已装但被禁用） */
  disabledRow: boolean;
  /** 挂起态分支（已装但依赖未就绪） */
  pending: boolean;
  pendingReason?: string;
  /** 已装且非挂起分支（= 调用方的 `info` 为真） */
  hasInfo: boolean;
  isEssential: boolean;
  online: boolean;
  /** R4-3.18「不够」：当前壳 < 条目要求的 minAppVersion——行保留标黄，安装/重试钮置灰并给出原因（05 §02/§07 D3） */
  belowMinApp?: boolean;
  /** 需 LinkDesk 的最低版本（与禁钮 title 同源；缺 = 不禁） */
  minAppVersion?: string;
  /** R4-3.20 付费六态：条目定价声明（undefined = 免费）——判定与卡片 `resolveAction` 同构（05 §05 四态矩阵） */
  pricing?: PricingDecl;
  /** R4-3.20：壳权益投影（undefined/null = 未购） */
  license?: LicenseView | null;
  /** 付费动作（购买/密钥/续费——执行器在门面，与本条 actions 同一条入口纪律） */
  onBuy?: () => void;
  onHaveKey?: () => void;
  onRenew?: () => void;
  busy: boolean;
  updating: boolean;
  installingHere: boolean;
  queuedHere: boolean;
  uninstallingHere: boolean;
  /** 本插件有失败 job——安装钮原位变红「重试安装」 */
  installFailed: boolean;
  installLabel: string;
  /** 安装中整句进度（含下载地址）——只进按钮 title，不进按钮文字（2026-09-30 报障：长句撑爆按钮） */
  installMessage?: string | null;
  versionPicker: ReactNode;
  installPicker: ReactNode;
  actButton: ReactNode;
  autoUpdateToggle: ReactNode;
  pinnedNote: ReactNode;
  onEnable: () => void;
  onDisable: () => void;
  onUninstall: () => void;
  onInstallClick: () => void;
  onRetryInstall: () => void;
}) {
  const { t } = useTranslation();
  /* 生命周期动作（启/禁/卸）的冻结栅：替换期间不可再点（busy 与更新进行中同效） */
  const frozen = busy || updating;
  /* R4-3.18「不够」≠「没有」：字段有（条目声明了 minApp）但当前壳不满足 ⇒ 行保留标黄 ＋ 安装钮置灰写原因。
   * 与 `installGateError` 的点击拦住同一条判据（minAppVerdict），两处都读 ver.appBelowMin，零第二套算法。 */
  const minAppBlocked = !!belowMinApp && !!minAppVersion;
  const minAppTitle = minAppBlocked
    ? t("需升级 LinkDesk 至 {{version}} 才能安装", { version: minAppVersion })
    : undefined;
  /* ── R4-3.20 付费六态（判定与卡片 resolveAction 同构：订阅→即将支持；过期→输入新密钥+续费；
   *  未购→获取许可+我有密钥；有权益→落回安装语义。⛔ 本件只渲染，裁决在壳安装门） ── */
  const paid = !!pricing;
  const subscription = pricing?.model === "subscription";
  const days = licenseDaysLeft(license);
  const expired = paid && days !== undefined && days < 0;
  const unowned = paid && !license && !expired;
  const priceText = pricing ? `${pricing.currency ?? "¥"}${pricing.price ?? 0}` : "";
  const priceParams = { price: priceText };
  /* 试用说明行（05 §05 / 03 `.d-trial`：买断/订阅形态一句说明；trialDays 是作者功能门的静态注记） */
  const paidNote = pricing
    ? subscription
      ? t("订阅制 · 需服务器实时校验——B3 上线后开放购买与自动续费")
      : pricing.trialDays
        ? `${t("含 {{days}} 天免费试用——试用功能门由作者代码控制，壳不计时", { days: pricing.trialDays })} · ${t("买断制 · 许可验证在壳层（本地验签，不联网）")}`
        : t("买断制 · 许可验证在壳层（本地验签，不联网）")
    : null;
  return (
    <div className="marketplace-mpd-acts">
      <div className="marketplace-mpd-acts-row">
        {disabledRow ? (
          <>
            {/* E6#33c/#33b 版本动作首槽：版本下拉（versions>1 有历史）+ 升/降钮（降走 requestDowngrade F2 确认 → allowOlder 放行）。
             *  禁用态也照常——F1（引擎 wasActive=false 换文件不 reload 保持禁用）；accent 语义族零新壳组件 */}
            {versionPicker}
            {actButton}
            <Button variant="success" onClick={onEnable} disabled={frozen}>
              <span className="codicon codicon-play" /> {t("启用")}
            </Button>
            {/* E6#18a：essential 藏卸载钮——含禁用态（旗标经 getDisabled 透传） */}
            {!isEssential && (
              <Button variant="danger" onClick={onUninstall} disabled={frozen}>
                <span className="codicon codicon-trash" /> {uninstallingHere ? t("卸载中...") : t("卸载")}
              </Button>
            )}
          </>
        ) : pending ? (
          <span className="marketplace-mpd-blocked-chip" data-hint={pendingReason} role="status">
            <span className="codicon codicon-circle-slash" />
            {t("安装不可用（缺依赖）")}
          </span>
        ) : hasInfo ? (
          <>
            {/* R4-3.20：许可过期（已装也可能）——输入新密钥/续费插在版本动作前（08 v3.64：过期红徽标＋输入新密钥＋续费） */}
            {expired && (
              <>
                <Button variant="success" onClick={onHaveKey}>
                  {t("输入新密钥")}
                </Button>
                {pricing?.licenseUrl && (
                  <Button variant="ghost" onClick={onRenew} title={t("打开作者销售页续费")}>
                    {t("续费")}
                  </Button>
                )}
              </>
            )}
            {/* E6#33c/#33b：版本下拉（有历史）+ 升/降钮首槽（「禁用/卸载」旁——点4 第一段） */}
            {versionPicker}
            {actButton}
            <Button variant="ghost" onClick={onDisable} disabled={frozen}>
              <span className="codicon codicon-circle-slash" /> {t("禁用")}
            </Button>
            {!isEssential && (
              <Button variant="danger" onClick={onUninstall} disabled={frozen}>
                <span className="codicon codicon-trash" /> {uninstallingHere ? t("卸载中...") : t("卸载")}
              </Button>
            )}
          </>
        ) : (
          <>
            {/* E6#33c：未装版本下拉（versions>1 选装哪个版本——05 §四场景①，选中即目标，默认最新/升级提示则 target） */}
            {installPicker}
            {installFailed ? (
              /* #64 A3（mockup 02 帧 3）：同一失败只留一处重试口——安装钮原位变红「↻ 重试安装」 */
              <Button
                variant="danger"
                onClick={onRetryInstall}
                disabled={busy || !online || minAppBlocked}
                title={!online ? t("联网后重试") : minAppTitle}
              >
                <span className="codicon codicon-refresh" /> {t("重试安装")}
              </Button>
            ) : paid && subscription ? (
              /* 09 §三·补3：订阅 v1 不可购（需服务器）——「即将支持」禁钮写原因（⛔ 伪装成可装） */
              <Button variant="success" disabled title={t("订阅需服务器实时校验——B3 上线后开放")}>
                {t("即将支持")}
              </Button>
            ) : expired ? (
              <>
                <Button variant="success" onClick={onHaveKey}>
                  {t("输入新密钥")}
                </Button>
                {pricing?.licenseUrl && (
                  <Button variant="ghost" onClick={onRenew} title={t("打开作者销售页续费")}>
                    {t("续费")}
                  </Button>
                )}
              </>
            ) : unowned ? (
              <>
                {/* ⛔ 作者未声明 licenseUrl 就不渲染外跳钮（08 v3.64b「弹不弹作者说了算」） */}
                {pricing?.licenseUrl && (
                  <Button variant="success" onClick={onBuy} title={t("打开作者销售页——应用内无支付")}>
                    {t("获取许可 {{price}}", priceParams)}
                  </Button>
                )}
                <Button variant="ghost" onClick={onHaveKey}>
                  {t("我有密钥")}
                </Button>
              </>
            ) : (
              <Button
                variant="success"
                onClick={onInstallClick}
                disabled={busy || installingHere || queuedHere || !online || minAppBlocked}
                title={
                  !online
                    ? t("联网后重试")
                    : minAppTitle
                      ? minAppTitle
                      : queuedHere
                        ? t("等待安装中")
                        : installingHere && installMessage
                          ? installMessage
                          : undefined
                }
              >
                <span className="codicon codicon-cloud-download" />
                {installingHere ? installLabel : queuedHere ? t("等待安装中") : t("安装")}
              </Button>
            )}
          </>
        )}
      </div>

      {/* #33d 自动更新勾选（row2 副控制——mockup 01 .pdva-acts row2 L849-851；G2：已装且非挂起才渲染）
       *  E6#83：同 row 尾随「已停在 vX」说明件——两条会打架的意愿并排（`.marketplace-mpd-acts-row` 自带 wrap 兜底，
       *  窄栏换行不掉版式）。两者皆空则整行不渲染，不留空行。 */}
      {autoUpdateToggle || pinnedNote ? (
        <div className="marketplace-mpd-acts-row">
          {autoUpdateToggle}
          {pinnedNote}
        </div>
      ) : null}

      {/* R4-3.20 试用/付费形态说明（05 §05 `.d-trial`：付费条目常驻一行；⛔ 不逐状态复读徽标已有的事实） */}
      {paidNote && <p className="marketplace-mpd-paid-note">{paidNote}</p>}
    </div>
  );
}
