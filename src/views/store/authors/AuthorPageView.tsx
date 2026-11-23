/**
 * AuthorPageView — 作者页（**一页两模式**；19 §3；D3/D4）。
 *
 * 唯一跨作者浏览入口：按作者分组，作者容器卡（继承基础 `card` + 主题 token）——
 *   浏览模式：内容槽 = 仓库卡（点卡切 currentRepo → 回仓首页）；
 *   管理模式：内容槽 = 来源行（查看该仓/刷新/停用/移除；官方核心仓只读 ＋ 可刷新）。
 * 浏览/管理共用**同一个容器组件、同一个 pointer 拖动控制器**（⛔ 两套实现）。
 *
 * 顺序（D4）：作者容器 ↔ 作者容器交换；仓卡/源行只在本作者内交换；官方核心仓锁官方组第一；
 * 本地组固定末尾、不可拖。GUI 拖动与命令面同一份 `sourceAdmin.swapAuthors/swapRepos`。
 *
 * 来源页并入：`/sources` 只是本页管理模式的路由别名（⛔ 独立实现）。空态「还没有添加作者源」住这里。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lt } from "../../../services/i18nText";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPortal } from "@linkdesk/ui";
import { EmptyState, hueBG, Icon } from "../../../ui";
import { useAvatarSrc } from "./useAvatarSrc";
import { authorHueOf } from "./authorHue";
import {
  OFFICIAL_SOURCE_URL,
  normalizeSourceUrl,
  sourceNameOfUrl,
} from "../../../services/marketCatalog";
import type { AuthorRepoView } from "../../../services/authors";
import {
  OFFICIAL_AUTHOR_ID,
  officialDomainOf,
  refreshAuthorDomains,
  useAuthorDomains,
} from "../../../services/authors";
import { OFFICIAL_CORE_REPO_ID, isOfficialCoreRepo } from "../../../services/officialRepo";
import { orderedAuthorsOf, orderedReposOf, useSourceOrder } from "../../../services/sourceOrderStore";
import {
  swapAuthors,
  swapRepos,
  refreshSourceDetailed,
  setSourceEnabled,
  uninstallPluginIds,
} from "../../../services/sourceAdmin";
import { readSourceRecords, type SourceRecord } from "../../../services/marketSources";
import { onSourcesDefaultCollapsedChange, readSourcesDefaultCollapsed } from "../../../services/sourcesPrefs";
import { scheduleDataRefresh, useMarketplacePlugins } from "../../../services/marketplaceShared";
import { forgetLocalInstall, readLocalInstalls, type LocalInstallRecord } from "../../../services/localInstalls";
import { openExternal, showToast } from "../../../services/hostApi";
import { writeUIPrefs } from "../../../services/marketplaceShared/uiPrefs";
import { PLUGIN_TEMPLATE_URL } from "../sources/AddSourceModal";
import { authorWarningLines } from "./authorWarnings";
import { catalogWarningLines } from "../sources/catalogWarnings";
import { agoText, groupRemoteSources, type SourceRowView } from "../sources/sourcesData";
import { AuthorSwitchCard } from "./AuthorCard";
import { StickyBar } from "../StickyBar";
import { useSwapDrag } from "../drag/useSwapDrag";
import { useStore } from "../StoreContext";

export type AuthorPageMode = "browse" | "manage";

type PendingRemove =
  | { kind: "remote"; authorName: string; record: SourceRecord; installedIds: string[] }
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

const HINT_MAX_LINES = 8;
const HINT_SEP = String.fromCharCode(10);
function hintOf(t: (key: string, opts?: Record<string, unknown>) => string, lines: readonly string[]): string {
  if (lines.length <= HINT_MAX_LINES) return lines.join(HINT_SEP);
  return [...lines.slice(0, HINT_MAX_LINES), t("…还有 {{count}} 条", { count: lines.length - HINT_MAX_LINES })].join(HINT_SEP);
}

interface AuthorGroupView {
  authorId: string;
  name: string;
  hue: string;
  /** 作者域头像（GitHub 直链；与作者卡/坞胶囊同源，见 useAvatarSrc） */
  avatar?: string;
  official: boolean;
  repos: AuthorRepoView[];
  rows: SourceRowView[];
  sourceCount: number;
  pluginCount: number;
  warnings: Parameters<typeof authorWarningLines>[1];
  catalogWarnings: Parameters<typeof catalogWarningLines>[1];
  missingBlock: boolean;
}

function AuthorContainer({
  group,
  mode,
  collapsed,
  current,
  onToggle,
  onPointerDown,
  onKeyDown,
  children,
}: {
  group: AuthorGroupView;
  mode: AuthorPageMode;
  collapsed: boolean;
  current: boolean;
  onToggle: () => void;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  /** 头像与作者卡/坞胶囊同源（远端 → 本地缓存 → 首字母）；色同理取自图片主色 */
  const { src: avSrc, hue: avHue, onError: onAvError } = useAvatarSrc(group.authorId, group.avatar);
  const headProps = {
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": !collapsed,
    "aria-label": collapsed
      ? t("展开 {{name}} 的卡片", { name: group.name })
      : t("折叠 {{name}} 的卡片", { name: group.name }),
    onClick: onToggle,
  };
  return (
    <section
      className={`marketplace-store-card marketplace-store-author-container ${collapsed ? "is-collapsed" : ""} ${current ? "is-current" : ""}`.trim()}
      data-swap-kind="author"
      data-swap-author={group.authorId}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div className="marketplace-store-author-container-head" {...headProps}>
        <span className="marketplace-store-author-grip" aria-hidden="true">
          ⋮⋮
        </span>
        <span className="marketplace-store-author-av" style={hueBG(avHue ?? group.hue)}>
          {avSrc ? (
            <img
              className="marketplace-store-author-av-img"
              src={avSrc}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={onAvError}
            />
          ) : (
            group.name.slice(0, 1)
          )}
        </span>
        <div className="marketplace-store-author-main">
          <div className="marketplace-store-author-name">
            {group.name}
            <span className={`marketplace-store-author-badge ${group.official ? "is-official" : ""}`.trim()}>
              {group.official ? t("官方 ✓") : t("社区源")}
            </span>
            {current && <span className="marketplace-store-author-current">{t("当前")}</span>}
          </div>
          <div className="marketplace-store-author-sub">
            {t("{{sources}} 个市场源 · {{repos}} 个仓库 · {{plugins}} 个插件", {
              sources: group.sourceCount,
              repos: group.repos.length || group.rows.filter((r) => r.record.enabled).length,
              plugins: group.pluginCount,
            })}
          </div>
        </div>
        <span className="marketplace-store-author-chev" aria-hidden="true">
          <Icon name="chevron-right" size="sm" />
        </span>
      </div>
      {!collapsed && <div className={`marketplace-store-author-body is-${mode}`}>{children}</div>}
    </section>
  );
}

export function AuthorPageView({ mode }: { mode: AuthorPageMode }) {
  const { t } = useTranslation();
  const { data, navigate, openAddSource, prefs, contentRef } = useStore();
  const { all, disabledRaw } = useMarketplacePlugins();
  const [records, reloadRecords] = useSourceRecords();
  const { domains } = useAuthorDomains(data.catalog.entries.length);
  const order = useSourceOrder(data.catalog.entries, domains);
  const installedIds = useMemo(
    () => new Set([...all.map((p) => p.pluginId), ...disabledRaw.map((p) => p.pluginId)]),
    [all, disabledRaw],
  );
  const [localRecords, reloadLocal] = useLocalInstalls(installedIds);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [defaultCollapsed, setDefaultCollapsed] = useState(false);
  const collapseTouched = useRef(false);
  const [pending, setPending] = useState<PendingRemove | null>(null);
  const [removeInstalled, setRemoveInstalled] = useState(false);

  /* 作者组 = 官方组（合成）＋第三方来源组；顺序读 marketplaceSources（D4） */
  const groups = useMemo<AuthorGroupView[]>(() => {
    const officialDomain = officialDomainOf(data.catalog.entries) ?? undefined;
    const officialRepos = officialDomain ? orderedReposOf(order, officialDomain) : [];
    const remoteGroups = groupRemoteSources(
      records,
      domains,
      data.catalog.sourceStatus,
      data.catalog.entries,
      data.catalog.warnings,
    ).filter((g) => g.authorId.toLowerCase() !== OFFICIAL_AUTHOR_ID);

    const officialWarnings = data.catalog.warnings.filter(
      (w) => !!w.source && w.source === data.catalog.sourceNames[0],
    );
    const official: AuthorGroupView = {
      authorId: OFFICIAL_AUTHOR_ID,
      name: officialDomain?.name ?? "Encaron",
      hue: authorHueOf(OFFICIAL_AUTHOR_ID),
      avatar: officialDomain?.avatar,
      official: true,
      repos: officialRepos,
      rows: [
        {
          record: {
            kind: "remote",
            url: OFFICIAL_SOURCE_URL,
            authorId: OFFICIAL_AUTHOR_ID,
            repoId: OFFICIAL_CORE_REPO_ID,
            enabled: true,
            status: "ok",
          },
          status: "ok",
        },
      ],
      sourceCount: 1,
      pluginCount: officialRepos.reduce((n, r) => n + r.plugins.length, 0),
      warnings: officialDomain?.warnings ?? [],
      catalogWarnings: officialWarnings,
      missingBlock: false,
    };

    const third: AuthorGroupView[] = remoteGroups.map((g) => {
      const domain = domains.find((d) => d.authorId.toLowerCase() === g.authorId.toLowerCase());
      return {
        authorId: g.authorId,
        name: g.name,
        hue: g.hue,
        avatar: domain?.avatar,
        official: g.official,
        repos: domain ? orderedReposOf(order, domain) : [],
        rows: g.rows,
        sourceCount: g.rows.length,
        pluginCount: domain
          ? domain.repos.reduce((n, r) => n + r.plugins.length, 0)
          : g.pluginCount,
        warnings: g.warnings,
        catalogWarnings: g.catalogWarnings,
        missingBlock: !domain,
      };
    });

    const byId = new Map<string, AuthorGroupView>([[OFFICIAL_AUTHOR_ID, official]]);
    for (const g of third) byId.set(g.authorId.toLowerCase(), g);
    const ordered: AuthorGroupView[] = [];
    for (const id of order.authorOrder) {
      const g = byId.get(id.toLowerCase());
      if (g && !ordered.includes(g)) ordered.push(g);
    }
    for (const g of byId.values()) if (!ordered.includes(g)) ordered.push(g);
    return ordered;
  }, [records, domains, data.catalog, order]);

  const thirdPartyCount = groups.filter((g) => !g.official).length;

  /* 默认开合：设置页/命令写同一配置键；用户手动点过之后本次会话以用户为准 */
  useEffect(() => {
    let alive = true;
    void readSourcesDefaultCollapsed().then((v) => {
      if (alive) setDefaultCollapsed(v);
    });
    const un = onSourcesDefaultCollapsedChange((v) => setDefaultCollapsed(v));
    return () => {
      alive = false;
      un();
    };
  }, []);
  const groupSig = [
    ...groups.map((g) => g.authorId.toLowerCase()),
    ...(localRecords.length > 0 ? ["__local"] : []),
  ].join("|");
  useEffect(() => {
    if (collapseTouched.current || !groupSig) return;
    const ids = groupSig.split("|").filter(Boolean);
    setCollapsed(defaultCollapsed ? new Set(ids) : new Set());
  }, [defaultCollapsed, groupSig]);

  const toggleCollapse = (id: string) => {
    collapseTouched.current = true;
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

  const reject = useCallback(
    (reason: "cross-author" | "locked") => {
      showToast(
        reason === "cross-author"
          ? t("仓库只能在同一个作者内交换")
          : t("这个仓库固定在最前，不能换位置"),
        { key: "swap-repos", severity: "warning", ttl: 2400 },
      );
    },
    [t],
  );

  const { bind } = useSwapDrag({
    scrollRef: contentRef,
    onSwap: async (source, target) => {
      if (source.kind === "author") {
        const r = await swapAuthors(source.authorId, target.authorId);
        return r.ok;
      }
      if (source.authorId !== target.authorId) {
        reject("cross-author");
        return false;
      }
      if (!source.repoId || !target.repoId) return false;
      const r = await swapRepos(source.authorId, source.repoId, target.repoId);
      if (!r.ok) reject(r.reason === "locked" ? "locked" : "cross-author");
      return r.ok;
    },
    onReject: reject,
  });

  /* 拖动绑定的两种 spec（作者容器 / 仓卡·源行）——同一个控制器实例，⛔ 两套 */
  const authorBinding = (authorId: string) => {
    const b = bind({ kind: "author", authorId });
    return {
      ...b,
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if ((e.target as HTMLElement | null)?.closest('[data-swap-kind="repo"]')) return;
        b.onPointerDown(e);
      },
    };
  };
  const repoBinding = (authorId: string, repoId: string, locked: boolean) =>
    bind({ kind: "repo", authorId, repoId }, { locked });

  const onAuthorKeyDown = (e: ReactKeyboardEvent<HTMLElement>, authorId: string) => {
    if ((e.target as HTMLElement | null)?.closest('[data-swap-kind="repo"]')) return;
    if (!e.altKey) return;
    const dir = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
    if (!dir) return;
    const index = groups.findIndex((g) => g.authorId === authorId);
    const other = index >= 0 ? groups[index + dir] : undefined;
    if (!other) return;
    e.preventDefault();
    void swapAuthors(authorId, other.authorId);
  };

  const onRepoKeyDown = (
    e: ReactKeyboardEvent<HTMLElement>,
    group: AuthorGroupView,
    repoId: string,
  ) => {
    if (!e.altKey) return;
    const dir = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
    if (!dir) return;
    const ids = group.rows.map((r) => r.record.repoId);
    const index = ids.indexOf(repoId);
    const other = index >= 0 ? ids[index + dir] : undefined;
    if (!other) return;
    e.preventDefault();
    if (isOfficialCoreRepo(group.authorId, repoId) || isOfficialCoreRepo(group.authorId, other)) {
      reject("locked");
      return;
    }
    void swapRepos(group.authorId, repoId, other);
  };

  /* ── 管理动作（写路径全走单点） ── */
  const onToggle = async (rec: SourceRecord) => {
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

  const onRefresh = async (rec: SourceRecord, group: AuthorGroupView) => {
    if (!rec.url) return;
    const r = await refreshSourceDetailed(rec.url);
    const repoName = group.repos.find((x) => x.id === rec.repoId)?.name ?? rec.repoId;
    if (!r.ok) {
      showToast(t("「{{repo}}」刷新失败 · 已用缓存", { repo: repoName }), {
        severity: "warning",
        key: "source-refresh",
        ttl: 3600,
      });
    } else if (r.changed > 0) {
      showToast(t("「{{repo}}」已刷新 · 发现 {{count}} 个更新", { repo: repoName, count: r.changed }), {
        severity: "success",
        key: "source-refresh",
      });
    } else {
      showToast(t("「{{repo}}」已是最新", { repo: repoName }), {
        severity: "info",
        key: "source-refresh",
      });
    }
    if (r.ok) afterWrite();
  };

  const askRemoveRemote = (group: AuthorGroupView, row: SourceRowView) => {
    const sourceName = row.record.url
      ? sourceNameOfUrl(normalizeSourceUrl(row.record.url) ?? row.record.url)
      : "";
    const ids = data.catalog.entries
      .filter(
        (e) =>
          e.sourceName === sourceName &&
          (data.statusOf(e) === "installed" || data.statusOf(e) === "update"),
      )
      .map((e) => e.id);
    setRemoveInstalled(false);
    setPending({ kind: "remote", authorName: group.name, record: row.record, installedIds: ids });
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

  const setTip = (dismissed: boolean) => {
    void writeUIPrefs({ authorTipDismissed: dismissed }).catch(() => {});
  };

  const openRepo = (authorId: string, repoId: string) => {
    data.repo.setRepo({ authorId, repoId });
    navigate({ page: "home" });
  };

  const renderSourceRow = (group: AuthorGroupView, row: SourceRowView, index: number) => {
    const rec = row.record;
    const core = isOfficialCoreRepo(group.authorId, rec.repoId);
    const failed = row.status === "error";
    const locked = core;
    const binding = repoBinding(group.authorId, rec.repoId, locked);
    return (
      <div
        key={`${rec.url ?? rec.path}:${index}`}
        className={`marketplace-store-src-line ${rec.enabled ? "" : "is-off"} ${locked ? "is-locked" : ""}`.trim()}
        data-swap-kind="repo"
        data-swap-author={group.authorId}
        data-swap-repo={rec.repoId}
        {...(locked ? { "data-swap-locked": "1" } : {})}
        onPointerDown={binding.onPointerDown}
        onKeyDown={(e) => onRepoKeyDown(e, group, rec.repoId)}
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
            className="marketplace-store-src-view"
            disabled={!rec.enabled}
            data-hint={t("打开这个仓库的首页")}
            onClick={() => openRepo(group.authorId, rec.repoId)}
          >
            {t("查看该仓")}
          </button>
          <button
            type="button"
            className="marketplace-store-src-icon"
            aria-label={t("立即重拉该目录")}
            data-hint={t("立即重拉该目录")}
            onClick={() => void onRefresh(rec, group)}
          >
            <Icon name="refresh" size="sm" />
          </button>
          {locked ? (
            <span className="marketplace-store-src-locked">{t("不可移除")}</span>
          ) : (
            <>
              <button
                type="button"
                className="marketplace-store-sbtn"
                data-hint={t("源级停用：不再拉取、插件退出商店；已安装的插件照常运行")}
                onClick={() => void onToggle(rec)}
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
            </>
          )}
        </div>
      </div>
    );
  };

  const currentAuthorId = data.repo.authorId.toLowerCase();
  const localCollapsed = collapsed.has("__local");
  const tipDismissed = prefs.authorTipDismissed;

  return (
    <>
      <StickyBar group>
          <div className="marketplace-store-author-page-toolbar">
            <div className="marketplace-store-author-modes" role="group" aria-label={t("作者页模式")}>
              <button
                type="button"
                className={`marketplace-store-author-mode ${mode === "browse" ? "is-on" : ""}`}
                aria-pressed={mode === "browse"}
                onClick={() => navigate({ page: "authors", authorMode: "browse" })}
              >
                {t("浏览")}
              </button>
              <button
                type="button"
                className={`marketplace-store-author-mode ${mode === "manage" ? "is-on" : ""}`}
                aria-pressed={mode === "manage"}
                onClick={() => navigate({ page: "authors", authorMode: "manage" })}
              >
                {t("管理来源")}
              </button>
            </div>
            <span className="marketplace-store-author-toolbar-gap" />
            <button
              type="button"
              className="marketplace-ui-btn is-primary marketplace-store-src-add-big"
              onClick={() => openAddSource("remote")}
            >
              <Icon name="link" size="sm" />
              {t("添加网络源")}
            </button>
            <button
              type="button"
              className="marketplace-ui-btn is-secondary marketplace-store-src-add-big"
              onClick={() => openAddSource("local")}
            >
              <Icon name="folder" size="sm" />
              {t("添加本地插件")}
            </button>
            {tipDismissed && (
              <button
                type="button"
                className="marketplace-store-author-tip-reopen"
                aria-label={t("查看排序提示")}
                data-hint={t("查看排序提示")}
                onClick={() => setTip(false)}
              >
                ?
              </button>
            )}
          </div>
      </StickyBar>

      {!tipDismissed && (
        <div className="marketplace-store-author-tip" role="status">
          <span>
            {t(
              "长按拖动作者卡片可调整顺序；调整后，首页与右侧作者列表会同步。把常用作者放到最前，点进来更快。仓库卡也能长按拖动（管理模式显示为来源），只在本作者内交换。",
            )}
          </span>
          <button
            type="button"
            className="marketplace-store-author-tip-x"
            aria-label={t("关闭提示")}
            onClick={() => setTip(true)}
          >
            <Icon name="x" size="sm" />
          </button>
        </div>
      )}

      <div className="marketplace-store-author-list">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.authorId.toLowerCase());
          const isCurrent = group.authorId.toLowerCase() === currentAuthorId;
          const lines = [
            ...authorWarningLines(t, group.warnings),
            ...catalogWarningLines(t, group.catalogWarnings),
          ];
          const binding = authorBinding(group.authorId);
          return (
            <AuthorContainer
              key={group.authorId}
              group={group}
              mode={mode}
              collapsed={isCollapsed}
              current={isCurrent}
              onToggle={() => toggleCollapse(group.authorId.toLowerCase())}
              onPointerDown={binding.onPointerDown}
              onKeyDown={(e) => onAuthorKeyDown(e, group.authorId)}
            >
              {mode === "manage" && lines.length > 0 && (
                <div className="marketplace-store-author-warn" data-hint={hintOf(t, lines)}>
                  <Icon name="alert" size="sm" />
                  {t("来源数据有 {{count}} 处异常", { count: lines.length })}
                </div>
              )}
              {mode === "browse" ? (
                group.repos.length === 0 ? (
                  <div className="marketplace-store-author-missing">
                    {t("这个作者还没有提供作者块——来源仍会进入商店，但无法按仓库展示")}
                  </div>
                ) : (
                  group.repos.map((r) => {
                    const core = isOfficialCoreRepo(group.authorId, r.id);
                    const b = repoBinding(group.authorId, r.id, core);
                    return (
                      <AuthorSwitchCard
                        key={r.id}
                        title={lt(r, "name")}
                        badge={`${group.name} · ${group.official ? t("官方 ✓") : t("社区源")}`}
                        intro={lt(r, "intro")}
                        meta={t("{{count}} 个插件", { count: r.plugins.length })}
                        goLabel={r.id === data.repo.repoId && isCurrent ? t("当前仓库") : t("进入仓库")}
                        current={r.id === data.repo.repoId && isCurrent}
                        icon={group.official ? "bag" : "folder"}
                        hue={group.hue}
                        onOpen={() => openRepo(group.authorId, r.id)}
                        ariaLabel={t("{{name}}——进入该仓库", { name: lt(r, "name") })}
                        drag={{
                          attrs: {
                            "data-swap-kind": "repo",
                            "data-swap-author": group.authorId,
                            "data-swap-repo": r.id,
                            ...(core ? { "data-swap-locked": "1" } : {}),
                          },
                          onPointerDown: b.onPointerDown,
                          onKeyDown: (e) => onRepoKeyDown(e, group, r.id),
                        }}
                      />
                    );
                  })
                )
              ) : (
                group.rows.map((row, i) => renderSourceRow(group, row, i))
              )}
            </AuthorContainer>
          );
        })}

        {thirdPartyCount === 0 && (
          <div
            className="marketplace-store-card marketplace-store-author-empty"
            role="button"
            tabIndex={0}
            aria-label={t("添加市场源——还没有第三方作者源")}
            onClick={() => openAddSource("remote")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openAddSource("remote");
              }
            }}
          >
            <span className="marketplace-store-author-av is-muted">
              <Icon name="plus" />
            </span>
            <div className="marketplace-store-author-main">
              <div className="marketplace-store-author-name">{t("还没有添加作者源")}</div>
              <div className="marketplace-store-author-sub">
                {t("官方各仓仍在；第三方仓库等你添加")}
              </div>
            </div>
            <span className="marketplace-store-author-empty-cta">{t("添加网络源")}</span>
          </div>
        )}

        {localRecords.length > 0 && (
          <section className={`marketplace-store-card marketplace-store-author-container is-local ${localCollapsed ? "is-collapsed" : ""}`.trim()}>
            <div
              className="marketplace-store-author-container-head"
              role="button"
              tabIndex={0}
              aria-expanded={!localCollapsed}
              onClick={() => toggleCollapse("__local")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleCollapse("__local");
                }
              }}
            >
              <span className="marketplace-store-author-grip is-hidden" aria-hidden="true">
                ⋮⋮
              </span>
              <span className="marketplace-store-author-av is-muted">
                <Icon name="folder" />
              </span>
              <div className="marketplace-store-author-main">
                <div className="marketplace-store-author-name">{t("本地安装")}</div>
                <div className="marketplace-store-author-sub">
                  {t("从本机文件夹/离线包复制安装的插件——原路径只作溯源，不随外部改动")}
                </div>
              </div>
              <span className="marketplace-store-author-chev" aria-hidden="true">
                <Icon name="chevron-right" size="sm" />
              </span>
            </div>
            {!localCollapsed &&
              localRecords.map((rec) => {
                const disabled = disabledRaw.some((p) => p.pluginId === rec.pluginId);
                return (
                  <div
                    key={rec.pluginId}
                    className={`marketplace-store-src-line ${disabled ? "is-off" : ""}`.trim()}
                  >
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
          </section>
        )}
      </div>

      {mode === "manage" && (
        <div className="marketplace-store-src-note">
          {t("拖动作者卡片可调整顺序；来源行只在同一个作者内交换。")}
          <br />
          {t("停用＝源级（不拉取/不进商店，已装插件照常运行）；移除＝删源与缓存（已装插件保留，可勾选一并卸载）。")}
        </div>
      )}

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

export default AuthorPageView;
