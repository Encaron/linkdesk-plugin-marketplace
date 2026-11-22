/**
 * repoContext —— currentRepo 唯一浏览上下文单测（19 §一；D1/D2）。
 *
 * 钉住：默认官方核心仓；作者存在但仓 id 不存在 ⇒ 首位仓（D2）；作者不存在 ⇒ 回落官方（fallback 如实）。
 * ⛔ 不测拉取（作者域由 `authors` 负责）；这里只喂已加载域。
 */

import { describe, it, expect } from "vitest";
import type { AuthorDomain } from "../services/authors";
import type { CatalogEntry } from "../services/marketCatalog";
import { OFFICIAL_CORE_REPO_ID } from "../services/officialRepo";
import { normalizeRepoRef, resolveRepoRef } from "../services/repoContext";

const officialEntry = (patch: Partial<CatalogEntry> = {}): CatalogEntry =>
  ({
    id: "demo-official",
    name: "Official Demo",
    version: "1.0.0",
    official: true,
    sourceName: "encaron/linkdesk-marketplace",
    ...patch,
  }) as CatalogEntry;

const domain = (patch: Partial<AuthorDomain>): AuthorDomain =>
  ({
    authorId: "demo-author",
    name: "Demo Author",
    repos: [],
    warnings: [],
    official: false,
    ...patch,
  }) as AuthorDomain;

const repo = (id: string, pluginIds: string[]) =>
  ({
    id,
    name: `Repo ${id}`,
    plugins: pluginIds.map((pid) => ({ id: pid, name: pid, version: "1.0.0" }) as CatalogEntry),
  }) as AuthorDomain["repos"][number];

describe("normalizeRepoRef", () => {
  it("两键齐备才收；坏值 = null（磁盘手改不炸 UI）", () => {
    expect(normalizeRepoRef({ authorId: "geek", repoId: "hw" })).toEqual({ authorId: "geek", repoId: "hw" });
    expect(normalizeRepoRef({ authorId: "geek" })).toBeNull();
    expect(normalizeRepoRef(null)).toBeNull();
    expect(normalizeRepoRef({ authorId: "  ", repoId: "hw" })).toBeNull();
  });
});

describe("resolveRepoRef —— 唯一浏览上下文", () => {
  it("无存储 / 官方 ref：默认官方核心仓（官方条目聚合）", () => {
    const entries = [officialEntry()];
    const r = resolveRepoRef(null, [], entries);
    expect(r.ref).toEqual({ authorId: "official", repoId: OFFICIAL_CORE_REPO_ID });
    expect(r.entries.map((e) => e.id)).toEqual(["demo-official"]);
    expect(r.core).toBe(true);
    expect(r.fallback).toBe(false);
  });

  it("第三方作者：按 ref 命中仓；仓 id 不存在 ⇒ 首位仓（D2）", () => {
    const d = domain({ repos: [repo("hw", ["p1"]), repo("fx", ["p2"])] });
    const hit = resolveRepoRef({ authorId: "demo-author", repoId: "fx" }, [d], []);
    expect(hit.ref).toEqual({ authorId: "demo-author", repoId: "fx" });
    expect(hit.entries.map((e) => e.id)).toEqual(["p2"]);

    const first = resolveRepoRef({ authorId: "demo-author", repoId: "gone" }, [d], []);
    expect(first.ref).toEqual({ authorId: "demo-author", repoId: "hw" });
    expect(first.entries.map((e) => e.id)).toEqual(["p1"]);
    expect(first.fallback).toBe(false);
  });

  it("作者不存在（源被移除/作者域没拉到）⇒ 回落官方核心仓 + fallback:true", () => {
    const entries = [officialEntry()];
    const r = resolveRepoRef({ authorId: "nobody", repoId: "hw" }, [], entries);
    expect(r.ref).toEqual({ authorId: "official", repoId: OFFICIAL_CORE_REPO_ID });
    expect(r.official).toBe(true);
    expect(r.fallback).toBe(true);
  });

  it("作者存在但没有仓 ⇒ 空池（诚实空态；⛔ 回落官方假装有内容）", () => {
    const d = domain({ authorId: "empty", repos: [] });
    const r = resolveRepoRef({ authorId: "empty", repoId: "x" }, [d], [officialEntry()]);
    expect(r.entries).toEqual([]);
    expect(r.repoId).toBe("");
    expect(r.fallback).toBe(false);
  });
});
