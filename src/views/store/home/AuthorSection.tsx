/**
 * AuthorSection — 首页作者卡片区（hero 之后的第一槽，04 §六）。
 *
 * 棒 6 的数据边界：作者块解析（`authors/<id>.json` 聚合）属**棒 7**（R4-3.8–3.11）——本棒只落
 * 槽位与**空态引导卡**（还没有作者源时最重要的发现路径）。有作者源但作者块未解析 ⇒ 本槽留空
 * （数据驱动：作者填哪个显示哪个，⛔ 不伪造作者卡）。棒 7 接入后此槽自动长出作者卡。
 */

import { useTranslation } from "react-i18next";
import { Icon } from "../../../ui";
import { useStore } from "../StoreContext";
import { SectionHead } from "./SectionHead";

export function AuthorSection() {
  const { t } = useTranslation();
  const { data, addSource } = useStore();
  if (data.authorSourceCount > 0) return null; // 作者卡由棒 7 渲染；此处不造假
  return (
    <section className="marketplace-store-sec" data-spec="04-6-authors">
      <SectionHead
        title={t("作者")}
        hint={t("万物皆可插件——第三方作者的店，点击进入他们的主页（hover 看仓卡扇出）")}
      />
      <div className="marketplace-store-strip">
        <div className="marketplace-store-strip-row">
          <div
            className="marketplace-store-card marketplace-store-author-empty"
            role="button"
            tabIndex={0}
            aria-label={t("添加市场源——还没有任何作者源")}
            onClick={addSource}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                addSource();
              }
            }}
          >
            <span className="marketplace-store-ae-ico">
              <Icon name="plus" size="lg" />
            </span>
            <div>
              <div className="marketplace-store-ae-t">{t("还没有作者源")}</div>
              <div className="marketplace-store-ae-s">
                {t("粘贴 GitHub 仓库地址或 marketplace.json 直链——添加后作者与本店插件会出现在这里")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default AuthorSection;
