/**
 * AuthorSection — 首页作者卡片区（hero 之后的第一槽，04 §六）。
 *
 * 数据边界（R4-3.8）：作者域来自 `services/authors`（authors/<id>.json 白名单解析＋authorId 聚合）；
 *   - 有作者块 → 每源一张作者卡（`AuthorCard`——与作者页平铺同一件）；
 *   - **无任何作者源** → 空态引导卡（最重要的发现路径，三落点之一）；
 *   - 有作者源但没有可读作者块（v1 源）→ **隐藏槽位**（作者域整体缺席是合法降级，⛔ 伪造作者卡）。
 */

import { useTranslation } from "react-i18next";
import { Icon } from "../../../ui";
import { OFFICIAL_AUTHOR_ID, useAuthorDomains } from "../../../services/authors";
import { useStore } from "../StoreContext";
import { SectionHead } from "./SectionHead";
import { AuthorCard } from "../authors/AuthorCard";
import { sortAuthorDomains } from "../authors/authorsData";
import { Strip } from "../Strip";

export function AuthorSection() {
  const { t } = useTranslation();
  const { data, addSource, navigate } = useStore();
  const { domains } = useAuthorDomains(data.catalog.entries.length);
  /* 首页就是官方店：作者区只展示第三方作者；官方作为作者出现在「作者」页与来源页 */
  const list = sortAuthorDomains(
    domains.filter((d) => d.authorId !== OFFICIAL_AUTHOR_ID),
    "name",
  );

  if (list.length > 0) {
    return (
      <section className="marketplace-store-sec" data-spec="04-6-authors">
        <SectionHead
          title={t("作者")}
          hint={t("每个作者都是一家小店，点开看看他的全部插件")}
        />
        {/* F27b 归一化（2026-11-21）：作者横排走**同一个 Strip 原语**——此前手写 strip-row，
            没有箭头/滚轮/peek 吸附 ⇒ 与主题专区/热门横滚不是一套行为 */}
        <Strip ariaLabel={t("作者")}>
          {list.map((domain) => (
            <AuthorCard
              key={domain.authorId}
              domain={domain}
              onOpen={() => navigate({ page: "author", authorId: domain.authorId })}
            />
          ))}
        </Strip>
      </section>
    );
  }
  if (data.authorSourceCount > 0) return null; // 有源但作者块不可读（v1 源）⇒ 作者域缺席（不伪造）
  return (
    <section className="marketplace-store-sec" data-spec="04-6-authors">
      <SectionHead
        title={t("作者")}
        hint={t("每个作者都是一家小店，点开看看他的全部插件")}
      />
      <Strip ariaLabel={t("作者")}>
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
      </Strip>
    </section>
  );
}

export default AuthorSection;
