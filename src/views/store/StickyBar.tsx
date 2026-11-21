/**
 * StickyBar — 商店内**粘性条的唯一实现**（页头 / 分类·搜索·库·作者的工具栏 / 来源的添加入口）。
 *
 * 为什么要一件：各页都要「滚内容时把操作区钉住」，但条里的东西各不相同（搜索、排序、筛选、
 * 小类 chips…）。**机制共享、内容私有**：位置/层级/底色/模糊/高度接续只在这里写一次，
 * 各页只把自己的内容塞进来。⛔ 页面里不许再出现 `position: sticky` / 自己算 `top`。
 *
 * 两种落位：
 *   - `placement="head"`：贴内容区顶部（top:0），并把自己的实际高度写进
 *     `--marketplace-sticky-head`——页头在窄窗换行变高时，下面的工具条自动接续，不用各页猜数字。
 *   - `placement="tools"`（默认）：贴页头下沿（top: 页头实测高度）。
 *
 * `group` 形态用于同页多行（如分类页：过滤条＋工具行＋小类 chips）：外层一条粘性面、
 * 内部纵向排布，子项间距统一由这里给，⛔ 子项自己留 margin。
 */

import { useEffect, useRef, type ReactNode } from "react";

export function StickyBar({
  placement = "tools",
  group = false,
  className = "",
  children,
}: {
  placement?: "head" | "tools";
  group?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  /* 页头高度 = 工具条接续位的唯一来源（ResizeObserver 跟换行/字号变化） */
  useEffect(() => {
    if (placement !== "head") return;
    const el = ref.current;
    const host = el?.closest(".marketplace-store") as HTMLElement | null;
    if (!el || !host) return;
    const sync = () => {
      host.style.setProperty("--marketplace-sticky-head", `${Math.round(el.getBoundingClientRect().height)}px`);
    };
    sync();
    // 测试环境（jsdom）无 ResizeObserver：只做首帧测量，不影响断言
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.removeProperty("--marketplace-sticky-head");
    };
  }, [placement]);

  /* 贴合瞬间的「咔」：工具条从下方贴到页头下沿那一下——只压缩自己的上沿（top 边钉死，
     ⛔ 不移动页头，否则接缝会张开漏光），＋接缝一条瞬时亮线快速熄灭。约 120ms 一次落定。
     ⛔ 无回弹/无循环；首帧已贴着不响；只有「向下滚 + 从未贴到贴上」才算碰撞。
     reduced-motion 由 CSS 直接关掉动画。 */
  useEffect(() => {
    if (placement !== "tools") return;
    const el = ref.current;
    const host = el?.closest(".marketplace-store") as HTMLElement | null;
    const scroller = el?.closest(".marketplace-store-content") as HTMLElement | null;
    if (!el || !host || !scroller) return;

    let raf = 0;
    let timer = 0;
    let prevStuck: boolean | null = null;
    let lastTop = scroller.scrollTop;

    const stuckNow = () => {
      const headH = parseFloat(getComputedStyle(host).getPropertyValue("--marketplace-sticky-head")) || 0;
      const base = scroller.getBoundingClientRect().top + headH;
      return el.getBoundingClientRect().top <= base + 1;
    };

    const measure = () => {
      raf = 0;
      const top = scroller.scrollTop;
      const down = top > lastTop;
      lastTop = top;
      const stuck = stuckNow();
      if (prevStuck === null) {
        prevStuck = stuck;
        return;
      }
      if (!prevStuck && stuck && down) {
        el.classList.remove("is-docked");
        void el.offsetWidth; // 强制回流：同一 class 在快速反复贴合时也能重播动画
        el.classList.add("is-docked");
        clearTimeout(timer);
        timer = window.setTimeout(() => el.classList.remove("is-docked"), 140);
      }
      prevStuck = stuck;
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    prevStuck = stuckNow();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(timer);
      el.classList.remove("is-docked");
    };
  }, [placement]);

  return (
    <div
      ref={ref}
      className={`marketplace-store-sticky ${placement === "head" ? "is-head" : ""} ${group ? "is-group" : ""} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
    >
      {children}
    </div>
  );
}

export default StickyBar;
