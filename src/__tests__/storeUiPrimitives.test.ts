/**
 * storeUiPrimitives —— 商店 UI 原语的纯判定单测（棒 5 R4-3.2/3.3）。
 *
 * 钉住三件事实：
 *   ① `statusTag` 九级优先级逐条短路（已停用＞许可过期＞有更新＞订阅临期＞剩 N 天＞已安装＞已购＞
 *      订阅价＞买断价＞免费）——主面永远只显一个词；
 *   ② `resolveAction` 的动作分支（离线置灰 / 安装中 / 排队 / 失败重试 / 已装 / 更新 / 付费域）；
 *   ③ `moreMenuItems` 随装态动态（未装不出现禁用；core 卸载置灰带原因）。
 */

import { describe, it, expect } from "vitest";
import type { CatalogEntry } from "../services/marketCatalog";
import {
  allBadges,
  licenseDaysLeft,
  moreMenuItems,
  resolveAction,
  sourceBadge,
  statusTag,
  type LicenseView,
} from "../ui";

const NOW = Date.UTC(2026, 0, 1);
const expIn = (days: number): LicenseView => ({ exp: Math.floor(NOW / 1000) + days * 86_400 });

function entry(patch: Partial<CatalogEntry> = {}): CatalogEntry {
  return { id: "demo-plugin", name: "Demo Plugin", version: "1.0.0", ...patch };
}

describe("statusTag —— 九级优先级", () => {
  it("已停用压过许可过期", () => {
    const e = entry({ pricing: { model: "paid", price: 30 }, versions: [] });
    expect(statusTag(e, { state: "disabled", license: expIn(-3), now: NOW })).toEqual({
      key: "已停用",
      kind: "installed",
    });
  });

  it("许可过期压过有更新", () => {
    const e = entry({ pricing: { model: "paid", price: 30 } });
    expect(statusTag(e, { state: "update", license: expIn(-1), now: NOW }).key).toBe("许可过期");
  });

  it("有更新压过订阅临期", () => {
    const e = entry({ pricing: { model: "subscription", price: 8 } });
    expect(statusTag(e, { state: "update", license: expIn(5), now: NOW }).key).toBe("有更新");
  });

  it("订阅临期 → 订阅剩 N 天；买断临期 → 剩 N 天", () => {
    const sub = entry({ pricing: { model: "subscription", price: 8 } });
    expect(statusTag(sub, { state: "installed", license: expIn(5), now: NOW })).toEqual({
      key: "订阅剩 {{days}} 天",
      params: { days: 5 },
      kind: "soon",
    });
    const paid = entry({ pricing: { model: "paid", price: 30 } });
    expect(statusTag(paid, { state: "installed", license: expIn(20), now: NOW }).kind).toBe("soon");
  });

  it("已安装 → 已安装；永久许可（已购）→ 已购", () => {
    const paid = entry({ pricing: { model: "paid", price: 30 } });
    expect(statusTag(paid, { state: "installed", license: null, now: NOW }).key).toBe("已安装");
    expect(statusTag(paid, { state: "install", license: {}, now: NOW })).toEqual({ key: "已购", kind: "installed" });
  });

  it("订阅价 / 买断价 / 免费", () => {
    expect(statusTag(entry({ pricing: { model: "subscription", price: 8 } }), { state: "install", now: NOW })).toEqual({
      key: "订阅 {{currency}}{{price}}/{{period}}",
      params: { currency: "¥", price: 8, period: "月" },
      kind: "paid",
      // 卡片两行呈现（2026-11-22）：模型词/金额分开，金额完整显示（⛔ 截价格）
      modelKey: "订阅",
      amount: { key: "{{currency}}{{price}}/{{period}}", params: { currency: "¥", price: 8, period: "月" } },
    });
    expect(statusTag(entry({ pricing: { model: "paid", price: 30 } }), { state: "install", now: NOW }).kind).toBe("paid");
    expect(statusTag(entry(), { state: "install", now: NOW })).toEqual({ key: "免费", kind: "free" });
  });
});

describe("licenseDaysLeft", () => {
  it("无 exp = 永久（undefined）；过期 = 负数", () => {
    expect(licenseDaysLeft(null, NOW)).toBeUndefined();
    expect(licenseDaysLeft({}, NOW)).toBeUndefined();
    expect(licenseDaysLeft(expIn(-2), NOW)).toBe(-2);
  });
});

describe("sourceBadge —— 发布者身份（⛔ 按名猜）", () => {
  it("vendorId 命中 → 官方 ✓；官方目录条目 → 官方；其余 → 社区", () => {
    expect(sourceBadge({ vendorId: "st" }).key).toBe("官方 ✓");
    expect(sourceBadge({ official: true }).key).toBe("官方");
    expect(sourceBadge({ official: false }).key).toBe("社区");
    expect(sourceBadge({}).key).toBe("社区");
  });
});

describe("allBadges —— 全量徽标行顺序", () => {
  it("已安装 → 有更新 → 内置 → 许可 → 来源", () => {
    const e = entry({ pricing: { model: "paid", price: 30 }, official: true });
    const badges = allBadges(e, { state: "update", core: true, license: expIn(10), now: NOW });
    expect(badges.map((b) => b.kind)).toEqual(["update", "core", "price", "soon", "official"]);
  });
});

describe("resolveAction", () => {
  it("未装 + 在线 → 安装（primary）", () => {
    expect(resolveAction(entry(), { state: "install", online: true })).toMatchObject({
      id: "install",
      kind: "primary",
      icon: "download",
    });
  });

  it("未装 + 离线 → 安装置灰 + 联网后重试", () => {
    expect(resolveAction(entry(), { state: "install", online: false })).toMatchObject({
      id: "install",
      disabled: true,
      titleKey: "联网后重试",
    });
  });

  it("已装 / 可更新 / 已停用", () => {
    expect(resolveAction(entry(), { state: "installed", online: true })).toMatchObject({ labelKey: "已安装", disabled: true });
    expect(resolveAction(entry(), { state: "update", online: true })).toMatchObject({ id: "update", labelKey: "更新" });
    expect(resolveAction(entry(), { state: "disabled", online: true })).toMatchObject({ id: "enable", labelKey: "启用" });
  });

  it("安装中 / 排队 / 失败", () => {
    expect(
      resolveAction(entry(), {
        state: "install",
        online: true,
        job: { state: "running", stage: "downloading", percent: 62 },
        jobLabel: "下载中 62%",
      }),
    ).toMatchObject({ id: "cancel", busy: true, disabled: true, params: { label: "下载中 62%" } });
    expect(resolveAction(entry(), { state: "install", online: true, job: { state: "queued" } })).toMatchObject({
      labelKey: "等待安装中",
      disabled: true,
    });
    expect(
      resolveAction(entry(), { state: "install", online: true, job: { state: "settled", terminal: "failed" } }),
    ).toMatchObject({ id: "retry", labelKey: "重试" });
  });

  it("付费域：订阅 → 即将支持；未购有销售页 → 获取许可；无销售页 → 我有密钥；过期 → 输入新密钥", () => {
    const sub = entry({ pricing: { model: "subscription", price: 8 } });
    expect(resolveAction(sub, { state: "install", online: true })).toMatchObject({ labelKey: "即将支持", disabled: true });

    const paid = entry({ pricing: { model: "paid", price: 30, licenseUrl: "https://example.invalid/buy" } });
    expect(resolveAction(paid, { state: "install", online: true })).toMatchObject({ id: "buy", labelKey: "获取许可 {{price}}" });

    const noUrl = entry({ pricing: { model: "paid", price: 30 } });
    expect(resolveAction(noUrl, { state: "install", online: true })).toMatchObject({ id: "have-key", labelKey: "我有密钥" });

    expect(resolveAction(paid, { state: "install", online: true, license: expIn(-1), now: NOW })).toMatchObject({
      id: "have-key",
      labelKey: "输入新密钥",
    });
  });

  it("有效权益 → 回到安装语义（付费不改变安装）", () => {
    const paid = entry({ pricing: { model: "paid", price: 30, licenseUrl: "https://example.invalid/buy" } });
    expect(resolveAction(paid, { state: "install", online: true, license: expIn(100), now: NOW })).toMatchObject({
      id: "install",
      labelKey: "安装",
    });
  });
});

describe("moreMenuItems —— 随装态动态", () => {
  it("未装：只看详情 + 卸载置灰（不出现禁用）", () => {
    const items = moreMenuItems(entry(), { state: "install" });
    expect(items.map((i) => i.id)).toEqual(["open", "uninstall"]);
    expect(items.find((i) => i.id === "uninstall")?.disabled).toBe(true);
  });

  it("已装：详情 + 禁用 + 卸载（可用）", () => {
    const items = moreMenuItems(entry(), { state: "installed" });
    expect(items.map((i) => i.id)).toEqual(["open", "disable", "uninstall"]);
    expect(items.find((i) => i.id === "uninstall")?.disabled).toBe(false);
  });

  it("已停用：启用 + 卸载；core：卸载置灰带原因", () => {
    expect(moreMenuItems(entry(), { state: "disabled" }).map((i) => i.id)).toEqual(["open", "enable", "uninstall"]);
    const core = moreMenuItems(entry(), { state: "installed", core: true });
    const un = core.find((i) => i.id === "uninstall");
    expect(un?.disabled).toBe(true);
    expect(un?.titleKey).toBe("内置插件不提供卸载按钮");
  });
});
