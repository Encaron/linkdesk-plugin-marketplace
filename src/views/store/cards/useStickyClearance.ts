import { useCallback, useEffect, useRef } from "react";
import { hoverShift } from "./hoverClearance";

/**
 * useStickyClearance — 把 hoverClearance 接到卡片上：hover/键盘聚焦时算一次下移量，
 * 写到卡片自己的 `--x-shift`（展开面 CSS 读它），离开即清除。
 *
 * 只改展开面的视觉位置，⛔ 不改卡片占位、不动滚动位。
 */
export function useStickyClearance<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  const apply = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const card = el.getBoundingClientRect();
    const store = el.closest(".marketplace-store") as HTMLElement | null;
    let clearanceBottom = 0;
    if (store) {
      for (const bar of store.querySelectorAll<HTMLElement>(".marketplace-store-sticky")) {
        const r = bar.getBoundingClientRect();
        if (r.top <= card.top + 1 && r.bottom > clearanceBottom) clearanceBottom = r.bottom;
      }
    }
    const more = el.querySelector<HTMLElement>(".marketplace-store-x-more-inner");
    // 展开面高度 ≈ 卡片占位高（面至少与卡等高）＋ 新增内容高 ＋ 面内 gap
    const expandedHeight = card.height + (more?.scrollHeight ?? 0) + 6;
    const shift = hoverShift(card.top, card.height, expandedHeight, clearanceBottom);
    if (shift > 0) el.style.setProperty("--x-shift", `${Math.round(shift)}px`);
    else el.style.removeProperty("--x-shift");
  }, []);

  const reset = useCallback(() => ref.current?.style.removeProperty("--x-shift"), []);

  useEffect(() => reset, [reset]);

  return {
    ref,
    onPointerEnter: apply,
    onPointerLeave: reset,
    onFocus: apply,
    onBlur: reset,
  };
}
