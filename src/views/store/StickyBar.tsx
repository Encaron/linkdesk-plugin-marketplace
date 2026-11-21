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
