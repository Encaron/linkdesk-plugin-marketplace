/**
 * useDetailVersionAction——详情视图的版本动作：升级/降级执行 + 降级确认（E6#33b/#33c）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *
 * 棒 6 归一化：执行序列上移到 `services/marketUpdateAction.ts`（`performMarketUpdate`）——
 * 商店卡片「更新」与详情版本动作共用同一条序列（10 §一「同一按钮两套实现」禁令）；本 hook 只剩
 * 视图态（busy/updating）、降级确认与 refreshPlugins 注入。
 *
 * 与兄弟模块 `useDetailActions` 的分工：那边是「状态型动作」（启/禁/卸/自动更新勾选，执行完靠 lifecycle
 * 事件收敛），这边是「版本型动作」（走引擎 update，无 lifecycle 事件，需显式 refreshPlugins 收敛）。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { notifyError, updateFailText } from "../../../services/marketplaceShared";
import { performMarketUpdate } from "../../../services/marketUpdateAction";
import type { DetailIdentity } from "./useDetailIdentity";

const lk = () => window.linkdesk;
const pm = () => window.linkdesk?.pluginManager;

export function useDetailVersionAction(
  id: DetailIdentity,
  o: {
    busy: boolean;
    updating: boolean;
    setUpdating: (b: boolean) => void;
    online: boolean;
    /** 已装版本——升降判定基准（属版本层 useDetailVersions，由门面显式转入） */
    localVer?: string;
  },
) {
  const { t } = useTranslation();
  const { pluginId, entry, displayName, refreshPlugins } = id;
  const { busy, updating, setUpdating, online, localVer } = o;

  /* ── 版本动作执行（升/降一码——版本动作目标 actTarget 驱动；mockup 帧 6 st-update）。
   *  序列细节（在线/下载址/壳版本门/确认卡/pm.update/钉版本/失败终局）全在 performMarketUpdate，
   *  本处只包 UI 态与「无更新执行面」的环境缺面提示。 ── */
  const doVersionAction = useCallback(
    async (ver: string) => {
      if (!pluginId || busy || updating) return;
      if (!online) return; // 离线：更新钮已置灰 + title「联网后重试」——状态类静默拦（#64 A2），非失败无 toast
      const upd = pm()?.update;
      if (!upd) {
        // 无更新执行面（老 preload 面）——环境缺面诚实告知（无原文可显 → updateFailText 通用兜底）
        notifyError(updateFailText(t, "unknown", ""));
        return;
      }
      setUpdating(true);
      try {
        await performMarketUpdate({
          pluginId,
          entry,
          displayName,
          ver,
          localVer,
          online,
          refresh: refreshPlugins,
          t: t as (key: string, opts?: Record<string, unknown>) => string,
        });
      } finally {
        setUpdating(false);
      }
    },
    [pluginId, busy, updating, setUpdating, online, entry, localVer, t, refreshPlugins, displayName],
  );

  /* ── 降级确认（F2，05 §二·十一——「此版本较旧，配置可能不兼容」。不拦只提示：确认后
   *  allowOlder 放行执行，取消原地不动。纯文字确认 = 壳 dialog.confirm（与卸载同款）。 ── */
  const requestDowngrade = useCallback(
    async (ver: string) => {
      if (!pluginId || busy || updating) return;
      const confirmApi = lk()?.dialog?.confirm;
      if (!confirmApi) return;
      const ok = await confirmApi(
        t("此版本较旧，配置可能不兼容。仍要降级到 {{version}} 吗？", { version: `v${ver}` }),
      );
      if (!ok) return;
      await doVersionAction(ver);
    },
    [pluginId, busy, updating, t, doVersionAction],
  );

  return { doVersionAction, requestDowngrade };
}
