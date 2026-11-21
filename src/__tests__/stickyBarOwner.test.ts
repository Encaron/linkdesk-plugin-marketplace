import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 粘性条唯一实现（2026-11-22 用户拍板 · 归一化门禁）
 *
 * 症状：每个页面都想把操作区钉住——今天分类页、明天新加一个「杂货」分类页，各写一份
 * `position: sticky` / 自己算 `top` ⇒ 新页面就得再实现一遍，改一处漏三处。
 *
 * 机制：`src/views/store/StickyBar.tsx` 是**唯一实现**（位置/层级/底色/模糊/页头高度接续
 * 都在那一处）；页面只把自己的搜索/排序/筛选/chips 塞进去。
 *
 * 门禁：
 *   ① 全仓 CSS 的 `position: sticky` 只允许一处——`.marketplace-store-sticky`；
 *   ② TSX 不许 inline `position: "sticky"`；
 *   ③ `--marketplace-sticky-head` 只允许 StickyBar 自己写（页面 ⛔ 自己算页头高度）。
 */

const ROOT = process.cwd();

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
}

const rel = (f: string) => relative(ROOT, f).replaceAll("\\", "/");

/** 去掉 CSS 注释——注释里提到 position:sticky 不算实现 */
const stripCssComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

describe("粘性条唯一实现（StickyBar）", () => {
  it("store CSS 的 position: sticky 只允许两处：共享 StickyBar ＋ 库批量条（贴底，不是工具条）", () => {
    const dir = join(ROOT, "src/styles/store");
    const hits = readdirSync(dir)
      .filter((f) => f.endsWith(".css"))
      .map((f) => ({
        f: `src/styles/store/${f}`,
        n: (stripCssComments(readFileSync(join(dir, f), "utf8")).match(/position:\s*sticky/gi) ?? []).length,
      }))
      .filter((x) => x.n > 0)
      .sort((a, b) => a.f.localeCompare(b.f));
    expect(hits, "新页面要粘条请用 <StickyBar>（src/views/store/StickyBar.tsx），⛔ 再写一份 sticky").toEqual([
      { f: "src/styles/store/store-library.css", n: 1 }, // 编辑态批量条：贴底、随选择态出现，非工具条
      { f: "src/styles/store/store-shell.css", n: 1 }, // ← 共享 StickyBar 唯一实现
    ]);
    const shared = stripCssComments(readFileSync(join(dir, "store-shell.css"), "utf8"));
    expect(/\.marketplace-store-sticky\s*\{[^}]*position:\s*sticky/s.test(shared), "共享 sticky 必须属于 .marketplace-store-sticky").toBe(true);
  });

  it("TSX 不得 inline position: sticky", () => {
    const offenders = walk(join(ROOT, "src/views"), ".tsx")
      .filter((f) => /position\s*:\s*["']sticky["']/i.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders, "请包 <StickyBar>，⛔ 页面内联 sticky").toEqual([]);
  });

  it("页头高度变量只允许 StickyBar 写", () => {
    const offenders = walk(join(ROOT, "src/views"), ".tsx")
      .filter((f) => !f.endsWith("StickyBar.tsx"))
      .filter((f) => f.includes("--marketplace-sticky-head") && /setProperty\s*\(/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders, "接续位由 StickyBar 测量，⛔ 页面自己写 --marketplace-sticky-head").toEqual([]);
  });
});
