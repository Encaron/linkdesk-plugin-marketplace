/**
 * LibraryView — 我的库（R4-3.12/3.13；04 §六 / 08 §三·96 现行形态）。
 *
 * 定性：**状态管理面（我有什么）**，不是目录浏览。数据 = 壳已装/禁用列表 ⊕ 目录元数据 ⊕
 * 本地安装溯源（06 §九），⛔ 不建第二份已装真相；行内动作复用 `ActionButton`/`MoreMenu`。
 *
 * 本页包含：
 *   - 统计头（已安装/可更新/已停用）＋检查更新/全部更新/编辑/全部已读；
 *   - 库内搜索＋四筛选（状态/来源/作者/仓库）＋排序（含作者·仓库分组）＋平铺⇄详细（记忆）；
 *   - 可更新置顶；编辑模式（复选框默认隐藏/批量条/全选作用于当前筛选结果/退出清空）；
 *   - 「已购未安装」预留分区（棒 10 变实；本棒空态写实）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionButton,
  Badge,
  EmptyState,
  ChunkedReveal,
  Icon,
  licenseBadges,
  MoreMenu,
  moreMenuItems,
  resolveAction,
  restatesState,
  SORT_SETS,
  SortSelect,
  ViewSeg,
  type BadgeDesc,
} from "../../../ui";
import { useMarketplacePlugins } from "../../../services/marketplaceShared";
import { useLicenseEntitlements } from "../../../services/licensesView";
import { readLocalInstalls, type LocalInstallRecord } from "../../../services/localInstalls";
import type { LibSourceFilter } from "./libraryData";
import { SelectBox } from "@linkdesk/ui"; // F17（2026-11-21 橱窗判据）：原生 select 换装共享件
import { showToast } from "../../../services/hostApi";
import { installJobLabel } from "../../../services/installJobs";
import type { LibSort } from "../../../services/marketplaceShared/uiPrefs";
import { bulkDisable, bulkUninstall, markAllDiscoverRead, updateAll } from "../../../services/libraryActions";
import { CardGrid } from "../cards/CardGrid";
import { cardKeyDown, Tile, type StoreCardContext } from "../cards/cardParts";
import { useStore } from "../StoreContext";
import {
  buildLibraryRows,
  EMPTY_LIB_FILTERS,
  filterLibraryRows,
  libraryAuthorOptions,
  libraryRepoOptions,
  libraryStats,
  orderLibraryRows,
  purchasedNotInstalled,
  type LibFilters,
  type LibraryRow,
} from "./libraryData";

function useLocalInstallRecords(): LocalInstallRecord[] {
  const [records, setRecords] = useState<LocalInstallRecord[]>([]);
  useEffect(() => {
    let alive = true;
    void readLocalInstalls().then((r) => {
      if (alive) setRecords(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  return records;
}

function badgeOfRow(row: LibraryRow): BadgeDesc {
  const lic = licenseBadges(row.entry, row.license);
  if (lic.length > 0) return lic[0];
  if (row.core) return { kind: "core", key: "内置" };
  if (row.state === "disabled") return { kind: "muted", key: "已停用" };
  if (row.state === "update") return { kind: "update", key: "可更新" };
  return { kind: "installed", key: "已安装" };
}

function sizeText(size: number | undefined, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (size === undefined || Number.isNaN(size)) return "—";
  if (size >= 1024 * 1024) return t("{{n}} MB", { n: Math.round((size / 1024 / 1024) * 10) / 10 });
  if (size >= 1024) return t("{{n}} KB", { n: Math.round(size / 1024) });
  return t("{{n}} B", { n: size });
}

function sourceLabel(t: (k: string) => string, source: LibraryRow["source"]): string {
  return source === "official" ? t("官方") : source === "local" ? t("本地") : t("社区");
}

/** 行动作 = `resolveAction` 唯一判定（状态来自库行，其余上下文来自 data.ctxOf） */
function rowAction(
  row: LibraryRow,
  ctx: StoreCardContext,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  return resolveAction(row.entry, {
    state: row.state,
    online: ctx.online,
    core: row.core,
    license: row.license ?? ctx.license,
    job: ctx.job,
    jobLabel: ctx.job ? installJobLabel(t, ctx.job) : "",
    now: Date.now(),
  });
}

export function LibraryView() {
  const { t } = useTranslation();
  const { data, prefs, setLibView, setLibSort, actions, navigate, checkUpdates } = useStore();
  const { all, disabledRaw } = useMarketplacePlugins();
  const { map: licenses } = useLicenseEntitlements();
  const localInstalls = useLocalInstallRecords();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<LibFilters>({ ...EMPTY_LIB_FILTERS });
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const rows = useMemo(
    () =>
      buildLibraryRows({
        catalog: data.catalog.entries,
        installed: all,
        disabled: disabledRaw,
        localInstalls,
        licenses,
      }),
    [data.catalog.entries, all, disabledRaw, localInstalls, licenses],
  );
  const stats = libraryStats(rows);
  const authors = libraryAuthorOptions(rows);
  const repos = libraryRepoOptions(rows);
  // R4-5.3/I2：筛选/排序链 memo 化——nodes 身份稳定 ⇒ 分块渐进不误重置
  const filtered = useMemo(() => filterLibraryRows(rows, filters, search), [rows, filters, search]);
  const nodes = useMemo(
    () => orderLibraryRows(filtered, prefs.libSort as LibSort, filters.status === "all"),
    [filtered, prefs.libSort, filters.status],
  );
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.entry.id));
  const purchased = purchasedNotInstalled(data.catalog.entries, licenses, rows);

  const toggleEdit = useCallback(() => {
    setEditing((v) => {
      if (v) setSelected(new Set()); // 退出编辑自动清空
      return !v;
    });
  }, []);
  const toggleSelect = useCallback((id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onUpdateAll = async () => {
    const entries = rows
      .filter((r) => r.state === "update" && !r.core)
      .map((r) => r.entry)
      .filter((e) => !!e.downloadUrl);
    if (entries.length === 0) {
      showToast(t("所有插件已是最新"), { severity: "success", key: "lib-update-all" });
      return;
    }
    const r = await updateAll(entries, data.online, t);
    showToast(
      t("已更新 {{ok}} 个插件", { ok: r.ok }) +
        (r.failed ? ` · ${t("{{count}} 个失败", { count: r.failed })}` : ""),
      { severity: r.failed ? "warning" : "success", key: "lib-update-all" },
    );
  };
  const onMarkAllRead = async () => {
    const cleared = await markAllDiscoverRead();
    showToast(t("已全部标为已读 · {{count}} 项", { count: cleared }), {
      severity: "success",
      key: "lib-readall",
    });
  };

  const bulk = async (kind: "disable" | "uninstall") => {
    const ids = [...selected].filter((id) => {
      const row = rows.find((r) => r.entry.id === id);
      if (!row || row.core) return false;
      // 批量停用不重复作用于已停用行（批量卸载不限）
      return kind === "uninstall" || row.state !== "disabled";
    });
    if (ids.length === 0) return;
    const n = kind === "disable" ? await bulkDisable(ids) : await bulkUninstall(ids);
    setSelected(new Set());
    showToast(
      kind === "disable"
        ? t("已停用 {{count}} 个插件", { count: n })
        : t("已卸载 {{count}} 个插件", { count: n }),
      { severity: "success", key: `lib-bulk-${kind}` },
    );
  };

  const renderRow = (row: LibraryRow) => {
    const ctx = data.ctxOf(row.entry);
    const badge = badgeOfRow(row);
    const act = rowAction(row, ctx, t);
    // F32（2026-11-21）：状态由徽标一处出口——「已安装」动作钮不再渲染（同一事实画两遍）
    const redundantAct = restatesState(act);
    return (
      <div
        key={row.entry.id}
        className={`marketplace-store-lib-row ${row.state === "disabled" ? "is-disabled" : ""} ${editing ? "is-editing" : ""}`.trim()}
        role="button"
        tabIndex={0}
        aria-label={t("{{name}}——查看详情", { name: row.entry.name })}
        data-entry={row.entry.id}
        onClick={() => (editing ? toggleSelect(row.entry.id) : actions.onOpen(row.entry))}
        onKeyDown={(e) =>
          cardKeyDown(e, () => (editing ? toggleSelect(row.entry.id) : actions.onOpen(row.entry)))
        }
      >
        {editing && (
          <input
            type="checkbox"
            className="marketplace-store-lib-check"
            checked={selected.has(row.entry.id)}
            aria-label={t("选择 {{name}}", { name: row.entry.name })}
            onChange={() => toggleSelect(row.entry.id)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {/* F31（2026-11-21）：库是管理中枢——图标是主信息源（扫一眼就认），不再只有文字 */}
        <Tile entry={row.entry} identity={ctx.installedIdentity} />
        <span className="marketplace-store-lib-main">
          <span className="marketplace-store-lib-name">
            {row.entry.name}
            <span className="marketplace-store-lib-ver">v{row.installedVersion ?? row.entry.version}</span>
          </span>
          <span className="marketplace-store-lib-sub">
            {row.source === "local"
              ? `${t("本地")} · ${row.localPath ?? ""}`
              : `${sourceLabel(t, row.source)} · ${row.repo || "—"}`}
          </span>
        </span>
        <span className="marketplace-store-lib-size">{sizeText(row.size, t)}</span>
        <span className="marketplace-store-lib-state">
          <Badge desc={badge} />
        </span>
        <span className="marketplace-store-lib-act">
          {!redundantAct && (
            <ActionButton action={act} onAct={(id) => actions.onAct(row.entry, id)} />
          )}
          <MoreMenu
            pluginId={row.entry.id}
            disabled={row.state === "disabled"}
            items={moreMenuItems(row.entry, { state: row.state, core: row.core })}
            onSelect={(id) => (id === "open" ? actions.onOpen(row.entry) : actions.onAct(row.entry, id))}
          />
        </span>
      </div>
    );
  };

  return (
    <>
      <div className="marketplace-store-lib-head">
        <div className="marketplace-store-lib-title">{t("我的库")}</div>
        <div className="marketplace-store-lib-sub">
          {t("{{installed}} 个已安装 · {{updatable}} 个可更新 · {{disabled}} 个已停用", stats)}
        </div>
        <div className="marketplace-store-lib-acts">
          <button type="button" className="marketplace-ui-btn is-secondary" onClick={() => void checkUpdates()}>
            <Icon name="refresh" size="sm" />
            {t("检查更新")}
            {stats.updatable > 0 ? ` · ${stats.updatable}` : ""}
          </button>
          <button
            type="button"
            className="marketplace-ui-btn is-primary"
            disabled={stats.updatable === 0}
            onClick={() => void onUpdateAll()}
          >
            {t("全部更新")}
          </button>
          <button type="button" className="marketplace-ui-btn is-secondary" onClick={toggleEdit}>
            {editing ? t("完成") : t("编辑")}
          </button>
          <button
            type="button"
            className="marketplace-ui-btn is-secondary"
            data-hint={t("清除分类/作者上的新内容角标——⛔ 不动更新数字")}
            onClick={() => void onMarkAllRead()}
          >
            {t("全部已读")}
          </button>
        </div>
      </div>

      <div className="marketplace-store-lib-toolbar">
        <div className="marketplace-store-lib-search">
          <Icon name="search" size="sm" />
          <input
            type="text"
            value={search}
            placeholder={t("在库中搜索…")}
            aria-label={t("在库中搜索")}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* F17（2026-11-21 橱窗判据）：原生 select → 共享 SelectBox（Chrome 原生皮在玻璃/主题下穿帮） */}
        {/* F34（2026-11-21）：共享 SelectBox 自带皮肤——⛔ 不传自定义 class（双层 border/background = 两侧白边） */}
        <SelectBox
          title={t("状态筛选")}
          value={filters.status}
          options={[
            { value: "all", label: t("全部状态") },
            { value: "upd", label: t("可更新") },
            { value: "off", label: t("已停用") },
            { value: "core", label: t("内置") },
          ]}
          onChange={(v) => setFilters({ ...filters, status: v as LibFilters["status"] })}
        />
        <SelectBox
          title={t("来源筛选")}
          value={filters.source}
          options={[
            { value: "all", label: t("全部来源") },
            { value: "official", label: t("官方") },
            { value: "third", label: t("社区") },
            { value: "local", label: t("本地插件") },
          ]}
          onChange={(v) => setFilters({ ...filters, source: v as LibSourceFilter })}
        />
        <SelectBox
          title={t("作者筛选")}
          value={filters.author}
          options={[{ value: "all", label: t("全部作者") }, ...authors.map((a) => ({ value: a, label: a }))]}
          onChange={(v) => setFilters({ ...filters, author: v })}
        />
        <SelectBox
          title={t("仓库筛选")}
          value={filters.repo}
          options={[{ value: "all", label: t("全部仓库") }, ...repos.map((r) => ({ value: r, label: r }))]}
          onChange={(v) => setFilters({ ...filters, repo: v })}
        />
        <span className="marketplace-store-tb-label">{t("排序")}</span>
        <SortSelect ariaLabel={t("排序")} value={prefs.libSort} options={SORT_SETS.lib} onChange={(v) => setLibSort(v as LibSort)} />
        <ViewSeg value={prefs.libView} onChange={setLibView} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="folder"
          title={t("你的库还是空的")}
          sub={t("去首页或分类页安装插件，它们会出现在这里")}
          action={
            <button type="button" className="marketplace-ui-btn is-primary" onClick={() => navigate({ page: "home" })}>
              {t("去逛逛")}
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="funnel" title={t("没有符合条件的插件")} sub={t("试试放宽筛选或清空搜索")} />
      ) : prefs.libView === "grid" ? (
        <div className={`marketplace-store-grid ${editing ? "is-editing" : ""}`.trim()}>
          {/* R4-5.3/I2：分块渐进（原语件唯一来源 = ui/ChunkedReveal）——大库不整挂 */}
          <ChunkedReveal
            items={nodes}
            renderItem={(node, i) =>
              node.kind === "group" ? (
                <div key={`g:${node.label}:${i}`} className="marketplace-store-group-h">
                  <span className="marketplace-store-group-name">{node.label}</span>
                  <span className="marketplace-store-group-n">{t("{{count}} 个插件", { count: node.count })}</span>
                </div>
              ) : (
                <div
                  key={node.row.entry.id}
                  className={`marketplace-store-lib-grid-wrap ${editing ? "is-editing" : ""}`.trim()}
                  onClickCapture={(e) => {
                    if (!editing) return;
                    e.stopPropagation();
                    toggleSelect(node.row.entry.id);
                  }}
                >
                  {editing && (
                    <input
                      type="checkbox"
                      className="marketplace-store-lib-check is-corner"
                      checked={selected.has(node.row.entry.id)}
                      aria-label={t("选择 {{name}}", { name: node.row.entry.name })}
                      onChange={() => toggleSelect(node.row.entry.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <CardGrid entry={node.row.entry} ctx={data.ctxOf(node.row.entry)} handlers={actions} />
                </div>
              )
            }
          />
        </div>
      ) : (
        <div className={`marketplace-store-lib-list ${editing ? "is-editing" : ""}`.trim()}>
          <ChunkedReveal
            items={nodes}
            renderItem={(node, i) =>
              node.kind === "group" ? (
                <div key={`g:${node.label}:${i}`} className="marketplace-store-lib-group-h">
                  <span className="marketplace-store-lib-group-t">{node.label}</span>
                  <span className="marketplace-store-lib-group-n">{t("{{count}} 个插件", { count: node.count })}</span>
                </div>
              ) : (
                renderRow(node.row)
              )
            }
          />
        </div>
      )}

      {editing && filtered.length > 0 && (
        <div className="marketplace-store-lib-bulk">
          <button
            type="button"
            className="marketplace-store-sbtn"
            onClick={() => {
              if (allSelected) setSelected(new Set());
              else setSelected(new Set(filtered.map((r) => r.entry.id)));
            }}
          >
            {allSelected ? t("取消全选") : t("全选")}
          </button>
          <span>{t("已选 {{count}} 项", { count: selected.size })}</span>
          <span className="marketplace-store-lib-bulk-grow" />
          <button type="button" className="marketplace-ui-btn is-secondary" onClick={() => void bulk("disable")}>
            {t("批量停用")}
          </button>
          <button type="button" className="marketplace-ui-btn is-danger" onClick={() => void bulk("uninstall")}>
            {t("批量卸载")}
          </button>
          <button type="button" className="marketplace-ui-btn is-secondary" onClick={toggleEdit}>
            {t("完成")}
          </button>
        </div>
      )}

      <div className="marketplace-store-lib-sec">
        <div className="marketplace-store-lib-sec-h">
          <span className="marketplace-store-lib-sec-t">{t("已购未安装")}</span>
          <span className="marketplace-store-lib-sec-n">{t("已验许可 · 未装包")}</span>
        </div>
        {purchased.length === 0 ? (
          <div className="marketplace-store-lib-sec-empty">
            {t("还没有已购未安装的插件")}
            <br />
            <span className="marketplace-store-lib-sec-hint">
              {t("买了许可还没装包的插件会出现在这里——一键安装")}
            </span>
          </div>
        ) : (
          <div className="marketplace-store-lib-list">
            {purchased.map((entry) => {
              const ctx = data.ctxOf(entry);
              const row: LibraryRow = {
                entry,
                state: "install",
                core: false,
                source: "third",
                author: "",
                repo: "",
                license: licenses.get(entry.id) ?? null,
              };
              return (
                <div
                  key={entry.id}
                  className="marketplace-store-lib-row"
                  role="button"
                  tabIndex={0}
                  aria-label={t("{{name}}——查看详情", { name: entry.name })}
                  onClick={() => actions.onOpen(entry)}
                  onKeyDown={(e) => cardKeyDown(e, () => actions.onOpen(entry))}
                >
                  <Tile entry={entry} identity={ctx.installedIdentity} />
                  <span className="marketplace-store-lib-main">
                    <span className="marketplace-store-lib-name">{entry.name}</span>
                    <span className="marketplace-store-lib-sub">{t("已购未安装")}</span>
                  </span>
                  <span className="marketplace-store-lib-state">
                    <Badge desc={{ kind: "owned", key: "已购 ✓" }} />
                  </span>
                  <span className="marketplace-store-lib-act">
                    <ActionButton action={rowAction(row, ctx, t)} onAct={(id) => actions.onAct(entry, id)} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default LibraryView;
