import { useCallback, useEffect, useRef } from "react";
import { hoverShift, liftShift } from "./hoverClearance";

export interface StickyClearanceOptions {
  /**
   * expanded = 卡片有向上长出的展开面（写 `--x-shift`，现有 small/grid）；
   * lift = 卡片只做 scale/lift（写 `--clearance-y`，Mega/Duo 这类首排）。
   */
  mode?: "expanded" | "lift";
  /** expanded 模式要量的展开内容；默认 `.marketplace-store-x-more-inner` */
  surfaceSelector?: string;
}

/**
 * useStickyClearance — 把 hoverClearance 接到卡片上：hover/键盘聚焦时算一次避让量，
 * 离开即清除。只改视觉位移，⛔ 不改卡片占位、不动滚动位。
 */
export function useStickyClearance<T extends HTMLElement>(
  options: StickyClearanceOptions = {},
) {
  const ref = useRef<T | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const mode = options.mode ?? "expanded";
  const surfaceSelector = options.surfaceSelector ?? ".marketplace-store-x-more-inner";

  const apply = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const run = () => {
      const card = el.getBoundingClientRect();
      const store = el.closest(".marketplace-store") as HTMLElement | null;
      let clearanceBottom = 0;
      if (store) {
        for (const bar of store.querySelectorAll<HTMLElement>(".marketplace-store-sticky")) {
          const r = bar.getBoundingClientRect();
          if (r.top <= card.top + 1 && r.bottom > clearanceBottom) clearanceBottom = r.bottom;
        }
      }

      if (mode === "lift") {
        // 读声明表，不读 transform：CSS hover 已经生效时 rect 是放大后的，先还原布局顶边。
        const cs = getComputedStyle(el);
        const scale = Number.parseFloat(cs.getPropertyValue("--surface-scale")) || 1;
        const lift = Number.parseFloat(cs.getPropertyValue("--surface-lift")) || 0;
        const h = el.offsetHeight || card.height;
        const layoutTop = card.top - lift + (h * (scale - 1)) / 2;
        const shift = liftShift(layoutTop, h, scale, lift, clearanceBottom);
        if (shift > 0) el.style.setProperty("--clearance-y", `${Math.round(shift)}px`);
        else el.style.removeProperty("--clearance-y");
        return;
      }

      const more = el.querySelector<HTMLElement>(surfaceSelector);
      // 展开面高度 ≈ 卡片占位高（面至少与卡等高）＋ 新增内容高 ＋ 面内 gap
      const expandedHeight = card.height + (more?.scrollHeight ?? 0) + 6;
      const shift = hoverShift(card.top, card.height, expandedHeight, clearanceBottom);
      if (shift > 0) el.style.setProperty("--x-shift", `${Math.round(shift)}px`);
      else el.style.removeProperty("--x-shift");
    };

    if (mode === "lift") {
      // 等 hover/focus 的 transform 落地再量，否则拿到的是布局态会重复补偿。
      frameRef.current = window.requestAnimationFrame(run);
    } else {
      run();
    }
  }, [mode, surfaceSelector]);

  const reset = useCallback(() => {
    if (frameRef.current !== undefined) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty("--x-shift");
    el.style.removeProperty("--clearance-y");
  }, []);

  useEffect(() => reset, [reset]);

  return {
    ref,
    onPointerEnter: apply,
    onPointerLeave: reset,
    onFocus: apply,
    onBlur: reset,
  };
}
