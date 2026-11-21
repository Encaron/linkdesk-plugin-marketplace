import { describe, expect, it } from "vitest";
import { OFFICIAL_AUTHOR_ID, officialDomainOf } from "../services/authors";
import type { CatalogEntry } from "../services/marketCatalog";

const entry = (id: string, sourceName: string): CatalogEntry =>
  ({ id, name: id, official: true, sourceName }) as CatalogEntry;

describe("官方作者域（合成）", () => {
  it("没有官方条目 → 不产出作者", () => {
    expect(officialDomainOf([])).toBeNull();
    expect(officialDomainOf([{ id: "x", name: "x", official: false } as CatalogEntry])).toBeNull();
  });

  it("官方条目按 sourceName 聚成仓库；一个身份可挂多个仓", () => {
    const d = officialDomainOf([entry("a", "encaron/linkdesk-marketplace"), entry("b", "encaron/extra-repo")]);
    expect(d?.authorId).toBe(OFFICIAL_AUTHOR_ID);
    expect(d?.official).toBe(true);
    expect(d?.repos.map((r) => [r.id, r.plugins.length])).toEqual([
      ["linkdesk-marketplace", 1],
      ["extra-repo", 1],
    ]);
  });
});
