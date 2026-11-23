/**
 * BatchUpdateConfirm——P0「Update all」批量确认卡视图（contributes.views.main["marketplace-update-batch"] inert）。
 *
 * 角色与 ConfirmInstall 同款：壳 DialogHost content 槽的内容，市场自绘卡面；弹窗机制（居中/遮罩/Esc/
 * 焦点锁/点遮罩取消）由壳 DialogHost 提供。数据 = dialogHost.current()?.content?.payload
 * （batchConfirmPayload 产物；结构克隆，零函数）。
 *
 * 🔴 P0 边界：本卡**每次批量都问**，不做来源信任/免问判定；P1 壳 policy 接管后，这张卡只负责
 *   展示「需要确认」的那部分。列表可滚动（20+ 条不撑破弹窗）。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@linkdesk/ui";
import { fmtSize } from "../../services/installConfirmPayload";
import type { BatchConfirmPayload } from "../../services/batchConfirmPayload";
import "../../styles/MarketplaceConfirm.css";
import "../../styles/MarketplaceBatchConfirm.css";

/** 挂载读数——当前打开 Dialog 的内容 payload（挂载即打开，懒初始化读一次足够） */
function readPayload(): BatchConfirmPayload | null {
  const data = window.linkdesk?.dialogHost?.current?.();
  if (!data || data.open !== true) return null;
  const p = data.content?.payload;
  if (!p || typeof p !== "object") return null;
  return p as BatchConfirmPayload;
}

export default function BatchUpdateConfirm() {
  const { t } = useTranslation();
  const [payload] = useState<BatchConfirmPayload | null>(readPayload);
  const [submitting, setSubmitting] = useState(false);

  if (!payload || !Array.isArray(payload.entries)) return null;

  const host = window.linkdesk?.dialogHost;
  const total = payload.entries.length;
  const actionLabel = t("更新 {{count}} 个", { count: total });

  const handleConfirm = () => {
    if (submitting) return;
    setSubmitting(true);
    host?.confirm?.();
  };

  return (
    <div className="marketplace-mpd-confirm marketplace-mpd-batch" role="dialog" aria-modal="true" aria-label={t("确认批量更新")}>
      <div className="marketplace-mpd-confirm-head">
        <span className="codicon codicon-shield marketplace-mpd-confirm-shield" />
        <span className="marketplace-mpd-confirm-title">{t("确认批量更新")}</span>
      </div>
      <p className="marketplace-mpd-confirm-note">
        {t("将依次更新 {{count}} 个插件；不会打开详情页。", { count: total })}
      </p>
      <p className="marketplace-mpd-batch-summary">
        {t("共 {{total}} 个 · {{official}} 个官方源 · {{third}} 个第三方", {
          total,
          official: payload.officialCount,
          third: payload.thirdPartyCount,
        })}
      </p>

      <div className="marketplace-mpd-batch-list" role="list">
        {payload.entries.map((e) => (
          <div className="marketplace-mpd-batch-row" role="listitem" key={e.id}>
            <div className="marketplace-mpd-batch-main">
              <div className="marketplace-mpd-batch-name">
                {e.name}
                {e.official && <span className="marketplace-mpd-batch-official">{t("官方发布")}</span>}
              </div>
              <div className="marketplace-mpd-batch-sub">
                {e.publisher ?? "—"}
                {e.sourceName ? <> · {e.sourceName}</> : null}
              </div>
            </div>
            <div className="marketplace-mpd-batch-side">
              <div className="marketplace-mpd-batch-ver">
                {e.fromVersion ? `v${e.fromVersion} → v${e.version}` : `v${e.version}`}
              </div>
              {e.size != null && <div className="marketplace-mpd-batch-size">{fmtSize(e.size)}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="marketplace-mpd-confirm-actions">
        <Button variant="ghost" onClick={() => host?.cancel?.()}>
          {t("取消")}
        </Button>
        <Button variant="success" onClick={handleConfirm} disabled={submitting}>
          <span className="codicon codicon-cloud-download" /> {actionLabel}
        </Button>
      </div>
    </div>
  );
}
