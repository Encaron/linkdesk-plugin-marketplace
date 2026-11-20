/**
 * CatalogState — 目录拉取三态（加载中 / 失败 / 离线缓存）＋目录注记的**唯一渲染件**（06 §六）。
 *
 * 判据：`catalog.loading` 或本地列表未到 → 加载中（骨架不假装）；ok 空 = 诚实空态（非故障、无重试）；
 * corrupt/offline 空 = 故障＋重试；有条目但 usedStale/单源失败 → 顶部注记（不整体降级）。
 * ⛔ 拉取中显示旧内容假装在线；⛔ 离线把整店变错误页。
 */

import { useTranslation } from "react-i18next";
import { EmptyState, Icon } from "../../../ui";
import { useStore } from "../StoreContext";

export function CatalogLoading() {
  const { t } = useTranslation();
  return (
    <div className="marketplace-store-state-card" role="status">
      <span className="marketplace-ui-spin" aria-hidden="true" />
      <div>
        <b>{t("正在拉取目录…")}</b>
        <span>{t("首次打开或手动刷新 · 拉到前显示骨架，不显示旧内容假装")}</span>
      </div>
    </div>
  );
}

export function CatalogErrorState() {
  const { t } = useTranslation();
  const { data } = useStore();
  const corrupt = data.catalog.state === "corrupt";
  return (
    <div className="marketplace-store-state-card">
      <Icon name="alert" size="lg" className="marketplace-store-state-icon is-danger" />
      <div>
        <b>{corrupt ? t("目录损坏") : t("目录拉取失败")}</b>
        <span>{t("网络问题 · 重试 · 已装插件照常可用")}</span>
      </div>
      <button type="button" className="marketplace-ui-btn is-primary" onClick={() => void data.catalog.refresh()}>
        {t("重试")}
      </button>
    </div>
  );
}

/** 有条目但存在降级/失败 —— 顶部一条诚实注记 */
export function CatalogNote() {
  const { t } = useTranslation();
  const { data } = useStore();
  const { usedStale, errors } = data.catalog;
  if (!usedStale && errors.length === 0) return null;
  const failed = errors.map((e) => e.sourceName).join("、");
  return (
    <div className="marketplace-store-cat-note" role="status">
      <Icon name="alert" size="sm" />
      {usedStale && <span>{t("目录为离线缓存，可能不是最新")}</span>}
      {failed && (
        <span data-hint={failed}>
          {t("部分来源加载失败，已显示可用目录")}
        </span>
      )}
    </div>
  );
}

/** 门：加载中/空目录不渲染业务内容（各页共用） */
export function CatalogGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { data } = useStore();
  if (data.catalog.loading || data.localLoading) return <CatalogLoading />;
  if (data.catalog.entries.length === 0) {
    if (data.catalog.state === "ok") {
      return <EmptyState icon="dots" title={t("暂无插件")} sub={t("源已连上，但目录里还没有插件——不伪装、不报错")} />;
    }
    return <CatalogErrorState />;
  }
  return <>{children}</>;
}
