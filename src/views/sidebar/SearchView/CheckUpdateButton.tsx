/**
 * CheckUpdateButton —— 侧栏动作行的「检查更新」钮 ＋ 它的就地注（05「插件市场·检查更新」）。
 * 本件是 `SearchView.tsx` 的**私有件**（非 contributes.views 面），拆法与同夹 `AddSourcePopup.tsx` 同款：
 * 门面只留版式，三态与编排归本件；业务动作在 `services/updateCheck`（本件不碰目录、不碰发现）。
 *
 * 三态（口径对齐 04「发行说明刷新按钮」已落地件）：
 *   默认 → 点 → **检查中**（转圈 + 「检查中…」+ 禁用防连点）→ **完成/失败**（钮回可用 + 就地 muted 注）
 *     · 无新版 = 「已是最新 · 刚刚」；有 = 「发现 N 个可更新 · 刚刚」
 *     · 失败 = 「检查失败 · 显示的是旧目录」，详情落**唯一通知面**（铃铛，`notifyError`）——本件不自造错误条
 *   注里的时间先写「刚刚」，过了 60s 才换成具体时刻（HH:MM）；每次新结果重开这个窗口。
 *
 * 🔴 三处刻意取舍（动之前先读）：
 *  ① **提示挂槽位 span，不挂钮**：壳 `Button` 刻意不透传 `data-*`/`aria-*`（`Button.tsx:33-43` 的设计），
 *     而给钮传 `title` 会让它把 `aria-label` 设成提示原文（children 不是纯字符串 ⇒ `hasVisibleText=false`，
 *     `Button.tsx:50-58`）——那会把这只钮的**无障碍名读成一句说明**（WCAG 2.5.3 反例）。
 *     故提示挂外层 `<span data-hint>`：壳的提示是全局委托 + `closest()` 命中，挂哪层都出条（本仓同类先例 =
 *     `DetailActionBar` 的 `.marketplace-mpd-blocked-chip`），钮的无障碍名仍是可见文字「检查更新」。
 *  ② **没有 `aria-busy`**：同 ①（壳 Button 无这个口子）。「进行中」由**文字变化**（检查中…）＋ 禁用态承担，
 *     「结果播报」由注的 `role="status"` 承担——两件事都在，只是不叫 `aria-busy`。
 *  ③ **失败不重投影、不清空**：目录没拿到时旧投影原样留着（与 04 件「刷新失败继续显示缓存内容」同款），
 *     UI 只说清「你现在看到的是旧的」这一件事。
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@linkdesk/ui";
import { checkForPluginUpdates } from "../../../services/updateCheck";
import { notifyError } from "../../../services/marketplaceShared";

/** 完成相位——三种落点（无新版 / 有 N 个 / 失败）＋ 完成时刻（注里的时间锚） */
type DonePhase = { kind: "fresh" | "found" | "failed"; count: number; at: number };

/** 「刚刚」的窗口长度：注先写「刚刚」，过了这段才写具体时刻（一次定时，不是轮询） */
const JUST_NOW_MS = 60_000;

/** 完成时刻 → HH:MM（本地时区，固定两位；不跟系统 locale 走——注的位置很窄，要定长） */
function clockOf(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function CheckUpdateButton() {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState<DonePhase | null>(null);
  /** 注里的时间是否还在「刚刚」窗口内——每次新结果重开窗口（见上） */
  const [justNow, setJustNow] = useState(true);

  useEffect(() => {
    if (!done) return;
    setJustNow(true);
    const timer = setTimeout(() => setJustNow(false), JUST_NOW_MS);
    return () => clearTimeout(timer);
  }, [done]);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try {
      const r = await checkForPluginUpdates();
      if (r.state === "failed") {
        // 详情落唯一通知面（铃铛宽面板）；本行只留一句状态注，不自造错误条（04 件同款）
        notifyError(t("检查更新失败：取不到市场目录"));
        setDone({ kind: "failed", count: 0, at: r.checkedAt });
      } else {
        setDone({ kind: r.updatableCount > 0 ? "found" : "fresh", count: r.updatableCount, at: r.checkedAt });
      }
    } finally {
      // ⛔ 成败都要回可用态：失败留在禁用态 = 用户连再点一次都做不到
      setChecking(false);
    }
  }, [t]);

  const time = done ? (justNow ? t("刚刚") : clockOf(done.at)) : "";
  const note = done
    ? done.kind === "failed"
      ? t("检查失败 · 显示的是旧目录")
      : done.kind === "found"
        ? t("发现 {{count}} 个可更新 · {{time}}", { count: done.count, time })
        : t("已是最新 · {{time}}", { time })
    : null;

  return (
    <>
      {note && (
        <span className={`marketplace-ms-check-note${done?.kind === "failed" ? " is-err" : ""}`} role="status">
          {note}
        </span>
      )}
      {/* 槽位只为挂提示（见头注 ①）；钮本体是壳 Button（ghost/sm）——与详情页动作钮同族 */}
      <span className="marketplace-ms-check-slot" data-hint={t("立即向市场源查询插件新版本（忽略 5 分钟缓存）")}>
        <Button variant="ghost" size="sm" onClick={handleCheck} disabled={checking}>
          <span className={`codicon codicon-sync${checking ? " marketplace-ms-check-spin" : ""}`} aria-hidden="true" />
          {checking ? t("检查中…") : t("检查更新")}
        </Button>
      </span>
    </>
  );
}
