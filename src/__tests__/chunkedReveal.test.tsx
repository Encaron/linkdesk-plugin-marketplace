/**
 * ChunkedReveal 分块渐进原语件单测（R4-5.3 / I2）。
 * jsdom 无 IntersectionObserver ⇒ 捕获式替身：构造时抓回调，测试里手动触发「哨兵相交」。
 * fixture 全虚构（硬约束 21）：条目 id 用 p0…pN 虚构值。
 */

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChunkedReveal, CHUNK_SIZE_DEFAULT } from "../ui/ChunkedReveal";

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let lastCallback: IOCallback | null = null;

class IOStub {
  constructor(cb: IOCallback) {
    lastCallback = cb;
  }
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}

const fire = () =>
  act(() => {
    lastCallback?.([{ isIntersecting: true }]);
  });

const mkItems = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

beforeEach(() => {
  lastCallback = null;
  vi.stubGlobal("IntersectionObserver", IOStub as unknown);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChunkedReveal（R4-5.3/I2 分块渐进）", () => {
  it("首屏只挂首块＋哨兵在场", () => {
    const { container, getByText, queryByText } = render(
      <ChunkedReveal items={mkItems(250)} renderItem={(it) => <div key={it.id}>{it.id}</div>} />,
    );
    expect(getByText("p0")).toBeTruthy();
    expect(getByText(`p${CHUNK_SIZE_DEFAULT - 1}`)).toBeTruthy();
    expect(queryByText(`p${CHUNK_SIZE_DEFAULT}`)).toBeNull();
    expect(container.querySelector("[data-chunk-sentinel]")).toBeTruthy();
  });

  it("哨兵相交补一块；补满后哨兵退场", () => {
    const { container, getByText, queryByText } = render(
      <ChunkedReveal items={mkItems(250)} renderItem={(it) => <div key={it.id}>{it.id}</div>} />,
    );
    fire();
    expect(getByText(`p${CHUNK_SIZE_DEFAULT * 2 - 1}`)).toBeTruthy();
    for (let i = 0; i < 6; i++) fire(); // 60→120→180→240→250（钳制）
    expect(getByText("p249")).toBeTruthy();
    expect(container.querySelector("[data-chunk-sentinel]")).toBeNull();
  });

  it("不相交不补块（IO 只认 isIntersecting）", () => {
    const { getByText, queryByText } = render(
      <ChunkedReveal items={mkItems(200)} renderItem={(it) => <div key={it.id}>{it.id}</div>} />,
    );
    act(() => {
      lastCallback?.([{ isIntersecting: false }]);
    });
    expect(queryByText(`p${CHUNK_SIZE_DEFAULT}`)).toBeNull();
    expect(getByText(`p${CHUNK_SIZE_DEFAULT - 1}`)).toBeTruthy();
  });

  it("短于一块的清单一次挂满、无哨兵", () => {
    const { container, getByText } = render(
      <ChunkedReveal items={mkItems(5)} renderItem={(it) => <div key={it.id}>{it.id}</div>} />,
    );
    expect(getByText("p4")).toBeTruthy();
    expect(container.querySelector("[data-chunk-sentinel]")).toBeNull();
    expect(lastCallback).toBeNull(); // 挂满 ⇒ 不建 IO（effect 空转）
  });

  it("items 换代（换筛选）→ 回到首块——新查询不继承旧滚动进度", () => {
    const first = mkItems(250);
    const { rerender, getByText, queryByText } = render(
      <ChunkedReveal items={first} renderItem={(it) => <div key={it.id}>{it.id}</div>} />,
    );
    fire();
    expect(getByText(`p${CHUNK_SIZE_DEFAULT * 2 - 1}`)).toBeTruthy();
    const second = mkItems(250).map((x, i) => ({ id: `q${i}` }));
    rerender(<ChunkedReveal items={second} renderItem={(it) => <div key={it.id}>{it.id}</div>} />);
    expect(getByText("q0")).toBeTruthy();
    expect(queryByText(`q${CHUNK_SIZE_DEFAULT}`)).toBeNull();
  });
});
