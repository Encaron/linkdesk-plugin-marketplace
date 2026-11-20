/**
 * SectionHead — 板块标题行（标题／副题／可选强调色跳转字）。
 *
 * 跳转字是**可选声明**：调用方给了才渲染；⛔ 本件不自动造「更多」（09 §二；官方「装机必备」无字＝同规）。
 * 文案走 t()/作者数据；target 由调用方闭包（导航函数），本件不认 URL。
 */

import { useTranslation } from "react-i18next";
import { Icon } from "../../../ui";

export function SectionHead({
  title,
  hint,
  more,
}: {
  title: string;
  hint?: string;
  more?: { label: string; onClick: () => void };
}) {
  const { t } = useTranslation();
  return (
    <div className="marketplace-store-sec-head">
      <h3>{title}</h3>
      {hint && <span className="marketplace-store-sec-hint">{hint}</span>}
      {more && (
        <button type="button" className="marketplace-store-sec-more" onClick={more.onClick}>
          {more.label}
          <Icon name="chevron-right" size="sm" />
        </button>
      )}
    </div>
  );
}

export default SectionHead;
