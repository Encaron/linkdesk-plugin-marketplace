/**
 * LicenseDialog — 壳 DialogHost **内容视图**（contributes.views.main["marketplace-license"]）。
 *
 * F20（2026-11-21 用户口径）：许可弹窗走**壳共享对话框通道**（与安装确认同一机制：遮罩/居中/
 * Esc/焦点锁/点遮罩取消全由壳提供，玻璃与面板皮与其他弹窗同款）——⛔ 市场自绘第二套弹窗外壳。
 * 面板内容 = `LicensePanel`（与市场内 `OverlayPortal` 版同一份组件）。
 *
 * 数据 = dialogHost.current()?.content?.payload（`LicenseDialogPayload`，过壳结构克隆）；
 * 结算 = dialogHost.confirm()（验签通过/关闭）。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LicensePanel } from "../store/LicensePanel";
import type { LicenseDialogPayload } from "../../services/licenseActions";
import "../../styles/MarketplaceConfirm.css";

function readPayload(): LicenseDialogPayload | null {
  const data = window.linkdesk?.dialogHost?.current?.();
  if (!data || data.open !== true) return null;
  const p = data.content?.payload;
  if (!p || typeof p !== "object") return null;
  return p as LicenseDialogPayload;
}

export default function LicenseDialog() {
  const { t } = useTranslation();
  const [payload] = useState<LicenseDialogPayload | null>(readPayload);
  const host = window.linkdesk?.dialogHost;

  if (!payload) return null;
  const close = () => host?.confirm?.();

  return (
    <div className="marketplace-mpd-confirm" role="dialog" aria-modal="true" aria-label={t("输入许可密钥")}>
      <h2 className="marketplace-mpd-confirm-title">{t("输入许可密钥")}</h2>
      <LicensePanel
        pluginName={payload.pluginName}
        authorId={payload.authorId}
        onClose={close}
        onVerified={() => {
          /* 壳验签时已入库——关闭弹窗即可；权益投影由打开方在 confirm 返回后 refresh */
        }}
        autoFocus
      />
    </div>
  );
}
