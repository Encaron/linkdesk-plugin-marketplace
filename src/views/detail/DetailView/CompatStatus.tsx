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
 * 触发（设计图帧②定稿）：**鼠标停在标上出卡、移开消失**（400ms 悬停意图延时，防划过闪一下）；
 * 键盘 Tab 聚焦同样出卡、失焦 / Esc 关；触屏点一下出、点外关。⛔ 不是点击弹层 / toast / 暗屏；
 * 卡体 `pointer-events:none`（纯文本、无链接无按钮）；容器 = `@linkdesk/ui` 的 `OverlayPortal`
 * （不传 `trapFocus`——不抢焦点；`closeOnOutsideClick={false}`——只靠「移开」消失的卡不该被
 * 鼠标按下关掉；触屏的「点外关」由本组件自己的 pointerdown 监听补——鼠标路径到不了那里，
 * 移开时卡已关）。⛔ 状态标不挂 `title`（原生提示会与卡同屏打架）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPortal } from "@linkdesk/ui";
import { Dash } from "./info-bits";
import type { CompatReading } from "./useCompatReading";

/** 悬停意图延时（设计图帧②定稿约 400ms——防鼠标划过时闪一下） */
const HOVER_INTENT_MS = 400;
/** 卡宽（mockup .hovercard 300px） */
const CARD_WIDTH = 300;

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
  const badgeRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const state = reading?.state;
  const shaped = state ? wordOf(state, t) : null;

  const close = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    setOpen(false);
  }, []);

  /** 出卡并贴标定位（标下缘 +6px；右缘夹紧防溢出窗口——信息栏贴窗口右缘） */
  const placeAndOpen = useCallback(() => {
    const r = badgeRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - CARD_WIDTH - 8)),
    });
    setOpen(true);
  }, []);

  const enter = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(placeAndOpen, HOVER_INTENT_MS);
  }, [placeAndOpen]);

  const leave = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    setOpen(false);
  }, []);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []); // 卸载清计时器（硬约束 14 同源）

  /* 触屏「点外关」——只服务无 hover 的路径（鼠标移开时卡已关，到不了这里）；活跃守卫照硬约束 14 */
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (!badgeRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", h, true);
    return () => window.removeEventListener("pointerdown", h, true);
  }, [open]);

  if (!state || !shaped) return <Dash />; // 读不到 ⇒ 「—」裸文本（不套角标、无卡）

  const { word, variant } = shaped;

  /* 卡文案（≤3 句说明 + 页脚一句；「部分不适配」三句 = 设计图帧②逐字；⛔ 作者面词/处数不上屏） */
  const body =
    state === "drifted"
      ? [t("它仍然可以正常安装和使用，你的文件和数据不受影响。"), t("只是它按较早版本的 LinkDesk 做的，个别界面可能显示得不够对。"), t("这不是评分——插件发布适配新版的新版本后会恢复；已经有新版本就点「更新」。")]
      : state === "current"
        ? [t("它与当前版本的 LinkDesk 完全匹配，可以正常安装和使用。"), t("你的文件和数据不受影响。"), t("这只是当前状态。")]
        : state === "compatible"
          ? [t("它仍然可以正常安装和使用，你的文件和数据不受影响。"), t("它是按较早版本的 LinkDesk 做的适配，现在仍然可用。"), t("这只是当前状态。")]
          : [t("它暂时装不上——它需要更新版本的 LinkDesk。"), t("请先更新 LinkDesk，之后就能安装了。"), t("这只是当前状态。")];

  return (
    <>
      <span
        ref={badgeRef}
        className={`ldk-badge marketplace-mpd-compat-badge${variant ? ` marketplace-mpd-compat-badge--${variant}` : ""}`}
        tabIndex={0}
        aria-label={word}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={placeAndOpen}
        onBlur={leave}
        onClick={placeAndOpen}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        {word}
      </span>
      {open && (
        <OverlayPortal onClose={close} triggerRef={badgeRef} closeOnOutsideClick={false}>
          <div className="marketplace-mpd-compat-card" style={pos}>
            <div className="marketplace-mpd-compat-card-title">{word}</div>
            {body.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <div className="marketplace-mpd-compat-card-src">{t("LinkDesk 在你本机自动核对，不联网、不上传。")}</div>
          </div>
        </OverlayPortal>
      )}
    </>
  );
}
