/**
 * RankSection — 首页「热门下载」top 8（计算位：全源合并，按下载数；与完整榜单同源截断，04 §六）。
 *
 * 下载数拿不到时不造假：无计数的条目排后、行上不显示下载量（`downloadCounts` 的 hidden 语义）。
 */

import { useTranslation } from "react-i18next";
import { rankEntries } from "../storeData";
import { RankRow } from "../cards/RankRow";
import { useStore } from "../StoreContext";
import { SectionHead } from "./SectionHead";

export function RankSection() {
  const { t } = useTranslation();
  const { data, actions, navigate } = useStore();
  const dlOf = (entry: { downloadUrl?: string }) =>
    entry.downloadUrl ? data.counts.get(entry.downloadUrl) : undefined;
  const rows = rankEntries(data.catalog.entries, dlOf, 8);
  if (rows.length === 0) return null;
  return (
    <section className="marketplace-store-sec" data-spec="04-6">
      <SectionHead
        title={t("热门下载")}
        hint={t("按下载数排序——全源合并 top 8（计算位，与完整榜单同源）")}
        more={{ label: t("完整榜单"), onClick: () => navigate({ page: "rank" }) }}
      />
      <div>
        {rows.map((entry, i) => (
          <RankRow key={entry.id} entry={entry} index={i + 1} ctx={data.ctxOf(entry)} handlers={actions} />
        ))}
      </div>
    </section>
  );
}

export default RankSection;
