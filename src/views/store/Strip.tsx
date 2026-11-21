/**
 * Strip — 横排板块的**唯一容器**（蓝图 `mountStrips` 的 R4 落位；08 §三·119 横排归一化）。
 *
 * 规矩（拍板）：
 *   - 内容超出可视一屏 → 显示同款左右圆钮＋原生横滑；不超一屏 → 箭头不显示（⛔ 死按钮）；
 *   - 点击翻页约一屏 85%；触控板横滑 / Shift+滚轮原生可用；⛔ 不劫持纵向滚轮；
 *   - 箭头 = absolute 覆层（显隐不动文档流——机械守则）；
 *   - 键盘 ←/→（焦点在卡上）滚动所在横排约 2 张卡宽。
 *
 * 变体：`rows2`（小卡恒两行·列优先，行高钉死） / `mega` / `duo`（大卡行余量做进 padding）。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../ui";

export type StripVariant = "plain" | "rows2" | "mega" | "duo";

export function Strip({
  children,
  variant = "plain",
  className,
  ariaLabel,
}: {
  children: ReactNode;
  variant?: StripVariant;
  className?: string;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [noOverflow, setNoOverflow] = useState(false);

  const sync = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    setNoOverflow(row.scrollWidth <= row.clientWidth + 1);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    sync();
    row.addEventListener("scroll", sync, { passive: true });

    /* 🔴 只有 hero 有「滚轮翻页」（任务口径）：横排容器 ⛔ 劫持纵向滚轮——
       否则用户被一页页翻完才能继续滚页面。触控板横滑/Shift+滚轮是浏览器原生，不拦。 */

    /* F28（用户裁决 2026-11-21）：peek 卡——悬停/聚焦时若卡片未完整可见（留 20px 展开余量），
       先吸附到完整可见再展开；吸附后 320ms 内不再触发，避免指针落到新卡上连跳。 */
    let snapLock = 0;
    const snap = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest<HTMLElement>(".marketplace-store-card, .marketplace-store-rank-row") : null;
      if (!el) return;
      const now = performance.now();
      if (now < snapLock) return;
      const r = el.getBoundingClientRect();
      const v = row.getBoundingClientRect();
      const pad = 20;
      let delta = 0;
      if (r.left < v.left + pad) delta = r.left - (v.left + pad);
      else if (r.right > v.right - pad) delta = r.right - (v.right - pad);
      if (Math.abs(delta) < 2) return;
      snapLock = now + 320;
      row.scrollBy({ left: delta, behavior: "smooth" });
    };
    const onOver = (ev: Event) => snap(ev.target);
    const onFocusIn = (ev: Event) => snap(ev.target);
    row.addEventListener("pointerover", onOver);
    row.addEventListener("focusin", onFocusIn);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sync);
      ro.observe(row);
    }
    return () => {
      row.removeEventListener("scroll", sync);
      row.removeEventListener("pointerover", onOver);
      row.removeEventListener("focusin", onFocusIn);
      ro?.disconnect();
    };
  }, [sync]);

  const step = () => Math.round((rowRef.current?.clientWidth ?? 0) * 0.85);
  const scroll = (dir: -1 | 1) => rowRef.current?.scrollBy({ left: dir * step(), behavior: "smooth" });

  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    const row = rowRef.current;
    if (!row) return;
    if (!ev.target || !(ev.target as HTMLElement).closest(".marketplace-store-card, .marketplace-store-rank-row")) return;
    const card = (ev.target as HTMLElement).closest(".marketplace-store-card, .marketplace-store-rank-row") as HTMLElement | null;
    const delta = (card ? card.getBoundingClientRect().width + 14 : 220) * 2;
    row.scrollBy({ left: (ev.key === "ArrowRight" ? 1 : -1) * delta, behavior: "smooth" });
    ev.preventDefault();
  };

  const variantClass = variant === "plain" ? "" : `is-${variant}`;
  return (
    <div className={`marketplace-store-strip ${noOverflow ? "is-no-overflow" : ""} ${className ?? ""}`.trim()}>
      <div
        ref={rowRef}
        className={`marketplace-store-strip-row ${variantClass}`.trim()}
        role="group"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
      <button
        type="button"
        className="marketplace-store-strip-arrow is-l"
        aria-label={t("左移")}
        onClick={() => scroll(-1)}
      >
        <Icon name="chevron-left" size="sm" />
      </button>
      <button
        type="button"
        className="marketplace-store-strip-arrow is-r"
        aria-label={t("右移")}
        onClick={() => scroll(1)}
      >
        <Icon name="chevron-right" size="sm" />
      </button>
    </div>
  );
}

export default Strip;
