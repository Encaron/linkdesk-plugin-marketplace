/**
 * sourceAdmin 测试（棒 8 · R4-3.14）——源级启停 / 同作者内调序 / 原始数组纪律。
 *
 * 判据：
 *   - 旧 `string` / `{url}` 记录升级只加字段、原始 URL 原样保留；
 *   - 官方源任何形态不可停用/移除（official 回执）；
 *   - 调序只换同作者 remote 邻居，本地条目与别的作者位置不动。
 */

import { describe, it, expect } from "vitest";
import {
  localRecordOf,
  moveSourceWithinAuthorRaw,
  setSourceEnabledRaw,
} from "../services/sourceAdmin";

const A1 = "https://github.com/author-one/repo-a";
const A2 = "https://github.com/author-one/repo-b";
const B1 = "https://github.com/author-two/repo-c";
const OFFICIAL = "https://raw.githubusercontent.com/encaron/linkdesk-marketplace/main/marketplace.json";

describe("setSourceEnabledRaw", () => {
  it("string 记录升级为源记录：补 kind/authorId/repoId/enabled，原始 URL 原样", () => {
    const r = setSourceEnabledRaw([A1], A1, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next[0]).toMatchObject({
      kind: "remote",
      url: A1,
      authorId: "author-one",
      repoId: "repo-a",
      enabled: false,
    });
  });

  it("对象记录保留额外字段（只加 enabled）", () => {
    const rec = { url: A1, authorId: "author-one", repoId: "repo-a", enabled: true, status: "ok", fetchedAt: 123 };
    const r = setSourceEnabledRaw([rec], A1, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next[0]).toMatchObject({ ...rec, enabled: false });
  });

  it("官方源任何形态 → official；找不到 → bad-arg", () => {
    expect(setSourceEnabledRaw([OFFICIAL], OFFICIAL, false)).toEqual({ ok: false, reason: "official" });
    expect(setSourceEnabledRaw([A1], "https://github.com/none/none", true)).toEqual({
      ok: false,
      reason: "bad-arg",
    });
  });
});

describe("moveSourceWithinAuthorRaw", () => {
  it("只与同作者 remote 邻居交换；本地条目与别的作者不动", () => {
    const local = { kind: "local", path: "E:\\x\\y", authorId: "__local", repoId: "y", enabled: true };
    const items = [A1, local, B1, A2];
    const r = moveSourceWithinAuthorRaw(items, A2, -1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next).toEqual([A2, local, B1, A1]);
  });

  it("到边 → edge", () => {
    expect(moveSourceWithinAuthorRaw([A1, B1], A1, -1)).toEqual({ ok: false, reason: "edge" });
    expect(moveSourceWithinAuthorRaw([A1, B1], A1, 1)).toEqual({ ok: false, reason: "edge" });
  });
});

describe("localRecordOf", () => {
  it("本地条目：__local 作者 + path 末段 repoId", () => {
    expect(localRecordOf("E:\\tools\\demo-plugin")).toMatchObject({
      kind: "local",
      authorId: "__local",
      repoId: "demo-plugin",
      enabled: true,
    });
  });
});
