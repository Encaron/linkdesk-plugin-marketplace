import { describe, expect, it } from "vitest";
import { HOVER_GAP, HOVER_MAX_SHIFT, hoverShift } from "../views/store/cards/hoverClearance";

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
