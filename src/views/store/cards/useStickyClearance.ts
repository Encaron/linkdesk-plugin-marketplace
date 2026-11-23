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
 *
 * 🔴 2026-11-24 P0 修复（用户实机：顶行 hover 点 Update 时按钮下移，点击落到卡片→打开详情）：
 *   - **hover 会话内冻结几何**：pointerenter 算一次后不再因 focus/blur 重算；
 *   - 只在指针不在卡内时响应键盘 focus；onBlur 不因对话框抢焦点而复位；
 *   - 测量前临时 `.is-measuring` 强制展开（0fr→1fr），量完同 tick 撤销——两拍量到同一高度；
 *   - 离开（pointerleave）才复位。
 * 这样从 pointerenter 到点击之间，展开面（含动作按钮）不会在指针下移动。
 */
export function useStickyClearance<T extends HTMLElement>(
  options: StickyClearanceOptions = {},
) {
  const ref = useRef<T | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const pointerInsideRef = useRef(false);
  const frozenRef = useRef(false);
  const mode = options.mode ?? "expanded";
  const surfaceSelector = options.surfaceSelector ?? ".marketplace-store-x-more-inner";

  const apply = useCallback(() => {
    const el = ref.current;
    if (!el || frozenRef.current) return;
    // 先冻结：rAF 还没落地时再来 focus 也不再排第二帧
    frozenRef.current = true;

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

      const wrap = el.querySelector<HTMLElement>(".marketplace-store-x-more");
      const more = el.querySelector<HTMLElement>(surfaceSelector);
      // 确定性测量：临时强制展开，量 scrollHeight / rect 的最大值；同一 tick 撤销，不绘制。
      el.classList.add("is-measuring");
      const contentHeight = Math.max(
        more?.scrollHeight ?? 0,
        more?.getBoundingClientRect().height ?? 0,
        wrap?.scrollHeight ?? 0,
        wrap?.getBoundingClientRect().height ?? 0,
      );
      el.classList.remove("is-measuring");

      // 展开面高度 ≈ 卡片占位高（面至少与卡等高）＋ 新增内容高 ＋ 面内 gap
      const expandedHeight = card.height + contentHeight + 6;
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
    frozenRef.current = false;
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty("--x-shift");
    el.style.removeProperty("--clearance-y");
  }, []);

  const onPointerEnter = useCallback(() => {
    pointerInsideRef.current = true;
    reset(); // 清旧会话的冻结/位移，再按完全展开量一次
    apply();
  }, [apply, reset]);

  const onPointerLeave = useCallback(() => {
    pointerInsideRef.current = false;
    reset();
  }, [reset]);

  const onFocus = useCallback(() => {
    // 指针在卡内时，按钮 focus 不参与重算（点击瞬间不移动）；键盘 focus 才量。
    if (pointerInsideRef.current || frozenRef.current) return;
    apply();
  }, [apply]);

  const onBlur = useCallback(() => {
    // 对话框抢焦点会触发 blur——指针还在卡内时不得复位（否则按钮又跳）。
    if (pointerInsideRef.current) return;
    reset();
  }, [reset]);

  useEffect(() => reset, [reset]);

  return {
    ref,
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
  };
}
