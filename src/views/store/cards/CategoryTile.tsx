/**
 * CategoryTile — 首页「按分类浏览」瓷片（横排卡：图标＋名/数量/说明＋箭头；v3.33 重做）。
 *
 * 🔴 空分类**不进瓷片区**（两店同规）——调用方只传有货分类；⛔ 修饰类不用 `empty` 这类通用词
 *   （08 §二·26：曾撞全局空态撑高整行）。本件根类 = `marketplace-store-cat-tile`。
 */

import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../../../ui";

export function CategoryTile({
  slug,
  label,
  count,
  desc,
  icon,
  onOpen,
}: {
  slug: string;
  label: string;
  count: number;
  desc?: string;
  icon: IconName;
  onOpen: (slug: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="marketplace-store-card marketplace-store-cat-tile"
      role="button"
      tabIndex={0}
      aria-label={t("{{name}}——查看该分类", { name: label })}
      data-category={slug}
      onClick={() => onOpen(slug)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(slug);
        }
      }}
    >
      <div className="marketplace-store-ct-icon">
        <Icon name={icon} size="lg" />
      </div>
      <div className="marketplace-store-ct-main">
        <div className="marketplace-store-ct-name">{label}</div>
        <div className="marketplace-store-ct-count">{t("{{count}} 个插件", { count })}</div>
        {desc && <div className="marketplace-store-ct-desc">{desc}</div>}
      </div>
      <span className="marketplace-store-ct-go">
        <Icon name="chevron-right" size="sm" />
      </span>
    </div>
  );
}

export default CategoryTile;
