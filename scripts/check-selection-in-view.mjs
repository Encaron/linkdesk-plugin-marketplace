#!/usr/bin/env node
/**
 * check-selection-in-view —— 「动作集合不得活在视图里」闸（2026-11-26）。
 *
 * ── 为什么需要它 ──
 *   库页那次实机 bug 的形状是：**统计头**用一份判据数出「3 个可更新」，**动作**又在视图里
 *   自己 `filter` 了一份（还多加了 `!core`）⇒ 两处判据漂移，点下去一个都不挑。
 *   本仓既有纪律是「筛选/排序/选择式归数据层，视图只渲染」（`libraryData.ts` 头注 10 §六）——
 *   这次是那条纪律被绕过。本闸把它变成机械判据：
 *
 *   🔴 判据：`src/views` 下 `.tsx` 的代码行里同时出现 `filter(`、`state`、`"update"` ⇒ 红。
 *      （`update` 目标集合是**动作入参**，必须来自 `libraryData.selectUpdateAllTargets`
 *      一类具名 selector；纯数据层 `.ts` 不在此列，它是允许的落点。）
 *
 * ── 边界（如实记）──
 *   · 只看 `.tsx`（视图）；`libraryData.ts` / `services/**` 是合法落点；
 *   · 行级启发式：换行拼起来的 filter 看不见；
 *   · 展示型筛选（按分类/来源）不触发（不含 `"update"`）。
 *
 * 用法：node scripts/check-selection-in-view.mjs [--self-test]
 * 挂点：`npm run verify` 链（CI 同一入口）。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 单行判定（纯函数）：视图里产出的 update 动作集合 */
export function isViolation(line) {
  const t = line.trim();
  if (!t || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
  return /filter\(/.test(t) && /\bstate\b/.test(t) && /["']update["']/.test(t);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function scan() {
  const hits = [];
  for (const file of walk(join(ROOT, "src", "views"))) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (isViolation(line)) hits.push(`${relative(ROOT, file).split(sep).join("/")}:${i + 1}  ${line.trim()}`);
    });
  }
  return hits;
}

function selfTest() {
  const bad = 'const picked = rows.filter((r) => r.state === "update" && !r.essential);';
  const good = "const picked = selectUpdateAllTargets(rows);";
  const displayFilter = 'const shown = rows.filter((r) => r.state === "disabled");';
  const comment = '// 不要在这里 filter((r) => r.state === "update")，选择式归数据层';
  const cases = [
    [bad, true],
    [good, false],
    [displayFilter, false],
    [comment, false],
  ];
  const failed = cases.filter(([line, want]) => isViolation(line) !== want);
  if (failed.length > 0) {
    console.error("❌ 自测未过：", failed.map(([l, w]) => `${JSON.stringify(l)} want=${w}`).join(" | "));
    process.exitCode = 1;
    return;
  }
  console.log("✅ check-selection-in-view 自测通过（负控：视图内 filter + state + \"update\" ⇒ 红；展示型筛选/注释 ⇒ 不红）");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const hits = scan();
  if (hits.length > 0) {
    console.error(`❌ 视图层出现「动作集合」选择式 ${hits.length} 条——必须下沉到 libraryData/services 的具名 selector：`);
    for (const h of hits) console.error(`  · ${h}`);
    process.exitCode = 1;
  } else {
    console.log("✅ 视图层零动作选择式（update 目标集只来自数据层 selector）。");
  }
}
