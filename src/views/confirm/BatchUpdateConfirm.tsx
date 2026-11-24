/**
 * BatchUpdateConfirm——**市场自绘**的批量更新汇总卡（2026-11-25 · D8′）。
 *
 * 与 `ConfirmInstall` 同一条链：壳 `prepareUpdateBatch` → 本视图渲染 → 用户确认 → 壳 `commitInstall(planId)`。
 * 长相 = `@linkdesk/ui` 的 `PluginUpdateBatchSummary`（与壳默认卡同一件）。
 *
 * 两个勾/钮都要**回壳**，⛔ 市场不自己判策略：
 *   · 「以后官方源不再询问」→ `plugins.setUpdatePolicy` → 再向壳要一次计划（`previewUpdatePlan`）；
 *   · 「改为逐个确认」→ 同上，带 `forceAsk:true`（只影响这次展示，不落盘）。
 * 重算失败 ⇒ 保留原计划（用户仍可确认/取消，⛔ 不白屏、不假绿）。
 */

import { buildBatchVM, PluginUpdateBatchSummary } from "@linkdesk/ui";
import type { PluginConfirmPlan, PluginConfirmViewPayload } from "@linkdesk/contracts";
import { useState } from "react";

const host = () => window.linkdesk?.dialogHost;

function readPayload(): PluginConfirmViewPayload | null {
  const data = host()?.current?.();
  if (!data || data.open !== true) return null;
  const p = data.content?.payload as PluginConfirmViewPayload | undefined;
  if (!p || p.kind !== "batch" || !p.plan || !p.labels) return null;
  return p;
}

export default function BatchUpdateConfirm() {
  const payload = readPayload();
  const [plan, setPlan] = useState<PluginConfirmPlan | null>(payload?.plan ?? null);
  const [silentOfficial, setSilentOfficial] = useState<boolean>(payload?.policy?.silentOfficial ?? true);
  const [forced, setForced] = useState(false);

  if (!payload || !plan) return null;

  const api = window.linkdesk?.plugins;
  const reqs = payload.reqs ?? [];

  const replan = async (opts?: { forceAsk?: boolean }): Promise<void> => {
    if (!api?.previewUpdatePlan) return;
    try {
      setPlan(await api.previewUpdatePlan(reqs, opts));
    } catch {
      /* 保留原计划——用户仍可按原样确认/取消 */
    }
  };

  const onRememberChange = async (checked: boolean): Promise<void> => {
    if (!api?.setUpdatePolicy) return;
    setSilentOfficial(checked);
    try {
      await api.setUpdatePolicy({ silentOfficial: checked });
    } catch {
      return;
    }
    await replan({ forceAsk: forced });
  };

  const onForceAsk = async (): Promise<void> => {
    setForced(true);
    await replan({ forceAsk: true });
  };

  const vm = buildBatchVM(plan, payload.labels, silentOfficial);

  return (
    <PluginUpdateBatchSummary
      vm={vm}
      onConfirm={() => host()?.confirm()}
      onCancel={() => host()?.cancel()}
      onRememberChange={(checked) => {
        void onRememberChange(checked);
      }}
      onForceAsk={() => {
        void onForceAsk();
      }}
    />
  );
}
