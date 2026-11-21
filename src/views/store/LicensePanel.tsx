/**
 * LicensePanel — 许可密钥输入**面板本体**（两处壳共用：市场自绘弹窗 ＋ 壳 DialogHost 内容视图）。
 *
 * 为什么拆出来（F20，2026-11-21 用户口径「弹窗机制统一走共享」）：外壳（遮罩/焦点锁/居中）由
 * 宿主决定——市场内自绘弹窗走 `OverlayPortal`（浮层权威），壳内弹窗走 `dialog.confirmContent`
 * 通道（与安装确认同一机制）。**面板内容只写一份**，两处挂载同一组件 ⇒ ⛔ 两套皮。
 *
 * 逻辑不变（08 v3.64 十步流第 4 步）：粘贴即时验签（形状齐即触发；WRONG 红 · VALID 绿）；
 * valid ⇒ 壳已入库 → `onVerified()` → 消费方 refresh 权益。⛔ 不做集中许可列表。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthorDomain } from "../../services/authors";
import { keyShapeOk, verifyFailText, verifyLicenseKey, type LicenseVerifyOutcome } from "../../services/licenseActions";

export function LicensePanel({
  pluginName,
  authorId,
  onClose,
  onVerified,
  autoFocus = true,
}: {
  pluginName: string;
  /** 条目声明的 authorId（公钥所在作者块；空 = 无块 → 验签报公钥缺失） */
  authorId?: string;
  onClose: () => void;
  /** 验签通过（壳已入库）——消费方 refresh 权益投影 */
  onVerified: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LicenseVerifyOutcome | null>(null);
  const { domain } = useAuthorDomain(authorId ?? "", 1);

  /* 换插件重开不留上一次的粘贴与结论 */
  useEffect(() => {
    setValue("");
    setResult(null);
    setBusy(false);
  }, [pluginName]);

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

  const fail = result && !result.valid ? verifyFailText(t, result.failureReason) : null;

  return (
    <>
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
          autoFocus={autoFocus}
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
    </>
  );
}

export default LicensePanel;
