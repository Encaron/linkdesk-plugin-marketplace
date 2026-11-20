/**
 * ComingSoon — 棒 6 不建的页面的**诚实占位**（库/作者/来源/作者店）。
 *
 * 为什么存在：rail 三段式是棒 6 的交付（蓝图骨架），但四个页面分别属棒 7（作者域）与棒 8（库＋来源）；
 * 点过去显示死按钮或在别处弹窗都不如一个明确占位诚实。页面本体接棒即替换本件。
 */

import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../ui";

const TITLES: Record<string, string> = {
  library: "我的库",
  authors: "插件作者",
  sources: "来源管理",
  author: "作者主页",
};

export function ComingSoon({ page }: { page: string }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="dots"
      title={t(TITLES[page] ?? "插件市场")}
      sub={t("该视图将在后续批次接入——数据面与导航已就位")}
    />
  );
}

export default ComingSoon;
