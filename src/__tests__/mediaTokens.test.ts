/**
 * 媒体 token 单源守卫（批次 A3/A7）。
 *
 * 纪律：比例/帧间淡入/轮播周期只许在 store-cards.css 定义一次；卡型/hero 一律 `var(--media-*)`。
 * 一旦有人在组件 CSS 里再写 `aspect-ratio: 16/9` 或 `12s`，这条当场红——「无硬编码」的机械兜底。
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS_DIR = join(process.cwd(), "src/styles/store");
const cssFiles = readdirSync(CSS_DIR).filter((f) => f.endsWith(".css"));
const read = (f: string): string => readFileSync(join(CSS_DIR, f), "utf8");

/** 去掉 CSS 注释——注释里举例的写法不算命中 */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");

describe("媒体 token（17 §3.3）", () => {
  it("四个 token 只在 store-cards.css 定义一次（单源）", () => {
    const defs = [...stripComments(read("store-cards.css")).matchAll(/--media-(hero|card|fade|cycle)\s*:/g)];
    expect(defs.map((m) => m[1]).sort()).toEqual(["card", "cycle", "fade", "hero"]);
    for (const f of cssFiles.filter((x) => x !== "store-cards.css")) {
      const body = stripComments(read(f));
      expect(/--media-(hero|card|fade|cycle)\s*:/.test(body), `${f} 不得重定义媒体 token`).toBe(false);
    }
  });

  it("所有 aspect-ratio 都引用媒体 token（⛔ 魔法比例）", () => {
    for (const f of cssFiles) {
      const lines = stripComments(read(f)).split("\n").filter((l) => /aspect-ratio\s*:/.test(l));
      const offenders = lines.filter((l) => !/var\(--media-/.test(l));
      expect(offenders, `${f}：aspect-ratio 必须用 var(--media-hero/card)`).toEqual([]);
    }
  });

  it("网格是尺寸容器（A7：新卡按容器宽降档，不看窗口）", () => {
    const body = stripComments(read("store-browse.css"));
    expect(/\.marketplace-store-grid\s*{[^}]*container-type\s*:\s*inline-size/.test(body)).toBe(true);
  });

  it("prefers-reduced-motion 下轮播静止（B5：始终封面帧）", () => {
    const body = stripComments(read("store-cards.css"));
    expect(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.marketplace-store-art-frame\s*\{[^}]*animation:\s*none\s*!important/.test(body),
    ).toBe(true);
  });
});
