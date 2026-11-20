/**
 * marketSources 目录运行时拉取域单测——E6#30a 5min 缓存 / #30c 多源合并去重 / #30f 目录防御。
 * IO 全注入（fetch / localStorage / window.linkdesk.configuration），零网络零真实存储。
 * fixture 全虚构（硬约束 21）：demo-* 插件、owner-two/catalog-repo-b 作者源仓库。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadCatalog, forceRefreshCatalog, getSourceUrls, readConfiguredAuthorSources, readSourceRecords, normalizeSourceRecord, __setCatalogIO } from "../services/marketSources";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";
import type { FetchFn, StorageLike } from "../services/marketSources";

/** 作者源 raw marketplace.json 直链（虚构仓库） */
const AUTHOR_URL = "https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/marketplace.json";
const OFFICIAL_NAME = "encaron/linkdesk-marketplace";
const AUTHOR_NAME = "owner-two/catalog-repo-b";
const CACHE_PREFIX = "ldk-market-catalog:v1:";

/* ── fixture 生成（全虚构） ── */

function entry(id: string, version: string): Record<string, string> {
  return { id, name: `Demo ${id}`, version, downloadUrl: `https://example.invalid/releases/${id}-${version}.linkdesk-plugin` };
}
function catalogText(...plugins: Array<Record<string, string>>): string {
  return JSON.stringify({ version: "1", updatedAt: "2026-09-01T00:00:00Z", plugins });
}

/* ── IO 替身 ── */

function fakeStorage(seed?: Map<string, string>): StorageLike & { map: Map<string, string> } {
  const map = seed ?? new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function cacheKey(url: string): string {
  return CACHE_PREFIX + url;
}
/** 预置过期（stale）缓存——fetchedAt 在 TTL 之外 */
function seedStale(storage: StorageLike & { map: Map<string, string> }, url: string, text: string): void {
  storage.map.set(cacheKey(url), JSON.stringify({ fetchedAt: Date.now() - 6 * 60 * 1000, text }));
}

/** 配置面替身——configuration.get 返回配置的 marketplaceSources（undefined = 官方源缺省）。
 *  R4-2.1 起配置值允许三种形态（string / {url} / 全源记录），故入参放宽为 unknown[]。 */
function stubConfig(sources?: unknown[]): void {
  const cfg = {
    configuration: {
      get: vi.fn(async () => sources),
    },
  };
  Object.defineProperty(window, "linkdesk", { value: cfg, configurable: true });
}

describe("marketSources (E6#30a/30c/30f)", () => {
  beforeEach(() => {
    stubConfig(); // 缺省：仅官方源
  });
  afterEach(() => {
    __setCatalogIO(null, null);
    // 还原 window.linkdesk 为未定义（jsdom 无 preload 注入）
    Reflect.deleteProperty(window, "linkdesk");
  });

  /* ── getSourceUrls（#30c 官方恒在 + 配置作者源） ── */

  it("getSourceUrls：官方源恒在，配置作者源排官方后", async () => {
    stubConfig([AUTHOR_URL, "https://github.com/owner-three/catalog-repo-c"]);
    const urls = await getSourceUrls();
    expect(urls[0]).toBe(OFFICIAL_SOURCE_URL);
    expect(urls[1]).toBe(AUTHOR_URL); // 已直链作者源原样收
    expect(urls[2]).toBe("https://raw.githubusercontent.com/owner-three/catalog-repo-c/HEAD/marketplace.json"); // repo 主页归一
    expect(urls).toHaveLength(3);
  });

  it("getSourceUrls：配置含官方重复/垃圾值 → 去重且跳过", async () => {
    stubConfig([OFFICIAL_SOURCE_URL, "", "  ", "not-a-url"]);
    const urls = await getSourceUrls();
    expect(urls).toEqual([OFFICIAL_SOURCE_URL]);
  });

  /* ── 官方身份回归（E6#30c——owner/repo 分支无关，修仓库主页形态官方漏判） ── */

  it("getSourceUrls：配置官方仓库主页形态 → 不二次拉取（只官方 main 一次）", async () => {
    stubConfig(["https://github.com/encaron/linkdesk-marketplace"]);
    const urls = await getSourceUrls();
    expect(urls).toEqual([OFFICIAL_SOURCE_URL]); // 仓库主页官方身份与 main 直链同一源 → 滤除
  });

  it("getSourceUrls：配置官方 HEAD 直链形态 → 不二次拉取", async () => {
    stubConfig(["https://raw.githubusercontent.com/encaron/linkdesk-marketplace/HEAD/marketplace.json"]);
    const urls = await getSourceUrls();
    expect(urls).toEqual([OFFICIAL_SOURCE_URL]);
  });

  it("getSourceUrls：官方其他形态 + 真作者源并存 → 只官方 main + 作者源", async () => {
    stubConfig(["https://github.com/encaron/linkdesk-marketplace", AUTHOR_URL]);
    const urls = await getSourceUrls();
    expect(urls).toEqual([OFFICIAL_SOURCE_URL, AUTHOR_URL]);
  });

  it("readConfiguredAuthorSources：官方仓库主页形态不入作者列表（残留滤除）", async () => {
    stubConfig(["https://github.com/encaron/linkdesk-marketplace", AUTHOR_URL]);
    const authors = await readConfiguredAuthorSources();
    expect(authors).toEqual([AUTHOR_URL]);
  });

  it("readConfiguredAuthorSources：纯官方残留 → 空作者列表", async () => {
    stubConfig(["https://github.com/encaron/linkdesk-marketplace"]);
    expect(await readConfiguredAuthorSources()).toEqual([]);
  });

  it("readConfiguredAuthorSources：作者源同仓库多形态按身份去重、保留首个原始形态", async () => {
    stubConfig(["https://github.com/owner-two/catalog-repo-b", AUTHOR_URL]);
    expect(await readConfiguredAuthorSources()).toEqual(["https://github.com/owner-two/catalog-repo-b"]);
  });

  /* ── 拉取 + 5min 缓存（#30a） ── */

  it("实时拉取成功 → ok + 缓存写入；5min 内二次 loadCatalog 走缓存不再 fetch", async () => {
    const fetchFn: FetchFn = vi.fn(async (url) => {
      if (url === OFFICIAL_SOURCE_URL) return catalogText(entry("demo-alpha", "1.2.0"));
      throw new Error("unexpected url");
    });
    const storage = fakeStorage();
    __setCatalogIO(fetchFn, storage);

    const first = await loadCatalog();
    expect(first.state).toBe("ok");
    expect(first.entries).toHaveLength(1);
    expect(first.entries[0]).toMatchObject({ id: "demo-alpha", version: "1.2.0" });
    expect(first.usedStale).toBe(false);
    expect(storage.map.has(cacheKey(OFFICIAL_SOURCE_URL))).toBe(true);

    const fetchCalls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.length;
    const second = await loadCatalog();
    expect(second.entries).toHaveLength(1); // 命中缓存仍有数据
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCalls); // 未再 fetch
  });

  it("forceRefreshCatalog 跳过 fresh 缓存强制重拉 + 重写缓存", async () => {
    let served = catalogText(entry("demo-alpha", "1.0.0"));
    const fetchFn = vi.fn(async () => served);
    const storage = fakeStorage();
    __setCatalogIO(fetchFn, storage);

    const first = await loadCatalog();
    expect(first.entries[0].version).toBe("1.0.0");
    served = catalogText(entry("demo-alpha", "1.1.0")); // 服务器内容更新
    const refreshed = await forceRefreshCatalog();
    expect(refreshed.entries[0].version).toBe("1.1.0");
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  /* ── 目录防御（#30f） ── */

  it("单源网络失败 + 无缓存 → offline + 该源 error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("offline");
    expect(r.entries).toEqual([]);
    expect(r.errors).toEqual([{ sourceName: OFFICIAL_NAME, reason: "network" }]);
  });

  it("网络失败 + 有 stale 缓存 → 缓存兜底交付，usedStale=true，state 仍 ok", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("timeout");
    });
    const storage = fakeStorage();
    seedStale(storage, OFFICIAL_SOURCE_URL, catalogText(entry("demo-alpha", "1.0.0")));
    __setCatalogIO(fetchFn, storage);
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.entries[0].id).toBe("demo-alpha");
    expect(r.usedStale).toBe(true);
  });

  it("单源 parse 失败 + 无缓存 → corrupt", async () => {
    const fetchFn = vi.fn(async () => "<html>not json</html>");
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("corrupt");
    expect(r.entries).toEqual([]);
    expect(r.errors).toEqual([{ sourceName: OFFICIAL_NAME, reason: "parse" }]);
  });

  it("parse 失败 + 有 stale 缓存 → 缓存兜底交付，usedStale=true", async () => {
    const fetchFn = vi.fn(async () => "garbage{");
    const storage = fakeStorage();
    seedStale(storage, OFFICIAL_SOURCE_URL, catalogText(entry("demo-alpha", "1.0.0")));
    __setCatalogIO(fetchFn, storage);
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.entries).toHaveLength(1);
    expect(r.usedStale).toBe(true);
  });

  it("官方目录连上但为空（合法空目录）→ ok 空态，非 offline（实证 bug 修复）", async () => {
    // 官方仓库建好未上架 = {"plugins":[]}——fetch 成功、parse 通过、零插件
    const fetchFn = vi.fn(async () => JSON.stringify({ version: "1", plugins: [] }));
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("ok"); // 判据 = 有源交付（sources.length>0），非合并条数
    expect(r.entries).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("官方空目录 + 作者源不可达 → 仍 ok 空态（有源交付不降级），errors 记作者源", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return JSON.stringify({ version: "1", plugins: [] });
      throw new Error("refused");
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("ok"); // 官方连上（虽空）→ 不整体降级 offline
    expect(r.entries).toEqual([]);
    expect(r.errors).toEqual([{ sourceName: AUTHOR_NAME, reason: "network" }]);
  });

  /* ── 多源（#30c） ── */

  it("多源合并去重：作者源更高版本胜出 + sourceName 标注作者", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) =>
      url === OFFICIAL_SOURCE_URL ? catalogText(entry("demo-alpha", "1.0.0")) : catalogText(entry("demo-alpha", "1.2.0")),
    );
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ version: "1.2.0", sourceName: AUTHOR_NAME });
    expect(r.sourceNames).toEqual([OFFICIAL_NAME, AUTHOR_NAME]);
  });

  it("单源失败不阻塞他源：官方 ok + 作者源不可达 → ok，errors 记作者源", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return catalogText(entry("demo-alpha", "1.0.0"));
      throw new Error("refused");
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.entries).toHaveLength(1);
    expect(r.errors).toEqual([{ sourceName: AUTHOR_NAME, reason: "network" }]);
  });

  it("官方不可达但有 stale 缓存 + 作者源实时 ok → 两源条目都合并（缓存不阻断）", async () => {
    stubConfig([AUTHOR_URL]);
    const storage = fakeStorage();
    seedStale(storage, OFFICIAL_SOURCE_URL, catalogText(entry("demo-alpha", "1.0.0")));
    const fetchFn = vi.fn(async (url: string) => {
      if (url === AUTHOR_URL) return catalogText(entry("demo-beta", "2.0.0"));
      throw new Error("refused"); // 官方网络失败
    });
    __setCatalogIO(fetchFn, storage);
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    const ids = r.entries.map((e) => e.id).sort();
    expect(ids).toEqual(["demo-alpha", "demo-beta"]);
    expect(r.usedStale).toBe(true);
  });

  /* ── 数据形状完整性 ── */

  it("返回条目含来源标注、fetchedAt 毫秒时间戳", async () => {
    const fetchFn = vi.fn(async () => catalogText(entry("demo-alpha", "1.2.0")));
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.entries[0].sourceName).toBe(OFFICIAL_NAME);
    expect(r.fetchedAt).toBeGreaterThan(0);
    expect(typeof r.fetchedAt).toBe("number");
  });

  /* ── 官方身份随源携带（E6#30.8f 官方徽标数据源） ── */

  it("仅官方源 → 条目 official=true", async () => {
    const fetchFn = vi.fn(async () => catalogText(entry("demo-alpha", "1.0.0")));
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.entries[0].official).toBe(true);
  });

  it("多源：官方条目 official=true、仅作者源独有条目不带官方身份", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) =>
      url === OFFICIAL_SOURCE_URL
        ? catalogText(entry("demo-official", "1.0.0"))
        : catalogText(entry("demo-author-only", "1.0.0")),
    );
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    const officialEntry = r.entries.find((e) => e.id === "demo-official");
    const authorEntry = r.entries.find((e) => e.id === "demo-author-only");
    expect(officialEntry?.official).toBe(true);
    expect(authorEntry?.official).toBeFalsy();
    expect(authorEntry?.sourceName).toBe(AUTHOR_NAME);
  });

  it("官方源走缓存命中 → official 身份不丢（fetchOne 各返回路径一致携带）", async () => {
    const fetchFn = vi.fn(async () => catalogText(entry("demo-alpha", "1.0.0")));
    const storage = fakeStorage();
    __setCatalogIO(fetchFn, storage);
    await loadCatalog(); // 实时 → 写缓存
    const r2 = await loadCatalog(); // 5min fresh 命中
    expect(r2.entries[0].official).toBe(true);
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});

/* ═══ Marketplace-Store v2（R4-2.1/2.2/2.3） ═══
 * 三源合并序（官方→收录→用户）· vendors.json 判定链 · K5 回落链 · #10 源记录形态 · 根级声明交付。
 * 全部虚构：owner-three/catalog-repo-c（收录源）、demo-* 插件。 */

const COLLECTED_URL = "https://raw.githubusercontent.com/owner-three/catalog-repo-c/HEAD/marketplace.json";
const COLLECTED_NAME = "owner-three/catalog-repo-c";
const MANIFEST_URL_OF_AUTHOR = "https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/plugin.json";
const VENDORS_URL = "https://raw.githubusercontent.com/encaron/linkdesk-marketplace/main/vendors.json";

/** 带根级声明的目录文本（v2） */
function catalogV2(opts: {
  plugins: Array<Record<string, unknown>>;
  sources?: Array<Record<string, string>>;
  collections?: Array<Record<string, unknown>>;
  categoryRail?: { order: string[]; icons?: Record<string, string> };
}): string {
  return JSON.stringify({
    version: "2",
    updatedAt: "2026-11-20T00:00:00Z",
    plugins: opts.plugins,
    sources: opts.sources,
    collections: opts.collections,
    categoryRail: opts.categoryRail,
  });
}

describe("marketSources v2（R4-2.1/2.2/2.3）", () => {
  beforeEach(() => {
    stubConfig();
  });
  afterEach(() => {
    __setCatalogIO(null, null);
    Reflect.deleteProperty(window, "linkdesk");
  });

  it("三源合并序：官方 → 收录（官方根 sources[]）→ 用户；同 id 高版本者胜", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) {
        return catalogV2({
          plugins: [{ ...entry("demo-shared", "1.0.0"), authorId: "owner-one" }],
          sources: [{ url: "https://github.com/owner-three/catalog-repo-c", authorId: "owner-three", addedAt: "2026-11-20" }],
        });
      }
      if (url === COLLECTED_URL) return catalogText(entry("demo-shared", "1.5.0"));
      if (url === AUTHOR_URL) return catalogText(entry("demo-shared", "1.0.0"), entry("demo-user", "1.0.0"));
      throw new Error(`unexpected ${url}`);
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.entries.find((e) => e.id === "demo-shared")).toMatchObject({ version: "1.5.0", sourceName: COLLECTED_NAME });
    expect(r.entries.find((e) => e.id === "demo-user")?.sourceName).toBe(AUTHOR_NAME);
    // sourceNames 按「官方 → 收录 → 用户」呈现
    expect(r.sourceNames).toEqual([OFFICIAL_NAME, COLLECTED_NAME, AUTHOR_NAME]);
    // 冲突回执：同 id 三次出现，两次被淘汰
    expect(r.deduped.map((d) => [d.id, d.kept])).toEqual([
      ["demo-shared", COLLECTED_NAME],
      ["demo-shared", COLLECTED_NAME],
    ]);
  });

  it("收录源与用户源指向同一仓库 → 只拉一次（身份去重）", async () => {
    stubConfig(["https://github.com/owner-three/catalog-repo-c"]);
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) {
        return catalogV2({
          plugins: [entry("demo-alpha", "1.0.0")],
          sources: [{ url: "https://github.com/owner-three/catalog-repo-c", authorId: "owner-three", addedAt: "2026-11-20" }],
        });
      }
      if (url === COLLECTED_URL) return catalogText(entry("demo-collected", "1.0.0"));
      throw new Error(`unexpected ${url}`);
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    const collectedCalls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === COLLECTED_URL,
    );
    expect(collectedCalls).toHaveLength(1);
    expect(r.entries.map((e) => e.id).sort()).toEqual(["demo-alpha", "demo-collected"]);
  });

  it("vendors.json 判定链：authorId 命中注册表 ⇒ 条目带 vendorId（UI 零再判）；未命中原样", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) {
        return catalogV2({
          plugins: [
            { ...entry("demo-official", "1.0.0"), authorId: "owner-one" },
            { ...entry("demo-community", "1.0.0"), authorId: "owner-two" },
          ],
        });
      }
      if (url === VENDORS_URL) {
        return JSON.stringify([{ vendorId: "owner-one", name: "One", verifiedBy: "manual", verifiedAt: "2026-11-20" }]);
      }
      throw new Error(`unexpected ${url}`);
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.entries.find((e) => e.id === "demo-official")?.vendorId).toBe("owner-one");
    expect(r.entries.find((e) => e.id === "demo-community")?.vendorId).toBeUndefined();
  });

  it("v1 目录无 authorId ⇒ 不拉 vendors.json（旧目录零新增请求）", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return catalogText(entry("demo-alpha", "1.0.0"));
      throw new Error(`unexpected ${url}`);
    });
    __setCatalogIO(fetchFn, fakeStorage());
    await loadCatalog();
    const calls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls).toEqual([OFFICIAL_SOURCE_URL]);
  });

  it("K5 回落链：用户源无 marketplace.json（404）→ plugin.json 合成 1 条，state 仍 ok", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return catalogText(entry("demo-alpha", "1.0.0"));
      if (url === AUTHOR_URL) throw new Error("HTTP 404");
      if (url === MANIFEST_URL_OF_AUTHOR) {
        return JSON.stringify({ pluginId: "demo-l0", name: "Demo L0", version: "0.3.0", author: "Owner Two" });
      }
      throw new Error(`unexpected ${url}`);
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("ok");
    expect(r.errors).toEqual([]);
    const synthesized = r.entries.find((e) => e.id === "demo-l0");
    expect(synthesized).toMatchObject({
      version: "0.3.0",
      sourceName: AUTHOR_NAME,
      author: { name: "Owner Two" },
      repository: "https://github.com/owner-two/catalog-repo-b",
    });
    expect(synthesized?.downloadUrl).toBe(
      "https://github.com/owner-two/catalog-repo-b/releases/download/v0.3.0/demo-l0.linkdesk-plugin",
    );
  });

  it("K5 回落链：marketplace.json 与 plugin.json 都没有 → 该源报 missing-manifest（UI 给模板链接）", async () => {
    stubConfig([AUTHOR_URL]);
    const fetchFn = vi.fn(async (url: string) => {
      if (url === OFFICIAL_SOURCE_URL) return catalogText(entry("demo-alpha", "1.0.0"));
      throw new Error("HTTP 404");
    });
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.state).toBe("ok"); // 官方源仍交付
    expect(r.errors).toEqual([{ sourceName: AUTHOR_NAME, reason: "missing-manifest" }]);
    expect(r.entries.map((e) => e.id)).toEqual(["demo-alpha"]);
  });

  it("根级声明交付：rail 顺序消费 + collections 直传 + 声明警告带来源名", async () => {
    const fetchFn = vi.fn(async () =>
      catalogV2({
        plugins: [{ ...entry("demo-alpha", "1.0.0"), category: "made-up" }],
        collections: [{ id: "picks", title: "编辑推荐", items: ["demo-alpha"] }],
        categoryRail: { order: ["themes", "made-up", "development"] },
      }),
    );
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.railOrder).toEqual([
      "themes",
      "development",
      "documents",
      "hardware",
      "network",
      "productivity",
      "entertainment",
      "other",
    ]);
    expect(r.collections).toEqual([
      { id: "picks", title: "编辑推荐", subtitle: undefined, hint: undefined, cover: undefined, layout: undefined, items: ["demo-alpha"], order: undefined },
    ]);
    expect(r.warnings).toEqual([
      { code: "unknown-category", entryId: "demo-alpha", detail: "made-up", source: OFFICIAL_NAME },
      { code: "unknown-rail-category", detail: "made-up", source: OFFICIAL_NAME },
    ]);
  });

  it("旧目录回落（06 §七）：v1 目录 ⇒ rail 规范序、无合集、零警告", async () => {
    const fetchFn = vi.fn(async () => catalogText(entry("demo-alpha", "1.0.0")));
    __setCatalogIO(fetchFn, fakeStorage());
    const r = await loadCatalog();
    expect(r.railOrder).toEqual([
      "development",
      "documents",
      "hardware",
      "network",
      "productivity",
      "themes",
      "entertainment",
      "other",
    ]);
    expect(r.collections).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.deduped).toEqual([]);
  });

  /* ── #10 源记录形态升级（读兼容） ── */

  it("readSourceRecords：旧 string / {url} / 全记录三形态归一；停用与本地记录不参与拉取", async () => {
    stubConfig([
      AUTHOR_URL,
      { url: "https://github.com/owner-four/catalog-repo-d" },
      {
        kind: "remote",
        url: "https://github.com/owner-five/catalog-repo-e",
        authorId: "owner-five",
        repoId: "catalog-repo-e",
        enabled: false,
        status: "ok",
        fetchedAt: 123,
      },
      { kind: "local", path: "E:/demo-local/demo-plugin", repoId: "demo-plugin" },
    ]);
    const records = await readSourceRecords();
    expect(records.map((r) => [r.kind, r.authorId, r.repoId, r.enabled, r.status])).toEqual([
      ["remote", "owner-two", "catalog-repo-b", true, "unknown"],
      ["remote", "owner-four", "catalog-repo-d", true, "unknown"],
      ["remote", "owner-five", "catalog-repo-e", false, "ok"],
      ["local", "__local", "demo-plugin", true, "unknown"],
    ]);
    const urls = await getSourceUrls();
    // 官方 + 两个启用的 remote；停用源与本地记录不拉取
    expect(urls).toEqual([
      OFFICIAL_SOURCE_URL,
      AUTHOR_URL,
      "https://raw.githubusercontent.com/owner-four/catalog-repo-d/HEAD/marketplace.json",
    ]);
  });

  it("normalizeSourceRecord：认不出的形态返回 null；本地记录 authorId 固定 __local", () => {
    expect(normalizeSourceRecord("")).toBeNull();
    expect(normalizeSourceRecord({})).toBeNull();
    expect(normalizeSourceRecord({ url: "not-a-url" })).toEqual({
      kind: "remote",
      url: "not-a-url",
      authorId: "",
      repoId: "",
      enabled: true,
      status: "unknown",
    });
    expect(normalizeSourceRecord({ path: "E:/demo-local/demo-plugin" })).toMatchObject({
      kind: "local",
      authorId: "__local",
      repoId: "demo-plugin",
    });
  });
});
