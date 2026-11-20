/**
 * LicenseModal — 许可密钥输入弹窗（R4-3.21；08 v3.64 十步流第 4 步）。
 *
 * 交互（08 拍板）：粘贴**即时验签**（v1.<payload>.<sig> 形状齐即触发；WRONG 红 · VALID 绿）；
 * valid ⇒ 壳已把权益入库 → `onVerified()` 让消费方 refresh 权益投影 → 弹窗自动收起。
 * ⛔ v1 不做集中许可列表（08 付费 v1.1 边界②）——已购状态靠库徽标与「已购未安装」分区。
 *
 * 🔴 浮空覆盖层必进 `#ld-float-layer`：本件用 `@linkdesk/ui` 的 `OverlayPortal`（trapFocus＋
 *   关闭焦点归还共享件管）；⛔ 层外自绘 blur。弹窗壳复用加源弹窗同款
 *   `marketplace-store-modal-bg`/`marketplace-store-modal`（弹窗骨架只有一份）；公钥来源 =
 *   作者块 `publicKey`（`useAuthorDomain` 懒加载缓存；块缺失/无公钥 → 验签必然
 *   `bad-public-key`，文案如实告知，⛔ 假装验过）。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPortal } from "@linkdesk/ui";
import { useAuthorDomain } from "../../services/authors";
import { keyShapeOk, verifyFailText, verifyLicenseKey, type LicenseVerifyOutcome } from "../../services/licenseActions";

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
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LicenseVerifyOutcome | null>(null);
  const { domain } = useAuthorDomain(authorId ?? "", open ? 1 : 0);

  /* 打开即复位（换插件重开不留上一次的粘贴与结论） */
  useEffect(() => {
    if (!open) return;
    setValue("");
    setResult(null);
    setBusy(false);
  }, [open, pluginName]);

  /* 粘贴/输入即时验签——形状齐才发；busy 栅防抖动重发（验签幂等，重复发只会刷结论行） */
  const evaluate = async (raw: string) => {
    const key = raw.trim();
    if (!keyShapeOk(key) || busy) return;
    setBusy(true);
    setResult(null);
    const r = await verifyLicenseKey(key, domain?.publicKey ?? "");
    setResult(r);
    setBusy(false);
    if (r.valid) {
      onVerified();
      window.setTimeout(onClose, 900);
    }
  };

  if (!open) return null;
  const fail = result && !result.valid ? verifyFailText(t, result.failureReason) : null;

  return (
    <OverlayPortal onClose={busy ? undefined : onClose} trapFocus>
      <div
        className="marketplace-store-modal-bg"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) onClose();
        }}
      >
        <div className="marketplace-store-modal is-sm" role="dialog" aria-modal="true" aria-label={t("输入许可密钥")}>
          <h2>{t("输入许可密钥")}</h2>
          <div className="marketplace-store-m-sub">
            {t("粘贴 {{name}} 的许可密钥——验证在本机完成，不联网上传", { name: pluginName })}
          </div>
          <div
            className={`marketplace-store-m-field marketplace-ui-license-field${result ? (result.valid ? " is-ok" : " is-bad") : ""}`.trim()}
          >
            <input
              className="marketplace-ui-license-input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="v1.·····"
              value={value}
              autoFocus
              aria-label={t("许可密钥")}
              onChange={(e) => {
                setValue(e.target.value);
                setResult(null);
                void evaluate(e.target.value);
              }}
            />
          </div>
          {/* 结论行（WRONG 红 / VALID 绿 / busy 灰）——⛔ 不用占位符当结论 */}
          <p
            className={`marketplace-store-m-msg marketplace-ui-license-note${result ? (result.valid ? " is-ok" : " is-bad") : ""}`.trim()}
            aria-live="polite"
          >
            {busy
              ? t("正在验证…")
              : result?.valid
                ? t("许可有效——安装已解锁")
                : (fail ?? (domain?.publicKey ? t("密钥由作者签名，粘贴后自动验证") : t("作者块未声明公钥（authors/<id>.json 缺 publicKey）——暂时无法验证")))}
          </p>
          <div className="marketplace-ui-license-acts">
            <button type="button" className="marketplace-ui-btn is-secondary" onClick={onClose} disabled={busy}>
              {t("关闭")}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

export default LicenseModal;
