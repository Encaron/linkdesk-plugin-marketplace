/**
 * useStickyClearance —— P0 修复的几何契约：
 *   hover 会话内冻结；focus/blur 不再重算；pointerleave 才复位。
 *
 * jsdom 没有布局，故给 card / sticky / 展开面显式 mock getBoundingClientRect；
 * 断言 = `--x-shift` 在 pointerenter 后、focus/blur 后都保持同一值，pointerleave 清空。
 */

import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useStickyClearance } from "../views/store/cards/useStickyClearance";

const rect = (top: number, height: number): DOMRect =>
  ({
    top,
    left: 0,
    right: 0,
    bottom: top + height,
    width: 0,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

function mountCard() {
  const store = document.createElement("div");
  store.className = "marketplace-store";
  const sticky = document.createElement("div");
  sticky.className = "marketplace-store-sticky";
  const card = document.createElement("div");
  card.className = "marketplace-store-card is-grid";
  const over = document.createElement("div");
  over.className = "marketplace-store-x-over";
  const wrap = document.createElement("div");
  wrap.className = "marketplace-store-x-more";
  const inner = document.createElement("div");
  inner.className = "marketplace-store-x-more-inner";
  wrap.appendChild(inner);
  over.appendChild(wrap);
  card.appendChild(over);
  store.appendChild(sticky);
  store.appendChild(card);
  document.body.appendChild(store);

  sticky.getBoundingClientRect = () => rect(0, 40);
  card.getBoundingClientRect = () => rect(100, 100);
  wrap.getBoundingClientRect = () => rect(100, 200);
  inner.getBoundingClientRect = () => rect(100, 200);
  return { store, card };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("useStickyClearance（P0 冻结几何）", () => {
  it("pointerenter 算一次；focus / blur 不重算；pointerleave 才清空", () => {
    const { store, card } = mountCard();
    const { result } = renderHook(() => useStickyClearance<HTMLDivElement>());

    act(() => {
      result.current.ref.current = card;
      result.current.onPointerEnter();
    });
    // 100 顶 + 100 高；展开面 100 + 200 + 6；吸顶底 40 + 8 - (-3) = 51
    expect(card.style.getPropertyValue("--x-shift")).toBe("51px");

    act(() => result.current.onFocus());
    expect(card.style.getPropertyValue("--x-shift")).toBe("51px");

    act(() => result.current.onBlur());
    expect(card.style.getPropertyValue("--x-shift")).toBe("51px");

    act(() => result.current.onPointerLeave());
    expect(card.style.getPropertyValue("--x-shift")).toBe("");

    store.remove();
  });

  it("无指针的键盘 focus 仍能量；blur 后清空", () => {
    const { store, card } = mountCard();
    const { result } = renderHook(() => useStickyClearance<HTMLDivElement>());

    act(() => {
      result.current.ref.current = card;
      result.current.onFocus();
    });
    expect(card.style.getPropertyValue("--x-shift")).toBe("51px");

    act(() => result.current.onBlur());
    expect(card.style.getPropertyValue("--x-shift")).toBe("");

    store.remove();
  });

  it("测量期间临时加 is-measuring，量完即撤（不把测量态留在 DOM）", () => {
    const { store, card } = mountCard();
    const { result } = renderHook(() => useStickyClearance<HTMLDivElement>());

    act(() => {
      result.current.ref.current = card;
      result.current.onPointerEnter();
    });
    expect(card.classList.contains("is-measuring")).toBe(false);

    store.remove();
  });
});
