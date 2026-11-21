import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 圆角必须吃主题（2026-11-22 用户拍板 · 归一化门禁）
 *
 * 症状：卡片已经用 `var(--radius-*)`（主题「组件圆角」调多少它跟多少），但按钮/筛选/chips/吸顶条
 * 仍写死 8/9/12px ⇒ 用户把组件圆角调到 32px 时只有一半界面在变，看着像没适配。
 *
 * 机制：壳把 `--radius-xs/sm/md/lg/2xl/pill/full` 作为唯一圆角出口（app.surfaceRadius 会六档平铺）；
 * 插件一律 `var(--radius-*)`。形状语义：小控件 sm/md、组件 lg、大面 2xl、胶囊 pill、正圆 full。
 *
 * 门禁：market 仓库任何 CSS 的 `border-radius` 值不得出现字面 px / %；
 * 只允许 var(--radius-*) / 0 / inherit。
 */

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rel = (f: string) => relative(ROOT, f).replaceAll("\\", "/");

describe("圆角吃主题 token（不写死 px）", () => {
  it("所有 border-radius 值不得含字面 px/%（只允许 var(--radius-*) / 0 / inherit）", () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "src/styles"))) {
      if (file.endsWith(".map")) continue;
      const css = stripComments(readFileSync(file, "utf8"));
      for (const m of css.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
        const value = m[1].trim();
        const literal = /(^|[\s(])\d*\.?\d+(px|%)/.test(value);
        const allowed = value === "0" || value === "inherit" || /^[0\s]*(var\(--radius-[a-z0-9-]+\)\s*)+$/.test(value);
        if (literal && !allowed) offenders.push(`${rel(file)} → ${value}`);
      }
    }
    expect(offenders, "改用 var(--radius-xs/sm/md/lg/2xl/pill/full)——主题『组件圆角』才会生效").toEqual([]);
  });
});
