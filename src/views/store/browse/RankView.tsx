/**
 * RankView — 完整榜单页（**全部来源合并** top 50；04 §六 / 08 §三·127）。
 *
 * 2026-11-22 用户实机反转：排行榜恢复全源合并语义，不按当前仓过滤。
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
  const rows = rankEntries(data.catalog.entries, dlOf, 50);
  return (
    <>
      <div className="marketplace-store-crumb">
        {t("完整榜单")} · <b>{t("热门下载 Top 50")}</b>
      </div>
      <div className="marketplace-store-cat-note">
        <Icon name="alert" size="sm" />
        {t("按下载量排序，来自你添加的所有来源")}
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
