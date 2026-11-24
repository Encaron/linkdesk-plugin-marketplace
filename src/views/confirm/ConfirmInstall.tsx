/**
 * ConfirmInstall——**市场自绘**的安装/更新确认卡（2026-11-25 · D8′ 落地）。
 *
 * 谁画：**市场**。壳只出 `plan` 与文案（`PluginConfirmViewPayload`），执行/令牌/判定仍在壳。
 *   · 入口：`services/hostInstallConfirm.ts` 走 `prepareInstall` → `dialog.confirmContent({pluginId:"marketplace",
 *     viewId:"marketplace-install-confirm", payload: view})` → 用户在这里点确认 → 壳 `commitInstall(planId)`。
 *   · 长相：`@linkdesk/ui` 的 `PluginInstallConfirm` 共享件（与壳默认卡**同一件**）——
 *     ⛔ 不在这里另画一套版式：换一个市场也该长这样，且壳加行（如「发起方：AI」）时这里零改动。
 *   · 数据：只吃 `view.plan`（来源/版本/哈希/风险）+ `view.labels`（壳 t() 解析）——
 *     ⛔ 不复用目录条目自己拼来源语义（那是第二推导点）。
 *   · 答复：只调 `dialogHost.confirm()/cancel()`；⛔ 不自动确认（壳只认令牌与答复）。
 *
 * 旧实现（E6#71c）吃的是市场自造的 `InstallConfirmPayload`（目录字段直拼）——P1 壳托管后已废弃，
 * 2026-11-25 随 D8′ 重写为「壳给数据、市场画」。
 */

import { buildInstallVM, PluginInstallConfirm } from "@linkdesk/ui";
import type { PluginConfirmViewPayload } from "@linkdesk/contracts";

const host = () => window.linkdesk?.dialogHost;

/** 挂载读数——壳打开的富内容弹窗载荷（挂载即打开，懒初始化读一次足够） */
function readPayload(): PluginConfirmViewPayload | null {
  const data = host()?.current?.();
  if (!data || data.open !== true) return null;
  const p = data.content?.payload as PluginConfirmViewPayload | undefined;
  if (!p || p.kind !== "install" || !p.plan || !p.labels) return null;
  return p;
}

export default function ConfirmInstall() {
  const payload = readPayload();
  if (!payload) return null; // 防御：没有载荷就不画半张卡

  const vm = buildInstallVM(payload.plan, payload.labels, payload.fromVersion);
  const item = payload.plan.ask[0];

  /* 「以后此来源的更新不再询问」——信任写壳（⛔ 市场不自己判信任） */
  const onRememberChange = (checked: boolean): void => {
    const api = window.linkdesk?.plugins;
    if (!item || !api) return;
    const source = item.request.source;
    if (checked) {
      void api.trustSource?.({ sourceId: source.id, url: source.url, repo: source.repo, publisher: source.publisher });
    } else {
      void api.untrustSource?.(source.id);
    }
  };

  return (
    <PluginInstallConfirm
      vm={vm}
      onConfirm={() => host()?.confirm()}
      onCancel={() => host()?.cancel()}
      onRememberChange={onRememberChange}
    />
  );
}
