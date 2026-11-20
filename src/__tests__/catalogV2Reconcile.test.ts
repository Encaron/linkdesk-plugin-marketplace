/**
 * 目录 v2 三方对账（R4-0.4 腿②）＋ 兼容矩阵（R4-0.5）——Marketplace-Store · 2026-11-20。
 *
 * 三方 = SDK schema / SDK TS 契约 / 本仓 parse 白名单。腿①③（TS↔schema、真实产出过 schema）
 * 住 SDK 仓 `marketplace-schema.test.ts`；**腿②住这里**——白名单本体（`normalizeEntry`）在本仓，
 * 对账对象是**本仓实际安装**的 `@linkdesk/plugin-sdk` schema（node_modules 实读，不指主仓路径：
 * 独立仓自足，CI 只装 npm 依赖）。防的就是 E6#106 / E6#77 乙那类「目录带着键进来、白名单静默丢」。
 *
 * 版本感知（SDK 攒到棒 12 一次发版——启动词 ⑤）：
 *   - 装到的 schema 已含 v2 标记（`$defs.authorBlock`）⇒ **严格等**：白名单文件键 === schema 键；
 *   - 还是 v1 schema ⇒ 退一档：schema 键 ⊆ 白名单键（**不静默丢**方向照钉）＋ 白名单超前的键
 *     ⊆ V2_PENDING（白名单也不许漫无边际地长）。SDK v2 一发版，严格等自动接管，PENDING 自然失效。
 *
 * 矩阵用例按 06 §七：旧读者读新目录（根级新键静默忽略、条目新字段流经白名单）；
 * 旧读者读旧目录（v2 字段缺省 undefined——「槽位不渲染」的数据前提）。落「其他」桶的分组判定
 * 属棒 3（分组函数尚未存在），此处钉其数据前提（categoryListFromEntry 缺省空表）。
 *
 * fixture 一律虚构值（硬约束 21）：demo-* id、example.invalid 域名。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "../services/marketCatalog";
import { PRIMARY_CATEGORY_SLUGS, SUBCATEGORY_SLUGS } from "../services/marketCatalog/categories";
import { PRIMARY_CATEGORY_SLUGS as KIT_PRIMARY, SUBCATEGORY_SLUGS as KIT_SUBCATEGORY } from "@linkdesk/marketplace-kit";
import { categoryListFromEntry } from "../services/marketCategories";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const SDK_SCHEMA_PATH = join(REPO_ROOT, "node_modules", "@linkdesk", "plugin-sdk", "schemas", "marketplace.schema.json");
const SDK_SCHEMA = JSON.parse(readFileSync(SDK_SCHEMA_PATH, "utf8")) as {
  properties?: Record<string, unknown>;
  $defs?: { pluginEntry?: { properties?: Record<string, unknown> } };
};

/** 合并注入键——parse 阶段不填、由 mergeCatalogs 注入（types.ts「合并注入」注释行），不参与文件键对账 */
const MERGE_INJECTED = new Set(["sourceName", "official", "sourceUrl"]);

/** 白名单超前于已装 schema 的 v2 键（SDK R4-0.2 已落 schema、未发版；发版后本组自然消融） */
const V2_PENDING = new Set(["categories", "screenshots", "license", "repository", "pricing", "authorId"]);

/** 白名单文件键集合——喂一条全字段探针，collect 输出的键 = 白名单本身（normalizeEntry 恒产出全部键） */
function whitelistFileKeys(): string[] {
  const probe = {
    plugins: [
      {
        id: "demo-plugin",
        name: "Demo",
        version: "1.0.0",
        description: "demo",
        author: { name: "Someone" },
        authorId: "demo-author",
        icon: "https://example.invalid/icon.svg",
        iconSource: "url",
        marketIcon: "https://example.invalid/market.svg",
        marketIconSource: "url",
        category: "hardware",
        categories: ["serial"],
        pricing: { model: "paid", licenseUrl: "https://example.invalid/buy" },
        downloadUrl: "https://example.invalid/demo.linkdesk-plugin",
        size: 1,
        publishedAt: "2026-11-20T00:00:00.000Z",
        minAppVersion: "0.2.13",
        readmeUrl: "https://example.invalid/README.md",
        screenshots: [
          { type: "video", url: "https://example.invalid/clip.mp4", poster: "https://example.invalid/poster.jpg" },
          "https://example.invalid/shot.png",
        ],
        license: "MIT",
        repository: "https://example.invalid/demo",
        versions: [{ version: "1.0.0", downloadUrl: "https://example.invalid/demo.linkdesk-plugin", publishedAt: "2026-11-20T00:00:00.000Z" }],
      },
    ],
  };
  const r = parseCatalog(JSON.stringify(probe));
  if (!r.ok) throw new Error("全字段探针解析失败——fixture 坏了");
  return Object.keys(r.catalog.plugins[0]!);
}

describe("R4-0.4 腿②——parse 白名单 ↔ SDK schema（按 node_modules 实装版本对账）", () => {
  const hasV2 = Boolean(SDK_SCHEMA.$defs?.authorBlock);
  const fileKeys = whitelistFileKeys().filter((k) => !MERGE_INJECTED.has(k));
  const schemaKeys = Object.keys(SDK_SCHEMA.$defs?.pluginEntry?.properties ?? {}).sort();

  it("已装 schema 的插件面 $defs.pluginEntry 存在（SDK 随包契约在场）", () => {
    expect(schemaKeys.length).toBeGreaterThan(0);
  });

  if (hasV2) {
    it("v2 schema 在场 ⇒ 严格等：白名单文件键 === schema pluginEntry keys（多字段/少字段即红）", () => {
      expect(fileKeys.slice().sort()).toEqual(schemaKeys);
    });
  } else {
    it("v1 schema 在场 ⇒ 不静默丢方向：schema 键 ⊆ 白名单键（E6#106 类坑的方向钉）", () => {
      const missing = schemaKeys.filter((k) => !fileKeys.includes(k));
      expect(missing).toEqual([]);
    });

    it("白名单超前的键 ⊆ V2_PENDING（白名单不许漫无边际地长——SDK v2 发版后本组自动让位严格等）", () => {
      const ahead = fileKeys.filter((k) => !schemaKeys.includes(k));
      expect(ahead.filter((k) => !V2_PENDING.has(k))).toEqual([]);
    });
  }
});

/* ── R4-0.5 兼容矩阵（06 §七）────────────────────────────────────────────────── */

const V2_CATALOG = {
  version: "1",
  updatedAt: "2026-11-20T00:00:00.000Z",
  // 根级 v2 三件——R4-2.1 起进解析面（老插件读它仍不炸：未知根键被 JSON.parse 保留、
  // 1.2.0 读者只取 version/updatedAt/plugins ⇒ 忽略即兼容；本断言钉「新读者必须交付」）
  sources: [{ url: "https://github.com/demo-author/catalog", authorId: "demo-author", addedAt: "2026-11-20" }],
  collections: [{ id: "editor-picks", title: "编辑推荐", layout: "strip", items: ["demo-plugin"] }],
  categoryRail: { order: ["development", "hardware"] },
  plugins: [
    {
      id: "demo-plugin",
      name: "Demo",
      version: "1.0.0",
      author: { name: "Demo Author" },
      // R4-3.18：抓取型字段（05 §02 网络源必有）——仓库/问题行与声明提示的判据源
      repository: "https://github.com/demo-author/demo-repo",
      downloadUrl: "https://example.invalid/demo.linkdesk-plugin",
      authorId: "demo-author",
      pricing: { model: "paid", licenseUrl: "https://example.invalid/buy", trialDays: 14, channel: "self" },
      screenshots: [
        { type: "video", url: "https://example.invalid/clip.mp4", poster: "https://example.invalid/poster.jpg" },
        "https://example.invalid/shot.png",
      ],
      versions: [{ version: "1.0.0", downloadUrl: "https://example.invalid/demo.linkdesk-plugin", publishedAt: "2026-11-20T00:00:00.000Z" }],
    },
  ],
};

describe("R4-0.5 兼容矩阵——v2 目录双向（R4-2.1 起根级字段进解析面）", () => {
  it("当前读者读 v2 目录：ok 不炸；根级 sources/collections/categoryRail 进解析面；条目 v2 字段流经白名单", () => {
    const r = parseCatalog(JSON.stringify(V2_CATALOG));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 条目级新字段原样带出（棒 3 合并 / 棒 10 渲染消费的数据前提）
    expect(r.catalog.plugins[0]!.authorId).toBe("demo-author");
    expect(r.catalog.plugins[0]!.pricing).toEqual({ model: "paid", licenseUrl: "https://example.invalid/buy", trialDays: 14, channel: "self" });
    expect(r.catalog.plugins[0]!.screenshots).toEqual(V2_CATALOG.plugins[0]!.screenshots);
    // 根级新键：R4-2.1 起为交付面（收录源/合集/rail 顺序）——不再是「静默忽略」
    expect(r.catalog.sources).toEqual(V2_CATALOG.sources);
    expect(r.catalog.collections).toEqual([
      { id: "editor-picks", title: "编辑推荐", subtitle: undefined, hint: undefined, cover: undefined, layout: "strip", items: ["demo-plugin"], order: undefined },
    ]);
    expect(r.catalog.categoryRail).toEqual({ order: ["development", "hardware"], icons: undefined });
    expect(r.warnings).toEqual([]); // 声明全在册，零警告
  });

  it("旧读者读 v1 目录：ok；v2 条目字段缺省 undefined（缺省规则）", () => {
    const v1 = {
      version: "1",
      plugins: [
        {
          id: "demo-plugin",
          name: "Demo",
          version: "1.0.0",
          downloadUrl: "https://example.invalid/demo.linkdesk-plugin",
          versions: [{ version: "1.0.0", downloadUrl: "https://example.invalid/demo.linkdesk-plugin", publishedAt: "2026-01-01T00:00:00.000Z" }],
        },
      ],
    };
    const r = parseCatalog(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.catalog.plugins[0]!.pricing).toBeUndefined();
    expect(r.catalog.plugins[0]!.authorId).toBeUndefined();
    expect(r.catalog.plugins[0]!.screenshots).toBeUndefined();
    // 「无分类值 ⇒ 落『其他』桶」的数据前提：无 category/categories ⇒ 归并表为空（分组判定随棒 3 落）
    expect(categoryListFromEntry(undefined, undefined)).toEqual([]);
    expect(categoryListFromEntry(r.catalog.plugins[0]!.category, r.catalog.plugins[0]!.categories)).toEqual([]);
  });
});

/* ── K2 第三腿（R4-4.2／棒 12 交办）：kit 白名单 ↔ 本仓 parse 白名单 ─────────────────
 * 棒 11 因启动词红线「市场插件仓本棒不碰」挂账到这里落笔——对账对象 = **本仓实际安装**的
 * `@linkdesk/marketplace-kit`（node_modules 实读，版本感知，与腿②对 SDK schema 同型）。
 * 两份名单都转录自正典 04 §5.1；这条腿把「⛔ 两份名单」变成机械事实：任一边扩/删名单即红。 */
describe("K2 第三腿——kit categoryWhitelist ↔ 本仓 categories 白名单（04 §5.1 同一正典）", () => {
  it("主分类 7 桶逐只相等（多桶/少桶即红）", () => {
    expect([...KIT_PRIMARY].sort()).toEqual([...PRIMARY_CATEGORY_SLUGS].sort());
  });

  it("小分类名单逐桶逐 slug 相等（桶内顺序 = 展示序，同序比对）", () => {
    expect(KIT_SUBCATEGORY).toEqual(SUBCATEGORY_SLUGS);
  });
});
