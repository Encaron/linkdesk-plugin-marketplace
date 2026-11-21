/**
 * SourcesView — 来源管理页（R4-3.14；04 §六 / 08 §三·110–114 现行形态）。
 *
 * 语义：**条目按仓库、展示按作者聚合**——
 *   - 官方锁定行（恒内置、不可移除/不参与排序）；
 *   - 作者组（同 authorId 多仓一组；可折叠；组头药丸「N 个仓库 / M 个插件」＋声明提示）；
 *     行内动作：↑↓（限同作者）/ 刷新（单源）/ 停用（源级）/ 移除（二次确认＋可勾选同时卸载）；
 *   - 本地安装组（溯源语义；只有插件级启停与卸载，⛔ 无源级停用）。
 *
 * 写路径全走 `services/sourceAdmin`（配置原始数组纪律）与命令面（`marketplace.removeSource`）；
 * 本件只读展示＋调单点，⛔ 自己读写配置。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPortal } from "@linkdesk/ui";
import { EmptyState, hueBG, Icon } from "../../../ui";
import { normalizeSourceUrl, sourceNameOfUrl } from "../../../services/marketCatalog";
import { readSourceRecords, type SourceRecord } from "../../../services/marketSources";
import { useAuthorDomains, refreshAuthorDomains } from "../../../services/authors";
import { scheduleDataRefresh, useMarketplacePlugins } from "../../../services/marketplaceShared";
import { readLocalInstalls, forgetLocalInstall, type LocalInstallRecord } from "../../../services/localInstalls";
import {
  moveSource,
  refreshSource,
  setSourceEnabled,
  uninstallPluginIds,
} from "../../../services/sourceAdmin";
import { openExternal, showToast } from "../../../services/hostApi";
import { PLUGIN_TEMPLATE_URL } from "./AddSourceModal";
import { useStore } from "../StoreContext";
import { authorWarningLines } from "../authors/authorWarnings";
import { catalogWarningLines } from "./catalogWarnings";
import { summarizeWarnings } from "./warningSummary";
import { agoText, groupRemoteSources, type AuthorSourceGroup, type SourceRowView } from "./sourcesData";

type PendingRemove =
  | { kind: "remote"; group: AuthorSourceGroup; record: SourceRecord; installedIds: string[] }
  | { kind: "local"; record: LocalInstallRecord; name: string };

function useSourceRecords(): [SourceRecord[], () => void] {
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void readSourceRecords().then((r) => {
      if (alive) setRecords(r);
    });
    return () => {
      alive = false;
    };
  }, [tick]);
  return [records, useCallback(() => setTick((t) => t + 1), [])];
}

function useLocalInstalls(installedIds: ReadonlySet<string>): [LocalInstallRecord[], () => void] {
  const [records, setRecords] = useState<LocalInstallRecord[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void readLocalInstalls().then((rows) => {
      if (!alive) return;
      // 06 §九：壳侧列表里没有的条目渲染时忽略并自清（记录不是真相源）
      const live = rows.filter((r) => installedIds.has(r.pluginId));
      for (const dead of rows) if (!installedIds.has(dead.pluginId)) void forgetLocalInstall(dead.pluginId);
      setRecords(live);
    });
    return () => {
      alive = false;
    };
  }, [tick, installedIds]);
  return [records, useCallback(() => setTick((t) => t + 1), [])];
}

export function SourcesView() {
  const { t } = useTranslation();
  const { data, navigate, openAddSource } = useStore();
  const { all, disabledRaw } = useMarketplacePlugins();
  const [records, reloadRecords] = useSourceRecords();
  const { domains } = useAuthorDomains(data.catalog.entries.length);
  const installedIds = useMemo(
    () => new Set([...all.map((p) => p.pluginId), ...disabledRaw.map((p) => p.pluginId)]),
    [all, disabledRaw],
  );
  const [localRecords, reloadLocal] = useLocalInstalls(installedIds);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<PendingRemove | null>(null);
  const [removeInstalled, setRemoveInstalled] = useState(false);

  const groups = groupRemoteSources(
    records,
    domains,
    data.catalog.sourceStatus,
    data.catalog.entries,
    data.catalog.warnings,
  );
  const enabledSources = records.filter((r) => r.kind === "remote" && r.enabled).length;
  const officialCount = data.catalog.entries.filter((e) => e.official).length;
  /* R4-3.18：官方源也是网络源——目录条目缺抓取字段 / 分类声明越界同样要在来源页留痕。
   * 官方源不走作者组（恒锁定行），故单独按 warning.source 过滤。 */
  const officialWarnings = data.catalog.warnings.filter((w) => !!w.source && w.source === data.catalog.sourceNames[0]);
  const officialWarningLines = catalogWarningLines(t, officialWarnings);
  const officialWarnSummary = summarizeWarnings(t, officialWarnings);
  const totalPlugins = domains.reduce((n, d) => n + d.repos.reduce((m, r) => m + r.plugins.length, 0), 0);

  const toggleCollapse = (id: string) => {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const afterWrite = useCallback(() => {
    reloadRecords();
    void refreshAuthorDomains();
  }, [reloadRecords]);

  const onToggle = async (row: SourceRowView) => {
    const rec = row.record;
    if (!rec.url) return;
    const r = await setSourceEnabled(rec.url, !rec.enabled);
    if (!r.ok) {
      showToast(t("停用失败（{{reason}}）", { reason: r.reason }), { severity: "warning" });
      return;
    }
    afterWrite();
    showToast(rec.enabled ? t("已停用——插件退出商店；已安装的照常运行") : t("已启用——插件回到商店"), {
      severity: "success",
      key: "source-toggle",
    });
  };

  const onMove = async (rec: SourceRecord, dir: -1 | 1) => {
    if (!rec.url) return;
    const r = await moveSource(rec.url, dir);
    if (r.ok) afterWrite();
  };

  const onRefresh = async (rec: SourceRecord) => {
    if (!rec.url) return;
    const r = await refreshSource(rec.url);
    showToast(r.ok ? t("已重拉目录") : t("刷新失败——保持缓存"), {
      severity: r.ok ? "success" : "warning",
      key: "source-refresh",
    });
    if (r.ok) afterWrite();
  };

  const askRemoveRemote = (group: AuthorSourceGroup, row: SourceRowView) => {
    const sourceName = row.record.url ? sourceNameOfUrl(normalizeSourceUrl(row.record.url) ?? row.record.url) : "";
    const ids = data.catalog.entries
      .filter((e) => e.sourceName === sourceName && (data.statusOf(e) === "installed" || data.statusOf(e) === "update"))
      .map((e) => e.id);
    setRemoveInstalled(false);
    setPending({ kind: "remote", group, record: row.record, installedIds: ids });
  };

  const confirmRemove = async () => {
    if (!pending) return;
    if (pending.kind === "remote") {
      const rec = pending.record;
      const target = rec.url ?? rec.path ?? "";
      const r = (await window.linkdesk?.commands?.executeCommand?.("marketplace.removeSource", {
        url: target,
      })) as { ok?: boolean; reason?: string } | undefined;
      if (!r?.ok) {
        showToast(t("移除失败（{{reason}}）", { reason: r?.reason ?? "io" }), { severity: "warning" });
        setPending(null);
        return;
      }
      let uninstalled = 0;
      if (removeInstalled && pending.installedIds.length > 0) {
        uninstalled = await uninstallPluginIds(pending.installedIds);
      }
      setPending(null);
      afterWrite();
      showToast(
        uninstalled > 0
          ? t("已移除源，并卸载 {{count}} 个插件", { count: uninstalled })
          : t("已移除源——已装插件保留"),
        { severity: "success", key: "source-remove" },
      );
      return;
    }
    // 本地组：移除 = 卸载插件（删安装副本，原文件夹不动）+ 删溯源记录
    const id = pending.record.pluginId;
    const n = await uninstallPluginIds([id]);
    await forgetLocalInstall(id);
    setPending(null);
    reloadLocal();
    showToast(n > 0 ? t("已卸载本地插件——原文件夹不受影响") : t("卸载失败"), {
      severity: n > 0 ? "success" : "warning",
      key: "local-remove",
    });
  };

  const onToggleLocal = async (rec: LocalInstallRecord) => {
    const pm = window.linkdesk?.pluginManager;
    const isDisabled = disabledRaw.some((p) => p.pluginId === rec.pluginId);
    try {
      if (isDisabled) await pm?.enable(rec.pluginId);
      else await pm?.disable(rec.pluginId);
      scheduleDataRefresh();
      showToast(isDisabled ? t("已启用") : t("已停用——插件停止运行，数据保留"), {
        severity: "success",
        key: "local-toggle",
      });
    } catch {
      showToast(t("操作失败"), { severity: "warning" });
    }
  };

  const localName = (pluginId: string): string =>
    all.find((p) => p.pluginId === pluginId)?.manifest.name ??
    disabledRaw.find((p) => p.pluginId === pluginId)?.name ??
    pluginId;

  return (
    <>
      <div className="marketplace-store-src-summary">
        {t("{{authors}} 位作者 · {{sources}} 个作者源 · {{local}} 个本地插件 · 作者源共 {{plugins}} 个插件（官方源恒内置，不计入）", {
          authors: groups.length,
          sources: enabledSources,
          local: localRecords.length,
          plugins: totalPlugins,
        })}
      </div>
      <div className="marketplace-store-src-topbar">
        <button type="button" className="marketplace-ui-btn is-primary marketplace-store-src-add-big" onClick={() => openAddSource("remote")}>
          <Icon name="link" size="sm" />
          {t("添加网络源")}
        </button>
        <button type="button" className="marketplace-ui-btn is-secondary marketplace-store-src-add-big" onClick={() => openAddSource("local")}>
          <Icon name="folder" size="sm" />
          {t("添加本地插件")}
        </button>
        <span className="marketplace-store-src-topnote">
          {t("网络源＝仓库地址（同作者多仓自动合并）；本地＝直接选本机文件夹，不走网络")}
        </span>
      </div>

      <div className="marketplace-store-src-list">
        <div className="marketplace-store-src-row is-locked">
          <span className="marketplace-store-src-ico" style={{ background: "var(--accent)" }}>
            <Icon name="bag" />
          </span>
          <div className="marketplace-store-src-main">
            <div className="marketplace-store-src-name">
              {t("官方 Plugin Store")}
              <span className="marketplace-store-src-tag is-official">{t("官方")}</span>
              <span className="marketplace-store-src-tag">{t("内置")}</span>
            </div>
            <div className="marketplace-store-src-url">{data.catalog.sourceNames[0] ?? "raw.githubusercontent.com"}</div>
          </div>
          <span className="marketplace-store-src-meta">{t("{{count}} 个插件 · 恒内置", { count: officialCount })}</span>
          {officialWarningLines.length > 0 && (
            <span className="marketplace-store-src-warn" data-hint={officialWarningLines.join("\n")}>
              {officialWarnSummary.label}
            </span>
          )}
          <div className="marketplace-store-src-acts">
            <button type="button" className="marketplace-store-sbtn" disabled data-hint={t("官方源不可移除、不参与排序")}>
              {t("不可操作")}
            </button>
          </div>
        </div>

        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.authorId.toLowerCase());
          /* R4-3.18：作者块警告 ＋ 目录声明警告（含「目录缺抓取字段」）同处暴露 */
          const lines = [
            ...authorWarningLines(t, group.warnings),
            ...catalogWarningLines(t, group.catalogWarnings),
          ];
          const warnSummary = summarizeWarnings(t, [...group.warnings, ...group.catalogWarnings]);
          return (
            <div
              key={group.authorId}
              className={`marketplace-store-src-group ${isCollapsed ? "is-collapsed" : ""}`.trim()}
            >
              <div className="marketplace-store-src-ghead">
                <button
                  type="button"
                  className="marketplace-store-src-collapse"
                  aria-label={isCollapsed ? t("展开该作者的源") : t("折叠该作者的源")}
                  onClick={() => toggleCollapse(group.authorId.toLowerCase())}
                >
                  <Icon name="chevron-right" size="sm" />
                </button>
                <span className="marketplace-store-src-ico" style={hueBG(group.hue)}>
                  {group.name.slice(0, 1)}
                </span>
                <div className="marketplace-store-src-main">
                  <div className="marketplace-store-src-name">
                    <button
                      type="button"
                      className="marketplace-store-src-enter-name"
                      onClick={() => navigate({ page: "author", authorId: group.authorId })}
                    >
                      {group.name}
                    </button>
                    <span
                      className={`marketplace-store-src-tag ${group.official ? "is-official" : ""}`}
                    >
                      {group.official ? t("官方 ✓") : "GitHub"}
                    </span>
                    <span
                      className="marketplace-store-src-enter"
                      onClick={() => navigate({ page: "author", authorId: group.authorId })}
                    >
                      {t("进入该作者主页")}
                      <Icon name="chevron-right" size="sm" />
                    </span>
                  </div>
                  <div className="marketplace-store-src-sub">
                    {t("{{count}} 个市场源 · 同一作者多个仓库自动合并", { count: group.rows.length })}
                  </div>
                </div>
                {lines.length > 0 && (
                  <span className="marketplace-store-src-warn" data-hint={lines.join("\n")}>
                    {warnSummary.label}
                  </span>
                )}
                <span className="marketplace-store-src-pill">
                  <b>{group.repoCount}</b> {t("个仓库")}
                </span>
                <span className="marketplace-store-src-pill">
                  <b>{group.pluginCount}</b> {t("个插件")}
                </span>
              </div>
              {group.rows.map((row, i) => {
                const rec = row.record;
                const failed = row.status === "error";
                return (
                  <div
                    key={`${rec.url}:${i}`}
                    className={`marketplace-store-src-line ${rec.enabled ? "" : "is-off"}`.trim()}
                  >
                    <span className="marketplace-store-src-repo">{rec.repoId || "—"}</span>
                    <span className="marketplace-store-src-url" data-hint={rec.url}>
                      {rec.url}
                    </span>
                    <span className="marketplace-store-src-meta">
                      {!rec.enabled ? (
                        t("已停用")
                      ) : failed ? (
                        <>
                          <b className="marketplace-store-src-err">{t("加载失败 · 用缓存")}</b>
                          {row.reason === "missing-manifest" && (
                            <button
                              type="button"
                              className="marketplace-store-m-link is-inline"
                              onClick={() => void openExternal(PLUGIN_TEMPLATE_URL)}
                            >
                              {t("模板")}
                            </button>
                          )}
                        </>
                      ) : (
                        t("目录拉取 {{when}}", { when: agoText(t, data.catalog.fetchedAt) })
                      )}
                    </span>
                    <div className="marketplace-store-src-acts">
                      <button
                        type="button"
                        className="marketplace-store-src-icon"
                        aria-label={t("上移（限同作者内）")}
                        data-hint={t("上移（限同作者内）")}
                        disabled={i === 0}
                        onClick={() => void onMove(rec, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="marketplace-store-src-icon"
                        aria-label={t("下移（限同作者内）")}
                        data-hint={t("下移（限同作者内）")}
                        disabled={i === group.rows.length - 1}
                        onClick={() => void onMove(rec, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="marketplace-store-src-icon"
                        aria-label={t("立即重拉该目录")}
                        data-hint={t("立即重拉该目录")}
                        onClick={() => void onRefresh(rec)}
                      >
                        <Icon name="refresh" size="sm" />
                      </button>
                      <button
                        type="button"
                        className="marketplace-store-sbtn"
                        data-hint={t("源级停用：不再拉取、插件退出商店；已安装的插件照常运行")}
                        onClick={() => void onToggle(row)}
                      >
                        {rec.enabled ? t("停用") : t("启用")}
                      </button>
                      <button
                        type="button"
                        className="marketplace-store-src-icon is-danger"
                        aria-label={t("移除该源")}
                        data-hint={t("移除该源与缓存（作者信息一并清理）；已装插件默认保留")}
                        onClick={() => askRemoveRemote(group, row)}
                      >
                        <Icon name="x" size="sm" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {localRecords.length > 0 && (
          <div className={`marketplace-store-src-group ${collapsed.has("__local") ? "is-collapsed" : ""}`.trim()}>
            <div className="marketplace-store-src-ghead">
              <button
                type="button"
                className="marketplace-store-src-collapse"
                aria-label={t("折叠本地插件")}
                onClick={() => toggleCollapse("__local")}
              >
                <Icon name="chevron-right" size="sm" />
              </button>
              <span className="marketplace-store-src-ico is-muted">
                <Icon name="folder" />
              </span>
              <div className="marketplace-store-src-main">
                <div className="marketplace-store-src-name">{t("本地安装")}</div>
                <div className="marketplace-store-src-sub">
                  {t("从本机文件夹/离线包复制安装的插件——原路径只作溯源，不随外部改动")}
                </div>
              </div>
              <span className="marketplace-store-src-pill">
                <b>{localRecords.length}</b> {t("个插件")}
              </span>
            </div>
            {localRecords.map((rec) => {
              const disabled = disabledRaw.some((p) => p.pluginId === rec.pluginId);
              return (
                <div key={rec.pluginId} className={`marketplace-store-src-line ${disabled ? "is-off" : ""}`.trim()}>
                  <span className="marketplace-store-src-repo">{localName(rec.pluginId)}</span>
                  <span className="marketplace-store-src-url" data-hint={rec.sourcePath}>
                    {rec.sourcePath}
                  </span>
                  <span className="marketplace-store-src-meta">
                    {disabled ? t("已安装 · 已停用") : t("已安装 · 复制自")}
                  </span>
                  <div className="marketplace-store-src-acts">
                    <button
                      type="button"
                      className="marketplace-store-sbtn"
                      data-hint={t("插件级停用：不加载、退出商店；再次启用即恢复")}
                      onClick={() => void onToggleLocal(rec)}
                    >
                      {disabled ? t("启用") : t("停用")}
                    </button>
                    <button
                      type="button"
                      className="marketplace-store-src-icon is-danger"
                      aria-label={t("卸载该插件")}
                      data-hint={t("卸载该插件（删除本机安装副本；原文件夹不受影响）")}
                      onClick={() => setPending({ kind: "local", record: rec, name: localName(rec.pluginId) })}
                    >
                      <Icon name="x" size="sm" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {groups.length === 0 && localRecords.length === 0 && (
          <EmptyState title={t("还没有作者源")} sub={t("点上方「添加网络源」或「添加本地插件」")} />
        )}
      </div>

      <div className="marketplace-store-src-note">
        {t("排序影响：首页作者卡排列 ＋ 非 GitHub 作者的身份兜底。")}
        <br />
        {t("停用＝源级（不拉取/不进商店，已装插件照常运行）；移除＝删源与缓存（已装插件保留，可勾选一并卸载）。")}
      </div>

      {pending && (
        <OverlayPortal onClose={() => setPending(null)} trapFocus>
          <div
            className="marketplace-store-modal-bg"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPending(null);
            }}
          >
            <div className="marketplace-store-modal is-sm" role="dialog" aria-modal="true" aria-label={t("确认移除")}>
              <h2>{pending.kind === "remote" ? t("移除市场源") : t("卸载本地插件")}</h2>
              <div className="marketplace-store-m-sub">
                {pending.kind === "remote" ? (
                  <>
                    {t("将移除源")} <b>{pending.record.repoId || pending.record.url}</b>{" "}
                    {t("及其缓存。")}
                    <br />
                    {pending.installedIds.length > 0
                      ? t("该源有 {{count}} 个已安装插件——已装插件默认保留（可更新性会失去）。", {
                          count: pending.installedIds.length,
                        })
                      : t("该源暂无已安装插件。")}
                  </>
                ) : (
                  <>
                    {t("将卸载")} <b>{pending.name}</b>{" "}
                    {t("（删除本机安装副本；原文件夹不受影响）。")}
                  </>
                )}
              </div>
              {pending.kind === "remote" && pending.installedIds.length > 0 && (
                <label className="marketplace-store-cfm-check">
                  <input
                    type="checkbox"
                    checked={removeInstalled}
                    onChange={(e) => setRemoveInstalled(e.target.checked)}
                  />
                  {t("同时卸载这 {{count}} 个已装插件（不可撤销）", { count: pending.installedIds.length })}
                </label>
              )}
              <div className="marketplace-store-m-foot">
                <button type="button" className="marketplace-ui-btn is-secondary" onClick={() => setPending(null)}>
                  {t("取消")}
                </button>
                <button type="button" className="marketplace-ui-btn is-danger" onClick={() => void confirmRemove()}>
                  {pending.kind === "remote" ? t("移除源") : t("卸载")}
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </>
  );
}

export default SourcesView;
