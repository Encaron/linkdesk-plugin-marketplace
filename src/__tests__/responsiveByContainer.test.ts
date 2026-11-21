import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 响应式按容器、不看窗口（2026-11-21 用户拍板 · 归一化门禁）
 *
 * 症状（反复出现十几轮）：分屏/浮动面板里，窗口很宽、面板很窄 ⇒ `@media (max-width)`
 * 永远不触发，商店保持桌面布局（rail 110 ＋ 内容 50）⇒ 告示条被挤成「一字一行」。
 *
 * 机制：壳的标签内容层 `.ldk-tab-content` 已是**尺寸容器**（`container-type: inline-size`，
 * 单面板与分屏都成立）。插件布局一律用 `@container` 按**自己所在面板宽**切换；
 * 门禁 = 商店 CSS 里出现 `@media (max-width…)` 即红（窗口宽不等于视图宽）。
 *
 * 例外：`@media (prefers-reduced-motion)` 等与宽度无关的媒体查询允许（本判据只看 max-width）。
 */
describe("商店响应式按容器（不看窗口）", () => {
  it("src/styles/store/*.css 不得出现 @media (max-width)", () => {
    const dir = join(process.cwd(), "src/styles/store");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".css"))
      .map((f) => ({ f, s: readFileSync(join(dir, f), "utf8") }))
      .filter(({ s }) => /@media\s*\(\s*max-width/i.test(s))
      .map(({ f }) => f);
    expect(offenders, "改用 @container (max-width: …)（宿主标签内容层是尺寸容器）").toEqual([]);
  });
});
