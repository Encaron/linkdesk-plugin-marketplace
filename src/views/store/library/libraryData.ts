/**
 * libraryData — 「我的库」的**纯推导层**（R4-3.12/3.13；10 §六：筛选/排序不进 JSX）。
 *
 * 真相源纪律（06 §九 / 08 §三·96）：
 *   - 已装 = 壳 `pluginManager.list()`（含禁用另表 `getDisabled()`），⛔ 本层不建第二份已装真相；
 *   - 目录元数据 = 统一池 entries（存在则合，缺则按 manifest 回退 id/名/版本——目录缺失不藏行）；
 *   - 本地安装记录（06 §九）只作**溯源**：命中 → 来源标「本地」＋显示原路径；
 *   - 更新状态 = 与商店/详情同源 `updateTargetFor`（⛔ 顶层 version 裸比）。
 *
 * 排序取 uiPrefs 的 6 键（name/updated/size/source/author/repo）；author/repo 出分组头。
 */

import type { PluginInfoEntry, PluginListEntry } from "@linkdesk/contracts";
import type { CatalogEntry } from "../../../services/marketCatalog";
import { updateTargetFor, versionDownloadUrl } from "../../../services/marketCatalog";
import type { PackageState } from "../../../services/catalogStatus";
import type { LocalInstallRecord } from "../../../services/localInstalls";
import type { LibSort } from "../../../services/marketplaceShared/uiPrefs";
import type { LicenseView } from "../../../ui";

export type LibStatusFilter = "all" | "upd" | "off" | "core";
export type LibSourceFilter = "all" | "official" | "third" | "local";

export interface LibraryRow {
  entry: CatalogEntry;
  state: PackageState;
  core: boolean;
  /** 已装版本（manifest/禁用表；目录条目版本可能更新） */
  installedVersion?: string;
  source: Exclude<LibSourceFilter, "all">;
  /** 展示用作者（无目录条目时回落 manifest.author / 空） */
  author: string;
  /** 展示用仓库（无目录条目时「本地」给原路径末段 / 空） */
  repo: string;
  size?: number;
  license?: LicenseView | null;
  /** 本地安装溯源路径（06 §九；只显示，不上报） */
  localPath?: string;
}

export interface LibraryBuildInput {
  catalog: readonly CatalogEntry[];
  installed: readonly PluginListEntry[];
  disabled: readonly PluginInfoEntry[];
  localInstalls: readonly LocalInstallRecord[];
  licenses: ReadonlyMap<string, LicenseView>;
}

function synthesizedEntry(
  id: string,
  name: string | undefined,
  version: string | undefined,
  manifest?: PluginListEntry["manifest"] | PluginInfoEntry,
): CatalogEntry {
  const m = manifest as
    | { description?: string; author?: string; icon?: string; iconSource?: CatalogEntry["iconSource"]; marketIcon?: string; marketIconSource?: CatalogEntry["marketIconSource"] }
    | undefined;
  return {
    id,
    name: name ?? id,
    version: version ?? "",
    ...(m?.description ? { description: m.description } : {}),
    ...(m?.author ? { author: m.author } : {}),
    ...(m?.icon ? { icon: m.icon } : {}),
    ...(m?.iconSource ? { iconSource: m.iconSource } : {}),
    ...(m?.marketIcon ? { marketIcon: m.marketIcon } : {}),
    ...(m?.marketIconSource ? { marketIconSource: m.marketIconSource } : {}),
  };
}

/** 已装/禁用列表 ⊕ 目录元数据 ⊕ 本地溯源 → 库行（每 pluginId 一行） */
export function buildLibraryRows(input: LibraryBuildInput): LibraryRow[] {
  const byId = new Map(input.catalog.map((e) => [e.id, e]));
  const localById = new Map(input.localInstalls.map((r) => [r.pluginId, r]));
  const rows = new Map<string, LibraryRow>();

  const push = (
    id: string,
    name: string | undefined,
    version: string | undefined,
    core: boolean | undefined,
    updatable: boolean | undefined,
    disabled: boolean,
    manifest?: PluginListEntry["manifest"] | PluginInfoEntry,
  ) => {
    if (!id || rows.has(id)) return;
    const catalog = byId.get(id);
    const local = localById.get(id);
    const entry = catalog ?? synthesizedEntry(id, name, version, manifest);
    const state: PackageState = disabled
      ? "disabled"
      : updateTargetFor(entry, version ?? "", updatable)
        ? "update"
        : "installed";
    const source: LibraryRow["source"] = local
      ? "local"
      : catalog
        ? catalog.official || catalog.vendorId
          ? "official"
          : catalog.sourceName === "local" || catalog.author === "本地"
            ? "local"
            : "third"
        : core
          ? "official"
          : "third";
    const catAuthor = catalog
      ? typeof catalog.author === "string"
        ? catalog.author
        : catalog.author?.name ?? ""
      : (manifest as { author?: string } | undefined)?.author ?? "";
    rows.set(id, {
      entry,
      state,
      core: !!core,
      ...(version ? { installedVersion: version } : {}),
      source,
      author: source === "local" ? "" : catAuthor,
      repo: source === "local" ? (local?.sourcePath ?? "") : (catalog?.sourceName ?? ""),
      ...(catalog?.size !== undefined ? { size: catalog.size } : {}),
      license: input.licenses.get(id) ?? null,
      ...(local ? { localPath: local.sourcePath } : {}),
    });
  };

  for (const p of input.disabled) {
    push(p.pluginId, p.name, p.version, p.core, p.updatable, true, p);
  }
  for (const p of input.installed) {
    push(
      p.pluginId,
      p.manifest.name,
      p.manifest.version,
      p.manifest.core,
      p.updatable,
      false,
      p.manifest,
    );
  }
  return [...rows.values()];
}

/* ═══ 筛选 ═══ */

export interface LibFilters {
  status: LibStatusFilter;
  source: LibSourceFilter;
  author: string;
  repo: string;
}

export const EMPTY_LIB_FILTERS: LibFilters = { status: "all", source: "all", author: "all", repo: "all" };

export function filterLibraryRows(rows: readonly LibraryRow[], f: LibFilters, search: string): LibraryRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !`${row.entry.name}${row.entry.id}${row.author}`.toLowerCase().includes(q)) return false;
    if (f.status === "upd" && row.state !== "update") return false;
    if (f.status === "off" && row.state !== "disabled") return false;
    if (f.status === "core" && !row.core) return false;
    if (f.source !== "all" && row.source !== f.source) return false;
    if (f.author !== "all" && (row.author || "") !== f.author) return false;
    if (f.repo !== "all" && (row.repo || "") !== f.repo) return false;
    return true;
  });
}

/** 筛选下拉的可选值（当前库里真实出现过的作者/仓库——⛔ 名称输入框，08 §三·筛选） */
export function libraryAuthorOptions(rows: readonly LibraryRow[]): string[] {
  return [...new Set(rows.map((r) => r.author).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh"));
}

export function libraryRepoOptions(rows: readonly LibraryRow[]): string[] {
  return [...new Set(rows.map((r) => r.repo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh"));
}

/* ═══ 排序 ═══ */

export type LibraryNode =
  | { kind: "group"; label: string; count: number }
  | { kind: "row"; row: LibraryRow };

const SOURCE_RANK: Record<LibraryRow["source"], number> = { official: 0, third: 1, local: 2 };

function byName(a: LibraryRow, b: LibraryRow): number {
  return a.entry.name.localeCompare(b.entry.name, "zh");
}

/**
 * 排序 + 分组。
 * - `author`/`repo` → 分组头（组间 A→Z、组内按名）；其余排序单列；
 * - `pinUpdatable`（状态筛选＝全部时由调用方传）→ 可更新置顶（08 §三·96）。
 */
export function orderLibraryRows(
  rows: readonly LibraryRow[],
  sort: LibSort,
  pinUpdatable = true,
): LibraryNode[] {
  const list = [...rows];
  if (sort === "author" || sort === "repo") {
    const keyOf = (r: LibraryRow) => (sort === "author" ? r.author : r.repo) || "—";
    const groups = new Map<string, LibraryRow[]>();
    for (const row of list) {
      const key = keyOf(row);
      const arr = groups.get(key);
      if (arr) arr.push(row);
      else groups.set(key, [row]);
    }
    const out: LibraryNode[] = [];
    for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b, "zh"))) {
      const group = groups.get(key)!;
      out.push({ kind: "group", label: key, count: group.length });
      for (const row of group.sort(byName)) out.push({ kind: "row", row });
    }
    return out;
  }
  if (sort === "updated") {
    list.sort(
      (a, b) =>
        (b.entry.publishedAt ?? "").localeCompare(a.entry.publishedAt ?? "") || byName(a, b),
    );
  } else if (sort === "size") {
    list.sort((a, b) => (b.size ?? -1) - (a.size ?? -1) || byName(a, b));
  } else if (sort === "source") {
    list.sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || byName(a, b));
  } else {
    list.sort(byName);
  }
  const ordered = pinUpdatable
    ? [...list.filter((r) => r.state === "update"), ...list.filter((r) => r.state !== "update")]
    : list;
  return ordered.map((row) => ({ kind: "row", row }));
}

/** 统计头：已装 / 可更新 / 已停用（禁用行计入已装总数） */
export function libraryStats(rows: readonly LibraryRow[]): {
  installed: number;
  updatable: number;
  disabled: number;
} {
  return {
    installed: rows.length,
    updatable: rows.filter((r) => r.state === "update").length,
    disabled: rows.filter((r) => r.state === "disabled").length,
  };
}

/** 「全部更新」的目标集——**唯一选择判据**（视图 ⛔ 自己再 filter 一遍）。
 *
 *  🔴 `core` **不参与选择**：`core: true` 唯一语义 = UI 不给卸载按钮（E6 §二·三 /
 *     `docs/02-Electron架构/插件生态与发布/03-插件市场/05-更新与版本.md` §147「core:true 的插件同规则
 *     可更新/降级——无内置排除」），不定义任何更新/版本行为。
 *     此前的 `!r.core` 恰好把「待更新全是随包件（editor/file-tree/settings）」这种常态排空 ⇒
 *     按钮亮着「3 个可更新」、点下去却弹「所有插件已是最新」——统计头（含 core）与动作集（排 core）自相矛盾。
 *     能不能真更新由住所闸 `updatable` 定（随包只读根的 state 压根不是 update），⛔ 不拿 core 二次判。
 *
 *  `missingDownload` 单独回：有更新但目录条目/releases 缺可下载地址 ⇒ 是「发不了包」，⛔ 不是「已是最新」。 */
export interface UpdateAllSelection {
  /** 批量更新入参（能解析出下载地址的目录条目） */
  entries: CatalogEntry[];
  /** state=update 的行数（含缺地址的）——判断「真没有」 */
  total: number;
  /** 有更新但解析不出下载地址的件数——视图据此如实说话 */
  missingDownload: number;
}

export function selectUpdateAllTargets(rows: readonly LibraryRow[]): UpdateAllSelection {
  const picked = rows.filter((r) => r.state === "update");
  const entries = picked
    .map((r) => r.entry)
    .filter((e) => !!versionDownloadUrl(e, e.version)); // 与 updateAll 取址同一处，⛔ 另写判据
  return { entries, total: picked.length, missingDownload: picked.length - entries.length };
}

/** 「已购未安装」分区（棒 10 变实；本棒渲染预留区＋空态）——已验许可、未装包 */
export function purchasedNotInstalled(
  catalog: readonly CatalogEntry[],
  licenses: ReadonlyMap<string, LicenseView>,
  rows: readonly LibraryRow[],
): CatalogEntry[] {
  const installed = new Set(rows.map((r) => r.entry.id));
  return catalog.filter((e) => !!e.pricing && licenses.has(e.id) && !installed.has(e.id));
}
