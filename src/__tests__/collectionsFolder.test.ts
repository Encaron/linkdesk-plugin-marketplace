/**
 * collections/ 文件夹拆分写法（R4-4.5，批4b）——纯解析/合并单测 ＋ load 编排注入集成。
 *
 * 两读形态（同一根级字段 `collections[]`）：对象 = inline 声明；**字符串 = `collections/<id>.json`
 * 文件夹引用（读取入口）**。🔴 有引用才发请求——v1 目录零探针、零新增请求（棒 3 坑 1 纪律，
 * 本文件第一条用例就是它的机械钉子）。同 id 冲突 = inline 主文件正典胜 + `duplicate-collection` 警告。
 * IO 全注入（`__setCatalogIO`），零网络；fixture 全虚构（硬约束 21）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { collectionFileOf, mergeFolderWithInline, parseCollectionDecl } from "../services/marketCatalog";
import { loadCatalog, __setCatalogIO } from "../services/marketSources";
import type { FetchFn, StorageLike } from "../services/marketSources";

const AUTHOR_URL = "https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/marketplace.json";

function entry(id: string): Record<string, string> {
  /* R4-3.18：网络源条目带齐抓取型三字段——缺了会多出 missing-entry-field 噪声 */
  return {
    id,
    name: `Demo ${id}`,
    version: "1.0.0",
    author: "Demo Author",
    publishedAt: "2026-11-01T00:00:00Z",
    repository: "https://github.com/demo-owner/demo-repo",
    downloadUrl: `https://example.invalid/releases/${id}-1.0.0.linkdesk-plugin`,
  };
}
function catalogText(...plugins: Array<Record<string, string>>): string {
  return JSON.stringify({ version: "1", updatedAt: "2026-11-01T00:00:00Z", plugins });
}

describe("纯解析（collectionFileOf / parseCollectionDecl）", () => {
  it("文件名拼装 = collections/<id>.json", () => {
    expect(collectionFileOf("picks")).toBe("collections/picks.json");
  });

  it("parseCollectionDecl：全字段（glow/more）收；缺 title → null（与 inline 数组同一把尺）", () => {
    const full = parseCollectionDecl({ id: "picks", title: "Picks", glow: false, more: { label: "More", target: "rank" }, layout: "strip", items: ["demo-plugin"], order: 2 });
    expect(full).toMatchObject({ id: "picks", glow: false, layout: "strip", order: 2 });
    expect(full?.more).toEqual({ label: "More", target: "rank" });
    expect(parseCollectionDecl({ id: "x", items: ["a"] })).toBeNull();
    expect(parseCollectionDecl("nope")).toBeNull();
  });
});

describe("mergeFolderWithInline（同 id inline 主文件正典胜）", () => {
  it("文件夹独有 → 并入；同 id → inline 胜 + duplicate-collection 警告", () => {
    const inline = [{ id: "picks", title: "Inline Picks", items: ["demo-a"] }] as never as Parameters<typeof mergeFolderWithInline>[0];
    const folder = [
      { id: "picks", title: "Folder Picks", items: ["demo-b"] },
      { id: "themes", title: "Themes", items: ["demo-c"] },
    ] as never as Parameters<typeof mergeFolderWithInline>[1];
    const r = mergeFolderWithInline(inline, folder);
    expect(r.collections.map((c) => `${c.id}:${c.title}`)).toEqual(["picks:Inline Picks", "themes:Themes"]);
    expect(r.warnings).toEqual([{ code: "duplicate-collection", detail: "picks" }]);
  });

  it("inline 缺省（目录无 inline）→ 文件夹全量并入、零警告", () => {
    const r = mergeFolderWithInline(undefined, [{ id: "picks", title: "Picks", items: ["demo-a"] } as never]);
    expect(r.collections).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });
});

describe("loadCatalog × collections/ 文件夹（注入集成）", () => {
  let storage: StorageLike & { map: Map<string, string> };

  /** FetchFn 契约 = 返回文本、失败 throw（HTTP 404 字样 → fetchSidecar 判 missing） */
  function inject(handler: (url: string) => string | undefined, store?: StorageLike & { map: Map<string, string> }): void {
    const fetchFn: FetchFn = async (url: string) => {
      const hit = handler(url);
      if (hit === undefined) throw new Error("HTTP 404");
      return hit;
    };
    __setCatalogIO(fetchFn, store ?? storage);
  }

  beforeEach(() => {
    const map = new Map<string, string>();
    storage = {
      map,
      getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k, v) => {
        map.set(k, String(v));
      },
      removeItem: (k) => {
        map.delete(k);
      },
    };
    const cfg = { configuration: { get: vi.fn(async () => [AUTHOR_URL]) } };
    Object.defineProperty(window, "linkdesk", { value: cfg, configurable: true });
  });
  afterEach(() => {
    __setCatalogIO(null, null);
  });

  it("🔴 v1 目录零探针：无字符串引用 ⇒ collections/ 文件一个都不拉（fetch 调用只有目录本身）", async () => {
    const fetched: string[] = [];
    __setCatalogIO(
      (async (url: string) => {
        fetched.push(url);
        if (url === AUTHOR_URL) return catalogText(entry("demo-a"));
        throw new Error("HTTP 404");
      }) as FetchFn,
      storage,
    );
    const r = await loadCatalog(true);
    expect(r.state).toBe("ok");
    expect(r.collections).toEqual([]);
    expect(fetched.filter((u) => u.includes("collections/"))).toEqual([]); // 零探针（坑 1 纪律的机械钉子）
  });

  it("根级字符串引用 → 逐拉 collections/<id>.json 并入（glow/more 随单件解析进目录）", async () => {
    const raw = (p: string) => `https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/${p}`;
    inject((url) => {
      if (url === AUTHOR_URL)
        return JSON.stringify({ version: "1", updatedAt: "2026-11-01T00:00:00Z", plugins: [entry("demo-a")], collections: ["picks", "themes"] });
      if (url === raw(collectionFileOf("picks"))) return JSON.stringify({ id: "picks", title: "Folder Picks", glow: false, items: ["demo-a"] });
      if (url === raw(collectionFileOf("themes"))) return JSON.stringify({ id: "themes", title: "Themes", more: { label: "More", target: "rank" }, items: ["demo-a"] });
      return undefined;
    });
    const r = await loadCatalog(true);
    expect(r.state).toBe("ok");
    expect(r.collections.map((c) => c.id)).toEqual(["picks", "themes"]);
    expect(r.collections.find((c) => c.id === "picks")?.glow).toBe(false);
    expect(r.collections.find((c) => c.id === "themes")?.more).toEqual({ label: "More", target: "rank" });
    expect(r.warnings.filter((w) => w.code === "invalid-collection" || w.code === "duplicate-collection")).toEqual([]);
  });

  it("同 id 双处声明（inline 对象 + 字符串引用）→ inline 胜 + duplicate-collection 警告", async () => {
    const raw = (p: string) => `https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/${p}`;
    inject((url) => {
      if (url === AUTHOR_URL)
        return JSON.stringify({
          version: "1",
          updatedAt: "2026-11-01T00:00:00Z",
          plugins: [entry("demo-a")],
          collections: [{ id: "picks", title: "Inline Picks", items: ["demo-a"] }, "picks"],
        });
      if (url === raw(collectionFileOf("picks"))) return JSON.stringify({ id: "picks", title: "Folder Picks", items: ["demo-a"] });
      return undefined;
    });
    const r = await loadCatalog(true);
    expect(r.collections.map((c) => `${c.id}:${c.title}`)).toEqual(["picks:Inline Picks"]);
    expect(r.warnings.some((w) => w.code === "duplicate-collection" && w.detail === "picks")).toBe(true);
  });

  it("引用列了但文件 404/坏 JSON/坏形状 → invalid-collection 警告（作者自查看得见）", async () => {
    const raw = (p: string) => `https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/${p}`;
    inject((url) => {
      if (url === AUTHOR_URL)
        return JSON.stringify({ version: "1", updatedAt: "2026-11-01T00:00:00Z", plugins: [entry("demo-a")], collections: ["gone", "badjson", "badshape"] });
      if (url === raw(collectionFileOf("gone"))) return undefined; // 404
      if (url === raw(collectionFileOf("badjson"))) return "{oops";
      if (url === raw(collectionFileOf("badshape"))) return JSON.stringify({ id: "badshape" }); // 缺 title/items
      return undefined;
    });
    const r = await loadCatalog(true);
    expect(r.collections).toEqual([]);
    const bad = r.warnings.filter((w) => w.code === "invalid-collection").map((w) => w.detail);
    expect(bad.sort()).toEqual(["badjson", "badshape", "gone"]);
  });

  it("非法引用形状（非 slug）→ parse 期 invalid-collection 警告、不产生文件请求", async () => {
    const fetched: string[] = [];
    __setCatalogIO(
      (async (url: string) => {
        fetched.push(url);
        if (url === AUTHOR_URL)
          return JSON.stringify({ version: "1", updatedAt: "2026-11-01T00:00:00Z", plugins: [entry("demo-a")], collections: ["../escape"] });
        throw new Error("HTTP 404");
      }) as FetchFn,
      storage,
    );
    const r = await loadCatalog(true);
    expect(r.warnings.some((w) => w.code === "invalid-collection" && w.detail === "../escape")).toBe(true);
    expect(fetched.filter((u) => u.includes("collections/"))).toEqual([]);
  });

  it("缓存命中：TTL 内第二趟不重复拉合集文件（fetchSidecar 既有语义，钉住）", async () => {
    const raw = (p: string) => `https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/${p}`;
    let fileFetches = 0;
    inject((url) => {
      if (url === AUTHOR_URL) return JSON.stringify({ version: "1", updatedAt: "2026-11-01T00:00:00Z", plugins: [entry("demo-a")], collections: ["picks"] });
      if (url === raw(collectionFileOf("picks"))) {
        fileFetches++;
        return JSON.stringify({ id: "picks", title: "Picks", items: ["demo-a"] });
      }
      return undefined;
    });
    await loadCatalog(true);
    await loadCatalog(false); // 第二趟走 5min fresh 缓存（force 才绕）
    expect(fileFetches).toBe(1);
  });
});
