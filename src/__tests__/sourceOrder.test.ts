/**
 * sourceOrder —— 市场源顺序模型单测（19 §四 / 2026-11-22 拍板 D4）。
 *
 * 钉住：唯一真相源 = 数组序；官方核心仓虚拟第 0 条 / 物化时机；
 * 作者容器交换（整块换位）；仓交换（仅同作者、核心锁第一）；本地组固定末尾。
 */

import { describe, it, expect } from "vitest";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";
import {
  OFFICIAL_CORE_REPO_ID,
  buildSourceOrder,
  orderSnapshot,
  swapAuthorsRaw,
  swapReposRaw,
} from "../services/sourceOrder";

const GEEK_FX = "https://github.com/geek/fx-shop";
const GEEK_HW = "https://github.com/geek/hw-shop";
const ALICE_A = "https://github.com/alice/a-shop";

describe("buildSourceOrder —— 唯一顺序模型", () => {
  it("空配置：官方核心仓虚拟第 0 条（旧用户零迁移）", () => {
    const m = buildSourceOrder([]);
    expect(m.officialExplicit).toBe(false);
    expect(m.authorOrder).toEqual(["official"]);
    expect(m.repoOrder).toEqual({ official: [OFFICIAL_CORE_REPO_ID] });
    expect(m.remote[0]).toMatchObject({ index: -1, core: true, repoId: OFFICIAL_CORE_REPO_ID });
  });

  it("作者组按首次出现排序；仓按数组序；本地组不进作者顺序", () => {
    const m = buildSourceOrder([
      GEEK_FX,
      ALICE_A,
      GEEK_HW,
      { kind: "local", path: "E:\\tools\\demo", authorId: "__local", repoId: "demo", enabled: true, status: "ok" },
    ]);
    expect(m.authorOrder).toEqual(["official", "geek", "alice"]);
    expect(m.repoOrder.geek).toEqual(["fx-shop", "hw-shop"]);
    expect(m.repoOrder.alice).toEqual(["a-shop"]);
    expect(m.locals.map((l) => l.repoId)).toEqual(["demo"]);
  });

  it("显式官方记录：核心仓锁官方组第一（磁盘顺序被手改也不翻车）", () => {
    const m = buildSourceOrder([
      { kind: "remote", url: "https://github.com/encaron/playground", authorId: "official", repoId: "playground", enabled: true, status: "ok" },
      { kind: "remote", url: OFFICIAL_SOURCE_URL, authorId: "official", repoId: OFFICIAL_CORE_REPO_ID, enabled: true, status: "ok" },
    ]);
    expect(m.officialExplicit).toBe(true);
    expect(m.repoOrder.official).toEqual([OFFICIAL_CORE_REPO_ID, "playground"]);
  });

  it("orderSnapshot 只透出 authorOrder/repoOrder（命令面形状）", () => {
    const snap = orderSnapshot(buildSourceOrder([GEEK_FX]));
    expect(snap).toEqual({
      authorOrder: ["official", "geek"],
      repoOrder: { official: [OFFICIAL_CORE_REPO_ID], geek: ["fx-shop"] },
    });
  });
});

describe("swapAuthorsRaw —— 作者容器整块交换（D4）", () => {
  it("与虚拟官方核心交换 ⇒ 物化官方记录到新位置（作者顺序真的换）", () => {
    const r = swapAuthorsRaw([GEEK_FX, GEEK_HW, ALICE_A], "geek", "official");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.authorOrder).toEqual(["geek", "official", "alice"]);
    expect(r.order.repoOrder.geek).toEqual(["fx-shop", "hw-shop"]); // 块内仓顺序不动
    const m = buildSourceOrder(r.next);
    expect(m.authorOrder).toEqual(["geek", "official", "alice"]);
    expect(m.remote[0].authorId).toBe("geek");
    expect(m.remote.find((x) => x.core)?.url).toBe(OFFICIAL_SOURCE_URL);
  });

  it("非官方作者互换 ⇒ 官方仍虚拟第一、两块整块换位", () => {
    const r = swapAuthorsRaw([GEEK_FX, GEEK_HW, ALICE_A], "geek", "alice");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.authorOrder).toEqual(["official", "alice", "geek"]);
    expect(buildSourceOrder(r.next).authorOrder).toEqual(["official", "alice", "geek"]);
  });

  it("同项/不存在 ⇒ 结构化拒绝", () => {
    expect(swapAuthorsRaw([GEEK_FX], "geek", "geek")).toEqual({ ok: false, reason: "same" });
    expect(swapAuthorsRaw([GEEK_FX], "geek", "nobody")).toEqual({ ok: false, reason: "not-found" });
  });

  it("本地组固定末尾、不参与作者排序", () => {
    const local = { kind: "local", path: "E:\\tools\\demo", authorId: "__local", repoId: "demo", enabled: true, status: "ok" };
    const r = swapAuthorsRaw([local, GEEK_FX, ALICE_A], "geek", "alice");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(buildSourceOrder(r.next).authorOrder).toEqual(["official", "alice", "geek"]);
    expect((r.next[r.next.length - 1] as { kind?: string }).kind).toBe("local");
  });
});

describe("swapReposRaw —— 只在本作者内交换（D4）", () => {
  it("同作者两仓交换；⛔ 跨作者", () => {
    const items = [GEEK_FX, GEEK_HW, ALICE_A];
    const r = swapReposRaw(items, "geek", "fx-shop", "hw-shop");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.repoOrder.geek).toEqual(["hw-shop", "fx-shop"]);
    expect(r.next[0]).toBe(GEEK_HW);
    expect(r.next[1]).toBe(GEEK_FX);
    expect(r.next[2]).toBe(ALICE_A);
    expect(swapReposRaw(items, "geek", "fx-shop", "a-shop")).toEqual({ ok: false, reason: "not-found" });
  });

  it("官方核心仓锁第一：参与交换 ⇒ locked（显式或虚拟都拦）", () => {
    const explicit = [
      { kind: "remote", url: OFFICIAL_SOURCE_URL, authorId: "official", repoId: OFFICIAL_CORE_REPO_ID, enabled: true, status: "ok" },
      { kind: "remote", url: "https://github.com/encaron/playground", authorId: "official", repoId: "playground", enabled: true, status: "ok" },
    ];
    expect(swapReposRaw(explicit, "official", OFFICIAL_CORE_REPO_ID, "playground")).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(swapReposRaw([GEEK_FX], "official", OFFICIAL_CORE_REPO_ID, "playground")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});
