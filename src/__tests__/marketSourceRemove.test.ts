/**
 * marketSourceRemove —— 移源纯决策单测（R4-2.5 `marketplace.removeSource`）。
 *
 * 钉三件事：① 身份匹配（URL owner/repo 形态无关、本地 path 归一）② 下标形态边界
 * ③ **删一条、其余原始形态原样保留**（⛔ 归一化重写）。
 */

import { describe, it, expect } from "vitest";
import { decideRemoveSource } from "../services/marketSourceRemove";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";

const REPO_PAGE = "https://github.com/owner-two/catalog-repo-b";
const REPO_MAIN = "https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/marketplace.json";
const OTHER_PAGE = "https://github.com/owner-three/catalog-repo-c";

describe("decideRemoveSource", () => {
  it("按身份删：仓库主页与已存的 main 直链同一身份（owner/repo、分支无关）", () => {
    const items = [REPO_MAIN, OTHER_PAGE];
    const r = decideRemoveSource(items, REPO_PAGE);
    expect(r).toEqual({ ok: true, next: [OTHER_PAGE] });
  });

  it("保留其余记录原始形态（string / {url} 混存不归一）", () => {
    const record = { kind: "remote", url: OTHER_PAGE, authorId: "owner-three", repoId: "catalog-repo-c", enabled: true, status: "ok" };
    const items = [REPO_MAIN, record];
    const r = decideRemoveSource(items, REPO_PAGE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next).toEqual([record]);
  });

  it("按 index 删（0 基）", () => {
    const items = [REPO_MAIN, OTHER_PAGE];
    const r = decideRemoveSource(items, 1);
    expect(r).toEqual({ ok: true, next: [REPO_MAIN] });
  });

  it("本地 path 归一比较（斜杠/尾斜杠/大小写）", () => {
    const items = [{ kind: "local", path: "C:\\Work\\Demo\\", authorId: "__local", repoId: "Demo", enabled: true, status: "ok" }];
    const r = decideRemoveSource(items, "c:/work/demo");
    expect(r.ok).toBe(true);
  });

  it.each([[2], [-1], [1.5]])("index 越界/非整数（%s）⇒ bad-arg", (idx) => {
    expect(decideRemoveSource([REPO_MAIN], idx)).toEqual({ ok: false, reason: "bad-arg" });
  });

  it.each([[undefined], [""], ["   "]])("空目标（%s）⇒ bad-arg", (arg) => {
    expect(decideRemoveSource([REPO_MAIN], arg as string | undefined)).toEqual({ ok: false, reason: "bad-arg" });
  });

  it("官方源（任何形态）⇒ official（⛔ 静默 no-op 让 AI 以为删掉了）", () => {
    expect(decideRemoveSource([REPO_MAIN], OFFICIAL_SOURCE_URL)).toEqual({ ok: false, reason: "official" });
  });

  it("不在列表 ⇒ not-found", () => {
    expect(decideRemoveSource([REPO_MAIN], OTHER_PAGE)).toEqual({ ok: false, reason: "not-found" });
  });

  it("非数组输入按空表处理（不崩）", () => {
    expect(decideRemoveSource(undefined as unknown as unknown[], REPO_PAGE)).toEqual({ ok: false, reason: "not-found" });
  });
});
