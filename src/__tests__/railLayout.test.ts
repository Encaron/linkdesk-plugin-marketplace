import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * rail 紧凑行布局契约（2026-11-23 实机回归）：
 * 英文「Author」+ 数字 + 黄点超宽时，点被挤出胶囊；中文「作者」被挤成竖排。
 * 根因 = compact 行没有 nowrap/省略，数字 margin-left:auto 把点顶到边界，点从 absolute 改 static
 * 后没有预留位置。本测试钉住三条不变量——改回去 = 红。
 */
const CSS = readFileSync(resolve(process.cwd(), "src/styles/store/store-shell.css"), "utf8");

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, " ");
  const m = CSS.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`找不到规则：${selector}`);
  return m[1];
}

describe("rack rail compact 布局契约", () => {
  it("compact 行禁止换行（中文作者不竖排）", () => {
    const b = block(".marketplace-store-rail-item.is-compact");
    expect(b).toContain("flex-wrap: nowrap");
    expect(b).toContain("white-space: nowrap");
  });

  it("标签槽不依赖省略号（英文 Author 完整显示）", () => {
    const b = block(".marketplace-store-rail-item.is-compact .marketplace-store-rail-text");
    expect(b).toContain("min-width: 0");
    expect(b).toContain("text-overflow: clip");
    expect(b).not.toContain("text-overflow: ellipsis");
    expect(b).toContain("white-space: nowrap");
  });

  it("窄容器 rail 宽度足够（128px）——Library/Author + 计数 + 点全部放得下", () => {
    expect(CSS).toMatch(/@container \(max-width: 1080px\)[\s\S]*?\.marketplace-store-rail\s*\{\s*width:\s*128px/);
  });

  it("数字与点不参与收缩（点始终在胶囊内）", () => {
    expect(block(".marketplace-store-rail-item.is-compact .marketplace-store-rail-count")).toContain("flex: none");
    const dot = block(".marketplace-store-rail-item.is-compact .marketplace-store-rail-dot");
    expect(dot).toContain("position: static");
    expect(dot).toContain("flex: none");
  });
});
