/**
 * ChunkedReveal — 大列表**分块渐进渲染**原语件（R4-5.3 / I2：500 条目推演——首屏只挂首块，滚到哪补到哪）。
 *
 * 为什么不是 react-window 真窗口化：消费方（OrderedCards / LibraryView）是「组头＋卡片」混排序列，
 * 行高不定、网格列数随宽度自适应——真窗口化要自算测量与绝对定位，回归风险大于收益（刚稳定的 UI 面）。
 * 分块渐进 = 虚拟化家族的轻量形态：**DOM 有界**（初始一块，向下滚动按块补）、零测量、组头/网格/列表
 * 全兼容、keep-alive 隐藏时不误触发（display:none 下 IO 不相交）。
 * 契约：items 换代（换筛选/排序/目录）⇒ 回到首块——调用方用 useMemo 保证 items 身份稳定
 * （⛔ 未 memo 化的数组每渲染新身份会把滚动进度清掉）；挂满即不再渲染哨兵。
 * IntersectionObserver 回调 setState 前不读可见性细节——补块判满交给 visible 上限钳制。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

/** 默认块大小——首屏 ~15 行卡片 DOM；500 条目 = 8 块渐进补齐 */
export const CHUNK_SIZE_DEFAULT = 60;

/** 哨兵提前量：距视口 640px 内就开始补块（约一屏＋一行的预载，滚动不露白） */
const SENTINEL_ROOT_MARGIN = "640px 0px";

export function ChunkedReveal<T>({
  items,
  renderItem,
  chunkSize = CHUNK_SIZE_DEFAULT,
}: {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  chunkSize?: number;
}) {
  const [visible, setVisible] = useState(() => Math.min(chunkSize, items.length));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // items 换代 → 回到首块（新查询不继承旧滚动进度；visible 同值时 React 自动 bail-out 零开销）
  useEffect(() => {
    setVisible(Math.min(chunkSize, items.length));
  }, [items, chunkSize]);

  // 哨兵进视口（含 640px 预载带）→ 补下一块；挂满不再挂哨兵 ⇒ 本 effect 空转
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visible >= items.length) return;
    // 无 IO 环境（jsdom 组件冒烟等）→ 全量渲染兜底（= 旧行为，冒烟断言零改动）
    if (typeof IntersectionObserver === "undefined") {
      setVisible(items.length);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + chunkSize, items.length));
        }
      },
      { rootMargin: SENTINEL_ROOT_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, items.length, chunkSize]);

  return (
    <>
      {items.slice(0, visible).map((item, i) => renderItem(item, i))}
      {/* 哨兵零样式零类名——空 div 零面积目标在 rootMargin 带内照样触发 IO（规格行为），不占视觉 */}
      {visible < items.length && <div ref={sentinelRef} aria-hidden="true" data-chunk-sentinel="true" />}
    </>
  );
}
