/**
 * 目录/作者数据的**显示文本解析**回归尺。
 *
 * 2026-11-24 用户连续实机：英文界面里「官方精选 / 全部主题 / 官方目录」仍是中文。
 * 根因不是字典缺，而是视图把 `title={r.name}` / `tag: banner.title` / `more.label`
 * 当普通字符串直接渲染——修一处又漏一处。本测试把「作者/仓库/合集显示字段必须走 lt()」
 * 钉成机械断言，防止再靠人眼找。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const VIEWS = join(SRC, "views", "store");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** 裸读目录/作者显示字段的形态（应当走 lt(entity, field)）。 */
const FORBIDDEN: Array<{ re: RegExp; why: string }> = [
  { re: /title=\{r\.name\}/, why: "仓库卡标题必须 lt(r, 'name')" },
  { re: /intro=\{r\.intro\}/, why: "仓库卡说明必须 lt(r, 'intro')" },
  { re: /tag:\s*banner\.title/, why: "Hero 标签必须 lt(banner, 'title')" },
  { re: /label\s*=\s*collection\.more\?\.label/, why: "合集 More 必须 lt(collection.more, 'label')" },
  { re: /pluginName:\s*entry\.name/, why: "许可弹窗插件名必须 lt(entry, 'name')" },
  { re: /\{t\(entry\.name\)\}/, why: "禁止用 t() 碰运气翻目录名——走 lt(entry, 'name')" },
];

describe("目录/作者显示文本（英文界面混中文防复发）", () => {
  const files = walk(VIEWS);

  it("视图里不存在裸读目录/作者显示字段", () => {
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const { re, why } of FORBIDDEN) {
        if (re.test(text)) hits.push(`${relative(SRC, file).split(sep).join("/")} —— ${why}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
