/**
 * `messages.ts` 的 `marketInstallStageLabel` 八档单测（E6#151 补）。
 *
 * 🔴 为什么单列：`messages.ts` 这个**单元**判「已覆盖」没错（`classifyInstallError` 七类、
 * 两域 `*FailLabelKey`、`failText`/`updateFailText` 都被 `marketplaceUpdateFailure.test.ts` 直测），
 * 但本函数在既有测试里只被**间接**穿过三档——`installJobs.test.ts` 走 `installJobLabel`（经
 * `installJobs.ts:152` 转调）只钉了 `downloading`＋percent、`extracting`、兜底三条；其余五档
 * （validating / loading / checking / staging / committing / uninstalling）零断言。它是**用户看得见的
 * 进度文案**，八档各自独立（stage 改错名 ⇒ 整段退回兜底「安装中...」而无人发现），故逐档钉住。
 *
 * 断言口径：假 `t` 原样回 key（i18n key = 中文原文，硬约束 2）——断言的是**被测代码产出的 key**
 * （硬约束 21 边界内的合规写法，与既有 `installJobs.test.ts` 同法），不含任何真实插件名/真实 UI 文案。
 */

import { describe, it, expect } from "vitest";
import { marketInstallStageLabel } from "../services/marketplaceShared";

/** 假 t——有插值就带上，便于断言 percent 是以数值透传的 */
const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key);

describe("marketInstallStageLabel（阶段码 → job 行进度文案——八档 + 兜底）", () => {
  it("安装域：validating / extracting / loading 三档各归其名", () => {
    expect(marketInstallStageLabel(t, "validating", undefined)).toBe("校验中...");
    expect(marketInstallStageLabel(t, "extracting", undefined)).toBe("解压中...");
    expect(marketInstallStageLabel(t, "loading", undefined)).toBe("加载中...");
  });

  it("downloading：有 percent → 插值档；无 percent → 不带数字的档（两者不是同一句）", () => {
    expect(marketInstallStageLabel(t, "downloading", 62)).toBe('下载中 {{percent}}%:{"percent":62}');
    expect(marketInstallStageLabel(t, "downloading", undefined)).toBe("下载中...");
    expect(marketInstallStageLabel(t, "downloading", null as never)).toBe("下载中..."); // null 也算没有
  });

  it("更新域（E6#73j G1）：checking / staging / committing——不再冒充「安装中」", () => {
    expect(marketInstallStageLabel(t, "checking", undefined)).toBe("检查更新中...");
    expect(marketInstallStageLabel(t, "staging", 40)).toBe('下载中 {{percent}}%:{"percent":40}');
    expect(marketInstallStageLabel(t, "staging", undefined)).toBe("准备新版...");
    expect(marketInstallStageLabel(t, "committing", undefined)).toBe("替换旧版...");
  });

  it("卸载域（E6#73m K1）：uninstalling 不落「安装中...」（那是把活说反了）", () => {
    expect(marketInstallStageLabel(t, "uninstalling", undefined)).toBe("卸载中...");
  });

  it("未知 stage / undefined → 兜底「安装中...」（stage 改名后仍有一句能显示，但本组八档断言会先红）", () => {
    expect(marketInstallStageLabel(t, undefined, undefined)).toBe("安装中...");
    expect(marketInstallStageLabel(t, "demo-unknown-stage", 10)).toBe("安装中..."); // 兜底不看 percent
  });

  it("percent = 0 是真值——必须走插值档（0% 不是「没有进度」）", () => {
    expect(marketInstallStageLabel(t, "downloading", 0)).toBe('下载中 {{percent}}%:{"percent":0}');
  });
});
