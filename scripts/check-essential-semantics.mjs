#!/usr/bin/env node
/**
 * check-essential-semantics —— 「重要型」旗标的**语义射程闸**（2026-11-26 语义二分）。
 *
 * ── 为什么需要它 ──
 *   旧旗标 `core` 同时被读成「随包 / 内置 / 不可卸载」，市场据此判过「能不能更新」：
 *   `rows.filter((r) => r.state === "update" && !r.core)` ⇒ 待更新恰好全是随包件时整批被排空，
 *   「全部更新」谎报「所有插件已是最新」（marketplace 1.4.39 修）。旗标已改名 `essential`
 *   并把语义收窄为**只影响卸载入口可见性**，本闸把这条收窄变成机械事实：
 *
 *   🔴 判据：`essential` 与更新域词汇（update / updatable / updateTargetFor / state === "update"）
 *      出现在**同一行代码** ⇒ 红。改旗标名不解决问题，只有「不许参与更新判定」才是定论。
 *
 * ── 边界（如实记）──
 *   · 只扫 `src/**`，跳过 `__tests__`（夹具可以造任意形态）；
 *   · 只扫**代码行**（`//`、`*`、`/*` 开头的注释行豁免）——注释里解释「不参与更新」是合法的；
 *   · 行级启发式：跨行拼出来的误用看不见（例如先算集合再判），那种靠评审与测试模板兜。
 *
 * 用法：node scripts/check-essential-semantics.mjs [--self-test]
 * 挂点：`npm run verify` 链（CI 同一入口）。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPDATE_WORDS = /\b(update|updatable|updateTargetFor)\b|["']update["']/i;

/** 单行判定（纯函数，自测直测）：返回是否违规 */
export function isViolation(line) {
  const t = line.trim();
  if (!t || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
  if (!t.includes("essential")) return false;
  if (!UPDATE_WORDS.test(t)) return false;
  // 只有「判定算子」才算参与判定：投影/解构是把宿主事实原样搬运
  // （`{ updatable: p.updatable, essential: p.essential }` / `const { essential, updatable } = row`）
  return /&&|\|\||if\s*\(|(?<!!)!(?!=)|(?<!\?)\?(?!\?)/.test(t);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function scan() {
  const hits = [];
  for (const file of walk(join(ROOT, "src"))) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (isViolation(line)) hits.push(`${relative(ROOT, file).split(sep).join("/")}:${i + 1}  ${line.trim()}`);
    });
  }
  return hits;
}

function selfTest() {
  const bad = 'rows.filter((r) => r.state === "update" && !r.essential);';
  const good = "if (row.essential) return { kind: \"core\", key: \"内置\" };";
  const comment = "// essential 不参与更新判定（update/updatable 与此无关）";
  const updatable = "const x = row.essential && row.updatable;";
  const projection = 'm.set(id, { version: p.version, updatable: p.updatable, essential: p.essential });';
  const destructure = "const { id, name, version, essential, updatable, disabled } = row;";
  const cases = [
    [bad, true],
    [good, false],
    [comment, false],
    [updatable, true],
    [projection, false],
    [destructure, false],
  ];
  const failed = cases.filter(([line, want]) => isViolation(line) !== want);
  if (failed.length > 0) {
    console.error("❌ 自测未过：", failed.map(([l, w]) => `${JSON.stringify(l)} want=${w}`).join(" | "));
    process.exitCode = 1;
    return;
  }
  console.log("✅ check-essential-semantics 自测通过（负控：update+essential 同行 ⇒ 红；正控：仅卸载可见性/注释 ⇒ 不红）");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const hits = scan();
  if (hits.length > 0) {
    console.error(`❌ essential 语义射程违规 ${hits.length} 条——该旗标只允许影响卸载入口可见性，⛔ 不得参与更新判定：`);
    for (const h of hits) console.error(`  · ${h}`);
    process.exitCode = 1;
  } else {
    console.log("✅ essential 语义射程：更新域零消费（只用于卸载入口可见性）。");
  }
}
