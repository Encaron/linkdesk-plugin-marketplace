/**
 * CatalogRow——探索视图的一条目录行（图标 ｜ 名/版本 + 简述 + 作者/来源/体积 ｜ 行态动作槽）。
 * E6#86b（第 3.6.3 轮）feature-folder 拆分：自 `views/ExploreView.tsx` 的 `renderRow` 原样搬出，
 * 零行为变更（`renderRow(e, status)` → `<CatalogRow entry status … />`，key 由 map 移到元素上，等价）。
 *
 * 图标（E6#30e 第一站）：PluginIcon 显式 descriptor 入参（manifest={icon, iconSource}）——目录条目
 *   未安装、无 viewRegistry/元数据缓存条目，图标只由 catalog 声明字段裁决（硬约束 11）；iconSource
 *   "url" → resolvePluginIcon 返 src → 以 img 元素直接加载作者彩色图标。
 *   E6#69c/#69f：目录行 = 详情同裁决，走共享 `pickIdentityArt`。
 *
 * 🔴 E6#106 订正（这段注释此前是错的，逐字记下免得回改）：本文件曾写「目录条目本无 marketIcon 字段
 *   （架构三图模型：目录只存 icon；marketIcon 只在已装 plugin.json 内）」——**与两份设计文档相反**，
 *   也不是任何一次拍板，是 #86b 拆分时顺笔写下的合理化：① 06-图标.md 字段机制表明说 Type-2 身份图
 *   =「市场侧栏行 + 详情顶显同一张」；② 14 档案 §三.2 明说未装展示图来自 catalog，「两条分发路
 *   （打包 zip 内 + 目录 json 内）」。真实情况是 **publish 那一环漏搬了 marketIcon**，于是图标栏插件
 *   （`icon` = Type-1 剪影）在市场行显剪影、装到本地却显彩色身份图 = 同一插件两张脸。
 *
 * 本行现在的裁决序（**与详情页逐字同序**）：`已装 manifest → 目录条目 → 默认彩色块`。
 *   已装优先不是美化而是**防回归**：目录条目的图标已改成绝对 URL（包内路径未装时 404），
 *   已装行若只读目录就会去拉远程图——破 06-图标.md「已装不读远程目录图标」，且断网即裂图。
 *
 * 目录条目标题/作者/来源仓库名是作者数据——不走 t()（i18n 只翻壳文案）。
 */

import { useTranslation } from "react-i18next";
import { PluginIcon, pickIdentityArt } from "@linkdesk/ui";
import type { CatalogEntry } from "../../../services/marketCatalog";
import CatalogRowAction from "./CatalogRowAction";
import { authorLabel, formatSize } from "./catalogRowText";
import type { LocalIdentity, RowStatus } from "./useCatalogStatus";

export default function CatalogRow({
  entry,
  status,
  online,
  installedIdentity,
  onOpenDetail,
  onInstall,
}: {
  entry: CatalogEntry;
  status: RowStatus;
  online: boolean;
  /** E6#106：已装候选（图标四字段，来自 `useCatalogStatus().identityOf`）——未装为 undefined */
  installedIdentity?: LocalIdentity;
  onOpenDetail: (id: string, name: string) => void;
  onInstall: (entry: CatalogEntry) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="ms-extension-item catalog"
      onClick={() => onOpenDetail(entry.id, entry.name)}
      title={t("详情")}
    >
      <div className="ms-item-icon">
        {/* E6#30e：目录 icon descriptor；E6#69c/#69f：行 = 详情同裁决；
         *  E6#106：候选按序「已装 manifest → 目录条目 → 默认彩色块」（与详情页同序，防已装行转远程图） */}
        <PluginIcon
          pluginId={entry.id}
          manifest={pickIdentityArt(installedIdentity, entry)}
          alt={entry.name}
        />
      </div>
      <div className="ms-item-details">
        <div className="ms-item-header">
          <span className="ms-item-name" title={entry.name}>{entry.name}</span>
          <span className="ms-item-version">v{entry.version}</span>
        </div>
        {entry.description && <span className="ms-item-desc">{entry.description}</span>}
        <div className="ms-item-footer">
          {authorLabel(entry.author) && (
            <span className="ms-item-author">{authorLabel(entry.author)}</span>
          )}
          {entry.sourceName && (
            <span className="ms-item-tag" title={entry.sourceName}>{entry.sourceName}</span>
          )}
          {formatSize(entry.size) && <span className="ms-item-tag">{formatSize(entry.size)}</span>}
        </div>
      </div>
      <CatalogRowAction entry={entry} status={status} online={online} onInstall={onInstall} />
    </div>
  );
}
