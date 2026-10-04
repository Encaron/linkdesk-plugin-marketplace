/**
 * configLabel——市场「功能」页配置行上行取字（配置项短名案 T3／D3）。
 * 级联三档各钉一条：短名 → 说明 → 配置键；并钉住「两种原文都过 t()」（英文界面中文裸奔的根因）。
 */

import { describe, expect, it } from "vitest";
import { configLabel } from "../views/detail/DetailView/configLabel";

/** 译名表替身——同时记录被翻译过的原文，用来证明 t() 确实被调用（而不只是取值） */
function fakeT(map: Record<string, string> = {}) {
  const seen: string[] = [];
  const t = (s: string) => {
    seen.push(s);
    return map[s] ?? s;
  };
  return { t, seen };
}

describe("configLabel", () => {
  it("有短名（title）⇒ 用短名，且过 t()", () => {
    const { t, seen } = fakeT({ 自动保存: "Auto Save" });

    expect(configLabel({ title: "自动保存", description: "off 手动保存 / afterDelay…" }, "editor.autoSave", t)).toBe(
      "Auto Save",
    );
    expect(seen).toEqual(["自动保存"]);
  });

  it("无短名 ⇒ 回退说明（行为与改造前一致），同样过 t()", () => {
    const { t, seen } = fakeT({ 窗口圆角大小: "Window corner radius" });

    expect(configLabel({ description: "窗口圆角大小" }, "app.zoneRadiusScale", t)).toBe("Window corner radius");
    expect(seen).toEqual(["窗口圆角大小"]);
  });

  it("短名与说明都没有 ⇒ 配置键兜底（永不空白）", () => {
    const { t, seen } = fakeT();

    expect(configLabel(undefined, "ghost.key", t)).toBe("ghost.key");
    expect(configLabel({}, "ghost.key", t)).toBe("ghost.key");
    expect(seen).toEqual([]);
  });

  it("空串短名不算声明（形状不可信口径）——落到说明再落到键", () => {
    const { t } = fakeT();

    expect(configLabel({ title: "", description: "有说明" }, "k", t)).toBe("有说明");
    expect(configLabel({ title: "" }, "k", t)).toBe("k");
  });
});
