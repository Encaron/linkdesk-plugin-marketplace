/**
 * 媒体归一化守卫（C7/C9）——防「第二套轮播 / 第二套媒体读取 / 新卡自建控件」。
 *
 * 判据都是**静态可证**的：
 *   ① 卡文件里没有 JS 定时器（轮播只有 CSS keyframes）；
 *   ② keyframes 只在 store-cards.css 定义一次，`--media-cycle` 只有一处；
 *   ③ 视图层只有 mediaModel / cardParts 读 `screenshots/cover`（详情也走 mediaOf）；
 *   ④ 新卡（wall）只 import 共享件，不自读媒体、不自拼 action/corner。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const relOf = (p: string): string => p.slice(ROOT.length + 1).split("\\").join("/");

describe("C7 轮播唯一机制", () => {
  it("卡文件没有 JS 定时器（轮播只走 CSS keyframes）", () => {
    const files = walk(join(ROOT, "src/views/store/cards")).filter((p) => !/\.test\./.test(p));
    const offenders = files.filter((p) => /\bsetInterval\b|\bsetTimeout\b/.test(strip(readFileSync(p, "utf8")))).map(relOf);
    expect(offenders).toEqual([]);
  });

  it("2/3 帧 keyframes 只在 store-cards.css 定义，且各一次", () => {
    const css = strip(read("src/styles/store/store-cards.css"));
    for (const name of ["media2a", "media2b", "media3a", "media3b", "media3c"]) {
      expect(css.match(new RegExp(`@keyframes marketplace-store-${name}`, "g"))?.length).toBe(1);
    }
    const others = readdirSync(join(ROOT, "src/styles/store"))
      .filter((f) => f.endsWith(".css") && f !== "store-cards.css")
      .filter((f) => /@keyframes\s+marketplace-store-media/.test(strip(read(`src/styles/store/${f}`))));
    expect(others).toEqual([]);
  });

  it("卡型只用 Art（不各自 import mediaOf / 不各自写 stage）", () => {
    for (const f of ["CardMega.tsx", "CardDuo.tsx", "variants/CardWall.tsx"]) {
      const src = strip(read(`src/views/store/cards/${f}`));
      expect(src).toContain("Art");
      expect(src).not.toContain("mediaOf(");
      expect(src).not.toContain("marketplace-store-art-gen");
    }
  });
});

describe("C9 单一媒体读取面", () => {
  it("视图层只有 mediaModel / cardParts 读 screenshots / cover", () => {
    const files = walk(join(ROOT, "src/views")).filter((p) => !/\.test\./.test(p));
    const allowed = new Set(["src/views/store/cards/mediaModel.ts", "src/views/store/cards/cardParts.tsx"]);
    /** 允许的类型引用（不读值）：详情 hook 只 import MediaModel 类型与 mediaOf */
    const offenders = files.filter((p) => {
      const rel = relOf(p);
      if (allowed.has(rel)) return false;
      const src = strip(readFileSync(p, "utf8"));
      return /\bscreenshots\b|\.cover\b/.test(src);
    }).map(relOf);
    expect(offenders).toEqual([]);
  });

  it("新卡 CardWall 只 import 共享件；不自读媒体、不自拼按钮/角标", () => {
    const src = strip(read("src/views/store/cards/variants/CardWall.tsx"));
    expect(src).toContain('from "../cardParts"');
    expect(src).toContain("ActionButton");
    expect(src).toContain("CornerTag");
    expect(src).toContain("MoreMenu");
    expect(src).not.toMatch(/\bscreenshots\b|\.cover\b/);
    expect(src).not.toContain("<button");
    expect(src).not.toContain("mediaOf(");
  });

  it("新卡文件不在 cards/ 平铺（必须在 variants/ 子目录）", () => {
    const flat = readdirSync(join(ROOT, "src/views/store/cards")).filter((f) => f.endsWith(".tsx"));
    expect(flat).not.toContain("CardWall.tsx");
    expect(read("src/views/store/cards/variants/CardWall.tsx")).toContain("CardWall");
  });

  it("F8 几何防线：wall/split 的 hover 规则不改文档流（只 transform/opacity/pointer-events）", () => {
    const css = strip(read("src/styles/store/store-cards.css"));
    const blocks = css.match(/[^{}]*\.is-(wall|split)[^{}]*:hover[^{}]*\{[^}]*\}/g) ?? [];
    for (const block of blocks) {
      const body = block.slice(block.indexOf("{") + 1, block.lastIndexOf("}"));
      const bad = body
        .split(";")
        .map((line) => line.split(":")[0]!.trim())
        .filter((prop) => /^(height|min-height|max-height|width|margin|padding|top|left|right|bottom|display|grid-template)/.test(prop));
      expect(bad, block.slice(0, 80)).toEqual([]);
    }
    // hover 不 setState（滚动位不丢）——新卡没有 React 状态
    const wall = strip(read("src/views/store/cards/variants/CardWall.tsx"));
    expect(/\buseState\b|\bsetState\b/.test(wall)).toBe(false);
  });
});
