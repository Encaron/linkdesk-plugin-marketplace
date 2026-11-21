/**
 * LicenseModal — 许可密钥输入弹窗的**市场内挂载形态**（`OverlayPortal` 浮层权威版）。
 *
 * F20（2026-11-21）：面板本体抽到 `LicensePanel`（与壳 DialogHost 内容视图 `LicenseDialog` 同一份）；
 * 优先走壳对话框通道（`requestLicenseDialog`，与安装确认同机制）；壳面不可用时（旧壳/预览/测试）
 * 回落本组件——⚠️ 回落版只服务兼容面，⛔ 不作为「第二套弹窗皮」的长期出口。
 */

import { OverlayPortal } from "@linkdesk/ui";
import { useTranslation } from "react-i18next";
import { LicensePanel } from "./LicensePanel";

export function LicenseModal({
  open,
  pluginName,
  authorId,
  onClose,
  onVerified,
}: {
  open: boolean;
  pluginName: string;
  /** 条目声明的 authorId（公钥所在作者块；空 = 无块 → 验签报公钥缺失） */
  authorId?: string;
  onClose: () => void;
  /** 验签通过（壳已入库）——消费方 refresh 权益投影 */
  onVerified: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <OverlayPortal onClose={onClose} trapFocus>
      <div
        className="marketplace-store-modal-bg"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="marketplace-store-modal is-sm" role="dialog" aria-modal="true" aria-label={t("输入许可密钥")}>
          <h2>{t("输入许可密钥")}</h2>
          <LicensePanel pluginName={pluginName} authorId={authorId} onClose={onClose} onVerified={onVerified} />
        </div>
      </div>
    </OverlayPortal>
  );
}

export default LicenseModal;
