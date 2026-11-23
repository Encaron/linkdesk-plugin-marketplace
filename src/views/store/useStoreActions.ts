/**
 * useStoreActions — 商店**所有动作的执行器**（GUI 动作 ↔ 服务单点；10 §三 AI 友好化）。
 *
 * 复用纪律（09 §三·补末行）：
 *   - 安装 = `services/marketInstallAction`（与侧栏同一条链：确认卡/minApp 门/startMarketInstall）；
 *   - 更新 = `services/marketUpdateAction`（与详情版本动作同一条序列）；
 *   - 重试 = `marketplaceShared.retryMarketInstall`（带确认门，单点）；
 *   - 启/禁/卸 = 壳 `pluginManager` 既有 API（⛔ 新造动作）；
 *   - 购买/续费 = 壳 `shell.openExternal`（T4 白名单闸门）；
 *   - 我有密钥/输入新密钥 = 许可弹窗（R4-3.21；弹窗态归 StoreView，本件只发请求）。
 *
 * 卸载二次确认 = 蓝图「同一按钮点两次」（第一次给提示、3.2 秒内再点才执行；08 §三·107）。
 */

import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { lt } from "../../services/i18nText";
import type { CatalogEntry } from "../../services/marketCatalog";
import { retryMarketInstall } from "../../services/marketplaceShared/installFlow";
import { scheduleDataRefresh } from "../../services/marketplaceShared/pluginsStore";
import { notifyError } from "../../services/marketplaceShared/notifications";
import { runMarketInstallAction } from "../../services/marketInstallAction";
import { performMarketUpdate } from "../../services/marketUpdateAction";
import { openPluginDetailTab } from "../../services/openDetailTab";
import { openExternal, showToast } from "../../services/hostApi";
import type { ActionId } from "../../ui";
import type { StoreCardHandlers } from "./cards/cardParts";

const lk = () => window.linkdesk;
const pm = () => window.linkdesk?.pluginManager;

const UNINSTALL_CONFIRM_MS = 3200;

export function useStoreActions(
  online: boolean,
  /** R4-3.21：`have-key` → 许可弹窗（StoreView 持弹窗态；缺省回退通知占位——测试/旧调用面兼容） */
  onRequestLicense?: (entry: CatalogEntry) => void,
): StoreCardHandlers {
  const { t } = useTranslation();
  const pendingUninstall = useRef(new Map<string, number>());

  const onOpen = useCallback((entry: CatalogEntry) => {
    // 08 v3.51：每插件一标签、pinned:true 固定新开；未装插件壳无 manifest，必须传 label。
    // 唯一入口 = services/openDetailTab（R4-3.16）——⛔ 视图里不再各自写 tabs.create。
    void openPluginDetailTab(entry.id, lt(entry, "name"));
  }, []);

  const onAct = useCallback(
    (entry: CatalogEntry, id: ActionId) => {
      switch (id) {
        case "open":
          onOpen(entry);
          return;
        case "install":
        case "retry":
          if (id === "retry") {
            if (!entry.downloadUrl) return;
            void retryMarketInstall(entry.id, entry.downloadUrl, lt(entry, "name"));
            return;
          }
          void runMarketInstallAction(entry, online, t);
          return;
        case "update": {
          void performMarketUpdate({
            pluginId: entry.id,
            entry,
            displayName: lt(entry, "name"),
            ver: entry.version,
            online,
            refresh: scheduleDataRefresh,
            t: t as (key: string, opts?: Record<string, unknown>) => string,
          });
          return;
        }
        case "enable":
          void (async () => {
            try {
              await pm()?.enable(entry.id);
              scheduleDataRefresh();
            } catch (e) {
              notifyError(t("启用「{{name}}」失败：{{detail}}", { name: lt(entry, "name"), detail: e instanceof Error ? e.message : String(e) }));
            }
          })();
          return;
        case "disable":
          void (async () => {
            try {
              await pm()?.disable(entry.id);
              scheduleDataRefresh();
            } catch (e) {
              notifyError(t("禁用「{{name}}」失败：{{detail}}", { name: lt(entry, "name"), detail: e instanceof Error ? e.message : String(e) }));
            }
          })();
          return;
        case "uninstall": {
          const now = Date.now();
          const until = pendingUninstall.current.get(entry.id) ?? 0;
          if (now < until) {
            pendingUninstall.current.delete(entry.id);
            void (async () => {
              try {
                await pm()?.uninstall(entry.id);
                scheduleDataRefresh();
              } catch (e) {
                notifyError(t("卸载「{{name}}」失败：{{detail}}", { name: lt(entry, "name"), detail: e instanceof Error ? e.message : String(e) }));
              }
            })();
            return;
          }
          pendingUninstall.current.set(entry.id, now + UNINSTALL_CONFIRM_MS);
          showToast(t("再点一次确认卸载——已装数据会被删除"), { severity: "warning", ttl: UNINSTALL_CONFIRM_MS });
          return;
        }
        case "buy":
        case "renew": {
          const url = entry.pricing?.licenseUrl;
          if (!url) return;
          void openExternal(url).then((ok) => {
            if (!ok) showToast(t("无法打开销售页"), { severity: "warning" });
          });
          return;
        }
        case "have-key":
          // R4-3.21：打开许可弹窗（粘贴即时验签→壳入库→refresh）；执行器注入，本件不持弹窗态
          if (onRequestLicense) {
            onRequestLicense(entry);
            return;
          }
          showToast(t("许可验证将在付费批次接入"), { severity: "info" });
          return;
        default:
          return;
      }
    },
    [online, onOpen, t, onRequestLicense],
  );

  return { onOpen, onAct };
}

/** 供页面直接触发的「检查更新」——命令面唯一入口（marketplace.checkUpdates） */
export async function checkUpdatesFromStore(): Promise<{ ok: boolean; count: number }> {
  try {
    const r = (await lk()?.commands?.executeCommand?.("marketplace.checkUpdates")) as
      | { ok?: boolean; count?: number }
      | undefined;
    return { ok: r?.ok !== false, count: typeof r?.count === "number" ? r.count : 0 };
  } catch {
    return { ok: false, count: 0 };
  }
}

/** 供页面直接触发的「刷新内容」——命令面唯一入口（marketplace.refreshCatalog） */
export async function refreshContentFromStore(): Promise<{ ok: boolean; changed: boolean }> {
  try {
    const r = (await lk()?.commands?.executeCommand?.("marketplace.refreshCatalog")) as
      | { ok?: boolean; changed?: boolean }
      | undefined;
    return { ok: r?.ok !== false, changed: r?.changed === true };
  } catch {
    return { ok: false, changed: false };
  }
}
