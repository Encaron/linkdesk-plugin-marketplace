import { describe, expect, it } from "vitest";
import { HOVER_GAP, HOVER_MAX_SHIFT, hoverShift, liftShift } from "../views/store/cards/hoverClearance";

describe("hoverShift —— 顶行卡片展开面避让吸顶条", () => {
  it("吸顶区在上方很远 → 不下移", () => {
    expect(hoverShift(300, 84, 150, 200)).toBe(0);
  });

  it("展开面上沿会越过吸顶底边 → 恰好推到底边下方 8px", () => {
    // 面上沿 = 200 + 42 - 75 = 167；吸顶底 180 → 需 180 + 8 - 167 = 21
    expect(hoverShift(200, 84, 150, 180)).toBe(21);
    const top = 200 + 84 / 2 - 150 / 2 + 21;
    expect(top).toBe(180 + HOVER_GAP);
  });

  it("上移量封顶，不因卡片被压太多而飞走", () => {
    expect(hoverShift(120, 84, 260, 700)).toBe(HOVER_MAX_SHIFT);
  });
});

describe("liftShift —— 放大卡（Mega/Duo）首排避让吸顶条", () => {
  it("放大后上沿仍在吸顶下方 → 不位移", () => {
    // 布局顶 300 / 高 100 / scale 1.14 / lift -3：放大上沿 190，吸顶底 180 → 0
    expect(liftShift(300, 100, 1.14, -3, 180)).toBe(0);
  });

  it("放大上沿越过吸顶底边 → 推到边下 8px", () => {
    // 布局顶 150 / 高 100：中心 197，放大半高 57，上沿 140；吸顶 180 → 48
    expect(liftShift(150, 100, 1.14, -3, 180)).toBe(48);
    const scaledTop = 150 + 100 / 2 - 3 - (100 * 1.14) / 2;
    expect(scaledTop + 48).toBe(180 + HOVER_GAP);
  });

  it("同样封顶", () => {
    expect(liftShift(120, 100, 1.14, -3, 700)).toBe(HOVER_MAX_SHIFT);
  });
});
