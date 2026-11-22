/**
 * RankView — 完整榜单页（**当前仓** top 50；19 §5.3；04 §六 / 08 §三·127）。
 *
 * D1（2026-11-22）：只算 `currentRepo`——`scope` 全源缺省作废，不再提供全源模式。
 * 计算位：排序键 = 下载数（`downloadCounts` 同源表）；来源随行；将来接服务器换真实统计（槽位不动）。
 * 无计数条目排后且不显示下载量——诚实不造位。
 */

import { useTranslation } from "react-i18next";
import { Icon } from "../../../ui";
import { RankRow } from "../cards/RankRow";
import { rankEntries } from "../storeData";
import { useStore } from "../StoreContext";

export function RankView() {
  const { t } = useTranslation();
  const { data, actions } = useStore();
  const dlOf = (entry: { downloadUrl?: string }) =>
    entry.downloadUrl ? data.counts.get(entry.downloadUrl) : undefined;
  const repoName = data.repo.repo?.name ?? data.repo.name;
  const rows = rankEntries(data.repo.entries, dlOf, 50);
  return (
    <>
      <div className="marketplace-store-crumb">
        {t("完整榜单")} · <b>{t("热门下载 Top 50")}</b> · {repoName}
      </div>
      <div className="marketplace-store-cat-note">
        <Icon name="alert" size="sm" />
        {t("按下载量排序，只统计「{{repo}}」里的插件", { repo: repoName })}
      </div>
      <div>
        {rows.map((entry, i) => (
          <RankRow key={entry.id} entry={entry} index={i + 1} ctx={data.ctxOf(entry)} handlers={actions} />
        ))}
      </div>
    </>
  );
}

export default RankView;
