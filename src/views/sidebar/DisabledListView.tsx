/**
 * DisabledListView — 已禁用插件列表。
 * E3.6 E36#7.5：简化行（非 ViewPluginEntry 类型），含启用按钮。
 */

import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PluginIcon, pickIdentityArt } from "@linkdesk/ui";

import { useMarketplacePlugins, useCatalogEntryById } from "../../services/marketplaceShared";
import { updateTargetFor } from "../../services/marketCatalog";
/* E6#86d：侧栏样式已按实测分节拆为 3 件（原 MarketplaceSidebar.css 680 行）——**本处按原文档顺序
 *  全量 import**：5 个侧栏 surface 共用同一套样式，且各 surface 吃样式的类分散在自身 JSX 与其子件
 *  （如 ExtensionItem）里，逐件 import 要算传递闭包、收益为零。判据见 styles/detail/detail-shell.css 头注。 */
import "../../styles/sidebar/sidebar-shell.css";
import "../../styles/sidebar/sidebar-list.css";
import "../../styles/sidebar/sidebar-explore.css";

const pm = () => window.linkdesk?.pluginManager;

export default function DisabledListView() {
  const { t } = useTranslation();
  const tabs = window.linkdesk?.tabs;
  const { disabled } = useMarketplacePlugins();
  const catalogById = useCatalogEntryById();

  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const makeClickHandler = (pluginId: string) => () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      tabs?.create("plugin-detail", { pluginId, pinned: true });
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        tabs?.create("plugin-detail", { pluginId, pinned: false });
      }, 300);
    }
  };

  const handleEnable = useCallback(async (pluginId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await pm().enable(pluginId);
  }, []);

  if (disabled.length === 0) return null;

  return (
    <div>
      {disabled.map((p) => {
        const updateTo = updateTargetFor(catalogById.get(p.pluginId), p.version, p.updatable);
        return (
          <div key={p.pluginId} className="marketplace-ms-extension-item disabled">
            <div className="marketplace-ms-item-icon">
              {/* E6#66：禁用子集此前无 icon 字段（PluginInfoEntry 形状）——行图取目录官方条目兜底。
               *  E6#106：**禁用子集已补图标四字段**（壳 getDisabledPluginInfo 投影随行，照 E6#65a 给
               *  list() 补图标通道的同一先例），故裁决序与其它位统一为
               *  「已装（禁用但仍在盘上）→ 目录条目 → 默认彩色块」。
               *  🔴 这条是**防回归**：目录条目图标已 URL 化，若仍只读目录，禁用行会静默改去拉远程图
               *  ——既破 06-图标.md「已装不读远程目录图标」，又断网即裂图。 */}
              <PluginIcon pluginId={p.pluginId} manifest={pickIdentityArt(p, catalogById.get(p.pluginId))} />
            </div>
            <div
              className="marketplace-ms-item-details"
              onClick={makeClickHandler(p.pluginId)}
              style={{ cursor: "pointer" }}
            >
              <div className="marketplace-ms-item-header">
                <span className="marketplace-ms-item-name" style={{ opacity: 0.6 }}>
                  {t(p.name)}
                </span>{/* E5.8#37.9.1：插件显示名 t() 解析 */}
                {/* E6#33b：禁用插件也可更新（F1——更新后仍禁用）——徽标只示状态，升级入口归详情 */}
                {updateTo && (
                  <span className="marketplace-ms-item-badge-update" title={t("可更新")}>
                    <span className="codicon codicon-arrow-up" /> {t("可更新")} v{updateTo}
                  </span>
                )}
                {p.version && <span className="marketplace-ms-item-version">v{p.version}</span>}
              </div>
              {p.description && (
                <span className="marketplace-ms-item-desc" style={{ opacity: 0.5 }}>
                  {p.description}
                </span>
              )}
            </div>
            <button
              className="marketplace-ms-item-enable-btn"
              onClick={(e) => handleEnable(p.pluginId, e)}
              title={t("启用插件")}
            >
              <span className="codicon codicon-play" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
