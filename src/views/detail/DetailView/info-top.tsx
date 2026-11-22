/**
 * info-top——详情页元数据侧栏**顶部无节题小段**的行装配（mockup 04 开首，不落「信息」总词）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `useInfoGroups.ts` 的 top 段原样搬出（每行判据一字未改），
 * 零行为变更。与 `info-groups.tsx` 的 `resourcesGroupOf` / `depEnvGroupOf` 同构——「一段行怎么长出来」
 * 归各段自己，`useInfoGroups` 只负责把段拼成组表。
 *
 * R4-3.18（05 §02 四类字段）：本段 = **本机事实**（标识符 / 版本 / 大小 / 安装位置 / 数据位置）——
 * 「本地插件也有，恒可显示」。作者行属**抓取/派生型**，随「市场」组走（`useInfoGroups`）。
 * 逐行判据：标识符常显；版本/大小/位置「有值才画」——⛔ 不用「—」撑空行（全页唯一允许占位的是兼容性行）。
 */

import type { ReactNode } from "react";
import type { PluginDiskLocation, PluginFolderKind } from "@linkdesk/contracts";
import type { CatalogEntry } from "../../../services/marketCatalog";
import { fmtSize } from "../../../services/installConfirmPayload";
import { DirLink, InfoItem } from "./info-bits";

type T = (key: string, opts?: Record<string, unknown>) => string;

export function topGroupOf(o: {
  t: T;
  pluginId?: string;
  versionText?: string;
  entry?: CatalogEntry;
  diskLoc: PluginDiskLocation | null;
  onOpenDir: (kind: PluginFolderKind) => void;
}): ReactNode[] {
  const { t, pluginId, versionText, entry, diskLoc, onOpenDir } = o;
  const top: ReactNode[] = [
    <InfoItem key="id" label={t("标识符")} value={pluginId ?? ""} mono />,
  ];
  if (versionText) top.push(<InfoItem key="ver" label={t("版本")} value={`v${versionText}`} />);
  /* 大小行（B3 拍板「下载体积常显」保持——装不装都显，值 = 实测下载包字节）。
   *  E6#78：已装态该值变**链接**（点开安装目录）——照 VS Code 详情页 Size 行「值可点、class 'link'、
   *  onClick 开 extension.location」；未装 / 盘上找不到 = 纯文本，不画假链接。
   *  纯加字色与光标、文字一字不变 ⇒ 装/未装切换**零布局跳动**（不是多一行、不是换文案）。 */
  if (entry?.size != null) {
    const sizeText = fmtSize(entry.size);
    top.push(
      <InfoItem
        key="size"
        label={t("大小")}
        value={
          diskLoc ? (
            <DirLink
              title={t("在资源管理器里打开 {{path}}", { path: diskLoc.installDir })}
              onClick={() => onOpenDir("install")}
            >
              {sizeText}
            </DirLink>
          ) : (
            sizeText
          )
        }
      />,
    );
  }
  /* 2026-11-23 用户实机：删「安装位置」行——与上面「大小」链接**同一落点**（都开安装目录），
   *  信息全等但多占一行；「大小」值可点已足够回答「装在哪 + 多大」。 */
  /* E6#78 数据位置行——插件真写过数据才有主进程给的 dataDir，空/无 = 整行不画（同 VS Code「缓存」行）；
   *  值 = 动作链接（与「资源」组「仓库 → 打开仓库」同一手感：label 说是什么、value 说做什么）。 */
  if (diskLoc?.dataDir) {
    top.push(
      <InfoItem
        key="data"
        label={t("数据位置")}
        value={
          <DirLink
            title={t("在资源管理器里打开 {{path}}", { path: diskLoc.dataDir })}
            onClick={() => onOpenDir("data")}
            withIcon
          >
            {t("打开数据位置")}
          </DirLink>
        }
      />,
    );
  }
  return top;
}
