import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 内容面可读性 token（2026-11-22）：承载文字的卡片/浮层/媒体遮罩只能吃
 * `--surface-reading*` / `--surface-media-scrim`，⛔ 不能再把环境玻璃 `--bg-card`/`--bg-window`
 * 二次叠透（玻璃 α 0.38–0.54 时会把正文一起透没）。只做高影响选择器的机械钉。
 */

const ROOT = process.cwd();
const css = (rel: string) => readFileSync(join(ROOT, "src/styles/store", rel), "utf8");

function block(source: string, selector: string): string {
  const at = source.indexOf(selector);
  expect(at, `缺少选择器 ${selector}`).toBeGreaterThanOrEqual(0);
  return source.slice(at, source.indexOf("}", at));
}

describe("商店内容面吃可读性 token", () => {
  it("基础卡 / 展开面 / Mega 条 / Wall 浮层 / Hero scrim / 作者坞面板", () => {
    expect(block(css("store-cards.css"), ".marketplace-store-x-over {")).toContain("var(--bg-card)");
    expect(block(css("store-cards.css"), ".marketplace-store-cm-band {")).toContain("var(--surface-reading-strong)");
    expect(block(css("store-cards.css"), ".marketplace-store-cw-hover {")).toContain("var(--surface-media-scrim)");
    expect(block(css("store-home.css"), ".marketplace-store-hero-slide::after {")).toContain("var(--surface-media-scrim)");
  });

  it("内容面不再直接吃环境玻璃 token", () => {
    for (const [file, selector] of [
      ["store-cards.css", ".marketplace-store-cm-band {"],
      ["store-cards.css", ".marketplace-store-cw-hover {"],
      ["store-home.css", ".marketplace-store-hero-slide::after {"],
    ] as const) {
      const b = block(css(file), selector);
      expect(b, `${selector} 仍直接引用环境玻璃`).not.toMatch(/var\(--bg-(card|window)\)/);
    }
  });
});
