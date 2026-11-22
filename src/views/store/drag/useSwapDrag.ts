/**
 * useSwapDrag — 作者容器 / 仓库卡 / 来源行共用的**同一套 pointer 拖动控制器**
 * （19 §4.2 / §13.3；原型 HTML7 逐条对齐）。
 *
 * 语义：**交换**（目标卡高亮 + ⇄），⛔ 上下插入线。作者容器 ↔ 作者容器；仓卡/源行只在本作者内
 * 与目标交换；带 `data-swap-locked` 的（官方核心仓/本地组）不参与。
 *
 * 交互（与原型一致）：
 *   - 长按 380ms 进入拖动；提前移动 >6px = 原生文字选择/复制（不劫持单击）；
 *   - 整卡/整条 ghost 抬起跟随（半透明/模糊/阴影/1.015）；源条变暗；目标高亮；
 *   - 松手交换并短暂高亮；Esc 取消；拖到内容区上下边缘自动滚动；
 *   - 单击仍交给卡片自身（折叠/进仓/切换）。
 *
 * 键盘兜底由调用方渲染（Alt+↑/↓ 调 `sourceAdmin.swapRepos/swapAuthors`），本文件只管指针。
 * ⛔ 视图不得再写第二套拖动（浏览/管理共用本 hook）。
 */

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

export type DragKind = "author" | "repo";

export interface DragSpec {
  kind: DragKind;
  authorId: string;
  /** kind=repo 必填 */
  repoId?: string;
}

export interface SwapDragOptions {
  /** 返回 true = 已交换（ghost 飞向新位置并高亮）；false = 拒绝 */
  onSwap: (source: DragSpec, target: DragSpec) => Promise<boolean> | boolean;
  /** 跨作者（仓卡拖到别人家的卡上）等拒绝原因——调用方出轻 toast */
  onReject?: (reason: "cross-author" | "locked") => void;
  /** 自动滚动容器（商店内容区） */
  scrollRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export interface SwapDragBinding {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
}

interface ActiveDrag {
  spec: DragSpec;
  src: HTMLElement;
  startX: number;
  startY: number;
  active: boolean;
  timer: number | undefined;
  ghost?: HTMLElement;
  targetEl?: HTMLElement;
  crossAuthor: boolean;
}

const LONG_PRESS_MS = 380;
const MOVE_CANCEL_PX = 6;

function sameSpec(a: DragSpec, b: DragSpec): boolean {
  return a.kind === b.kind && a.authorId === b.authorId && (a.repoId ?? "") === (b.repoId ?? "");
}

function targetSelector(kind: DragKind): string {
  return kind === "author" ? '[data-swap-kind="author"]' : '[data-swap-kind="repo"]';
}

function findEl(spec: DragSpec): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(targetSelector(spec.kind));
  for (const node of nodes) {
    if (node.dataset.swapAuthor !== spec.authorId) continue;
    if (spec.kind === "repo" && node.dataset.swapRepo !== spec.repoId) continue;
    return node;
  }
  return null;
}

function suppressNextClick(): void {
  const handler = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener("click", handler, { capture: true, once: true });
  window.setTimeout(() => document.removeEventListener("click", handler, true), 300);
}

function clearTarget(drag: ActiveDrag): void {
  if (drag.targetEl) drag.targetEl.classList.remove("is-swap-target");
  drag.targetEl = undefined;
}

export function useSwapDrag(options: SwapDragOptions): {
  bind: (spec: DragSpec, opts?: { locked?: boolean }) => SwapDragBinding;
} {
  const optsRef = useRef(options);
  optsRef.current = options;
  const dragRef = useRef<ActiveDrag | null>(null);
  /** 事件回调放在 ref 里，避免每次 render 重绑 window 监听 */
  const handlersRef = useRef<{
    move?: (e: PointerEvent) => void;
    up?: (e: PointerEvent) => void;
    cancel?: () => void;
    key?: (e: KeyboardEvent) => void;
  }>({});

  const detach = useCallback(() => {
    const h = handlersRef.current;
    if (h.move) window.removeEventListener("pointermove", h.move);
    if (h.up) window.removeEventListener("pointerup", h.up);
    if (h.cancel) window.removeEventListener("pointercancel", h.cancel);
    if (h.key) window.removeEventListener("keydown", h.key);
    handlersRef.current = {};
  }, []);

  const cleanup = useCallback(
    (drag: ActiveDrag) => {
      if (drag.timer !== undefined) window.clearTimeout(drag.timer);
      drag.ghost?.remove();
      drag.src.classList.remove("is-drag-source");
      clearTarget(drag);
      document.body.classList.remove("is-swap-dragging");
      if (dragRef.current === drag) dragRef.current = null;
      detach();
    },
    [detach],
  );

  useEffect(() => {
    return () => {
      const drag = dragRef.current;
      if (drag) cleanup(drag);
    };
  }, [cleanup]);

  const updateTarget = useCallback((drag: ActiveDrag, clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const target = el?.closest<HTMLElement>(targetSelector(drag.spec.kind));
    if (!target || target === drag.src || target.hasAttribute("data-swap-locked")) {
      clearTarget(drag);
      return;
    }
    if (drag.spec.kind === "repo") {
      if (target.dataset.swapAuthor !== drag.spec.authorId) {
        drag.crossAuthor = true;
        clearTarget(drag);
        return;
      }
      drag.crossAuthor = false;
    }
    if (drag.targetEl === target) return;
    clearTarget(drag);
    drag.targetEl = target;
    target.classList.add("is-swap-target");
  }, []);

  const bind = useCallback(
    (spec: DragSpec, bindOpts: { locked?: boolean } = {}): SwapDragBinding => ({
      onPointerDown: (e) => {
        const opts = optsRef.current;
        if (opts.enabled === false || e.button !== 0 || dragRef.current) return;
        if (bindOpts.locked) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest("button,input,select,textarea,a,[contenteditable=true]")) return;
        const src = e.currentTarget;
        if (src.hasAttribute("data-swap-locked")) return;

        const drag: ActiveDrag = {
          spec,
          src,
          startX: e.clientX,
          startY: e.clientY,
          active: false,
          timer: undefined,
          crossAuthor: false,
        };
        dragRef.current = drag;

        const activate = () => {
          if (dragRef.current !== drag) return;
          drag.active = true;
          try {
            window.getSelection()?.removeAllRanges();
          } catch {
            /* 选择面不可用不影响拖动 */
          }
          document.body.classList.add("is-swap-dragging");
          const rect = src.getBoundingClientRect();
          const ghost = src.cloneNode(true) as HTMLElement;
          ghost.removeAttribute("id");
          ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
          for (const attr of [
            "data-swap-kind",
            "data-swap-author",
            "data-swap-repo",
            "data-swap-locked",
            "data-author",
          ]) {
            ghost.removeAttribute(attr);
          }
          ghost.classList.add("marketplace-swap-ghost");
          ghost.style.left = `${rect.left}px`;
          ghost.style.top = `${rect.top}px`;
          ghost.style.width = `${rect.width}px`;
          ghost.style.height = `${rect.height}px`;
          document.body.appendChild(ghost);
          drag.ghost = ghost;
          src.classList.add("is-drag-source");
        };

        const onMove = (ev: PointerEvent) => {
          if (dragRef.current !== drag) return;
          const dx = ev.clientX - drag.startX;
          const dy = ev.clientY - drag.startY;
          if (!drag.active) {
            if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) cleanup(drag);
            return;
          }
          ev.preventDefault();
          const sc = optsRef.current.scrollRef?.current;
          if (sc) {
            const r = sc.getBoundingClientRect();
            if (ev.clientY < r.top + 60) sc.scrollTop -= 18;
            else if (ev.clientY > r.bottom - 60) sc.scrollTop += 18;
          }
          if (drag.ghost) drag.ghost.style.transform = `translate(${dx}px, ${dy}px) scale(1.015)`;
          updateTarget(drag, ev.clientX, ev.clientY);
        };

        const onUp = () => {
          if (dragRef.current !== drag) return;
          if (!drag.active) {
            cleanup(drag);
            return;
          }
          suppressNextClick();
          const target = drag.targetEl;
          const crossAuthor = drag.crossAuthor;
          const ghost = drag.ghost;
          const srcEl = drag.src;
          const specNow = drag.spec;
          // 先收尾（保留 ghost 做落位动画）
          if (drag.timer !== undefined) window.clearTimeout(drag.timer);
          srcEl.classList.remove("is-drag-source");
          document.body.classList.remove("is-swap-dragging");
          clearTarget(drag);
          detach();
          dragRef.current = null;
          if (!target) {
            ghost?.remove();
            if (crossAuthor) optsRef.current.onReject?.("cross-author");
            return;
          }
          const targetSpec: DragSpec = {
            kind: specNow.kind,
            authorId: target.dataset.swapAuthor ?? "",
            ...(specNow.kind === "repo" ? { repoId: target.dataset.swapRepo ?? "" } : {}),
          };
          const finish = (ok: boolean) => {
            if (ok) {
              const newSelf = findEl(specNow);
              const newOther = findEl(targetSpec);
              if (newSelf) newSelf.classList.add("is-just-swapped");
              if (newOther) newOther.classList.add("is-just-swapped");
              window.setTimeout(() => {
                newSelf?.classList.remove("is-just-swapped");
                newOther?.classList.remove("is-just-swapped");
              }, 600);
            }
            if (ghost) {
              const dest = ok ? findEl(specNow)?.getBoundingClientRect() : undefined;
              if (dest) {
                ghost.style.transition =
                  "left .22s var(--ease, ease), top .22s var(--ease, ease), width .22s var(--ease, ease), height .22s var(--ease, ease), opacity .22s var(--ease, ease)";
                ghost.style.left = `${dest.left}px`;
                ghost.style.top = `${dest.top}px`;
                ghost.style.width = `${dest.width}px`;
                ghost.style.height = `${dest.height}px`;
                ghost.style.opacity = "0";
                window.setTimeout(() => ghost.remove(), 260);
              } else {
                ghost.style.transition = "opacity .15s";
                ghost.style.opacity = "0";
                window.setTimeout(() => ghost.remove(), 180);
              }
            }
          };
          Promise.resolve(optsRef.current.onSwap(specNow, targetSpec))
            .then(finish)
            .catch(() => finish(false));
        };

        const onCancel = () => {
          if (dragRef.current === drag) cleanup(drag);
        };

        const onKey = (ev: KeyboardEvent) => {
          if (ev.key === "Escape" && dragRef.current === drag) {
            ev.preventDefault();
            cleanup(drag);
          }
        };

        handlersRef.current = { move: onMove, up: onUp, cancel: onCancel, key: onKey };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
        // eslint-disable-next-line linkdesk/no-global-key-listener -- 仅在拖动会话内注册、pointerup/cancel/Esc 即摘；Esc 取消需在指针离开卡片时仍有效（focus 分区覆盖不到）
        window.addEventListener("keydown", onKey);
        drag.timer = window.setTimeout(activate, LONG_PRESS_MS);
      },
    }),
    [cleanup, detach, updateTarget],
  );

  return { bind };
}

/** 同项判定（调用方校验 swap 目标时复用） */
export { sameSpec as sameDragSpec };
