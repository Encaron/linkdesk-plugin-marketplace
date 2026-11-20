/** sourcesData 测试（棒 8 · R4-3.14）——作者组聚合/计数/单源状态/相对时刻。 */

import { describe, it, expect } from "vitest";
import type { AuthorDomain } from "../services/authors";
import type { SourceRecord } from "../services/marketSources";
import { agoText, groupRemoteSources } from "../views/store/sources/sourcesData";

const rec = (url: string, authorId: string, repoId: string, enabled = true): SourceRecord => ({
  kind: "remote",
  url,
  authorId,
  repoId,
  enabled,
  status: "ok",
});

const RECORDS: SourceRecord[] = [
  rec("https://github.com/demo-one/shop-a", "demo-one", "a"),
  rec("https://github.com/demo-one/shop-b", "demo-one", "b", false),
  rec("https://github.com/demo-two/shop-c", "demo-two", "c"),
];

const DOMAINS: AuthorDomain[] = [
  {
    authorId: "demo-one",
    name: "Demo One",
    repos: [
      { id: "a", name: "A", plugins: [{ id: "p1", name: "P1", version: "1" }, { id: "p2", name: "P2", version: "1" }] },
      { id: "b", name: "B", plugins: [{ id: "p3", name: "P3", version: "1" }] },
    ],
    warnings: [{ code: "duplicate-hero", repoId: "a", detail: "2" }],
    official: true,
  },
];

const t = (k: string, o?: Record<string, unknown>) =>
  o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k;

describe("groupRemoteSources", () => {
  it("按 authorId 聚合：启用仓数/插件数只算启用源；组序=数组序", () => {
    const groups = groupRemoteSources(RECORDS, DOMAINS, [
      { url: RECORDS[0].url!, ok: true },
      { url: RECORDS[2].url!, ok: false, reason: "network" },
    ]);
    expect(groups.map((g) => g.authorId)).toEqual(["demo-one", "demo-two"]);
    const one = groups[0];
    expect(one.name).toBe("Demo One");
    expect(one.official).toBe(true);
    expect(one.repoCount).toBe(1); // b 停用
    expect(one.pluginCount).toBe(2); // 只算 a 仓
    expect(one.warnings).toHaveLength(1);
    expect(one.rows[0].status).toBe("ok");
    expect(groups[1].rows[0].status).toBe("error");
    expect(groups[1].rows[0].reason).toBe("network");
  });

  it("无作者域也能成组（名字退 authorId，计数 0）", () => {
    const groups = groupRemoteSources(RECORDS, [], undefined);
    expect(groups[1]).toMatchObject({ name: "demo-two", pluginCount: 0, repoCount: 1 });
    expect(groups[1].rows[0].status).toBeUndefined();
  });
});

describe("agoText", () => {
  it("刚刚 / N 分钟前 / N 小时前 / 未拉取", () => {
    const now = 1_000_000_000_000;
    expect(agoText(t, undefined, now)).toBe("未拉取");
    expect(agoText(t, now - 10_000, now)).toBe("刚刚");
    expect(agoText(t, now - 5 * 60_000, now)).toBe("5 分钟前");
    expect(agoText(t, now - 2 * 3600_000, now)).toBe("2 小时前");
  });
});
