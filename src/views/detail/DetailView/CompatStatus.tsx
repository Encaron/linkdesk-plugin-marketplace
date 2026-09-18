/**
 * CompatStatus——「兼容性」组的状态标＋悬停帮助卡（E6#118 · 设计唯一源 = mockups/01 帧①②，用户已点头）。
 *
 * 🔴 **全页唯一的状态标**（用户 2026-09-18 拍板：标题旁不挂、侧栏不标）——本组件只被
 * `useInfoGroups` 的「兼容性」组消费一次。**只显示、不复算**：读数 = 宿主 `plugins.getCompatibility`
 * （E6#117），⛔ 插件里写第二套状态算法；⛔ 读数的 `dangling`/`unknown` 字段（作者面/诊断面）不上屏。
 *
 * 五个用户面词逐字照抄 [00 §〇d]（正常 / 兼容 / 部分不适配 / 不适配 / —）：
 * 读不到（面缺失 / `state:"unknown"`）⇒ 裸文本「—」（设计图帧③：不套角标）——⛔ 不显示「不适配」。
 *
 * 🔴 **E6#120（2026-09-19）：卡体收编为壳的共享件 `HintCard`**（`@linkdesk/ui` 0.3.1 起）——
 * 自有的 OverlayPortal 容器 / 定位 / 触发状态机 / 自有卡体样式整段删除
 * （共享件只有一份实现）。**触发行为与文案逐字保留**（格 5 段 ⑺ 预交的替换清单）：400ms 悬停意图、
 * 移开消失、Tab 聚焦出卡 / 失焦 / Esc 关、触屏点按出 / 点外关、卡体 `pointer-events:none`、
 * ⛔ 不挂 `title`——全部由 `HintCard` 承接（口径唯一真相源 = 05-任务-市场显示状态.md §四）。
 */

import { useTranslation } from "react-i18next";
import { HintCard } from "@linkdesk/ui";
import { Dash } from "./info-bits";
import type { CompatReading } from "./useCompatReading";

/** state → 用户面词 + 角标变体（色 = 语义 token；正常=success 实底，兼容=默认角标，warn/err=描边淡底） */
function wordOf(state: CompatReading["state"], t: (k: string) => string): { word: string; variant: string } | null {
  switch (state) {
    case "current":
      return { word: t("正常"), variant: "ok" };
    case "compatible":
      return { word: t("兼容"), variant: "" };
    case "drifted":
      return { word: t("部分不适配"), variant: "warn" };
    case "incompatible":
      return { word: t("不适配"), variant: "err" };
    default:
      return null; // unknown / 面缺失 ⇒ 裸文本「—」
  }
}

export function CompatStatus({ reading }: { reading?: CompatReading }) {
  const { t } = useTranslation();

  const state = reading?.state;
  const shaped = state ? wordOf(state, t) : null;

  if (!state || !shaped) return <Dash />; // 读不到 ⇒ 「—」裸文本（不套角标、无卡）

  const { word, variant } = shaped;

  /* 卡文案（≤3 句说明 + 页脚一句；「部分不适配」三句 = 设计图帧②逐字；⛔ 作者面词/处数不上屏）
     ——触发与定位归共享件 HintCard（E6#120），本组件只给锚标与文案。 */
  const body =
    state === "drifted"
      ? [t("它仍然可以正常安装和使用，你的文件和数据不受影响。"), t("只是它按较早版本的 LinkDesk 做的，个别界面可能显示得不够对。"), t("这不是评分——插件发布适配新版的新版本后会恢复；已经有新版本就点「更新」。")]
      : state === "current"
        ? [t("它与当前版本的 LinkDesk 完全匹配，可以正常安装和使用。"), t("你的文件和数据不受影响。"), t("这只是当前状态。")]
        : state === "compatible"
          ? [t("它仍然可以正常安装和使用，你的文件和数据不受影响。"), t("它是按较早版本的 LinkDesk 做的适配，现在仍然可用。"), t("这只是当前状态。")]
          : [t("它暂时装不上——它需要更新版本的 LinkDesk。"), t("请先更新 LinkDesk，之后就能安装了。"), t("这只是当前状态。")];

  return (
    <HintCard title={word} lines={body} note={t("LinkDesk 在你本机自动核对，不联网、不上传。")}>
      <span className={`ldk-badge marketplace-mpd-compat-badge${variant ? ` marketplace-mpd-compat-badge--${variant}` : ""}`} aria-label={word}>
        {word}
      </span>
    </HintCard>
  );
}
