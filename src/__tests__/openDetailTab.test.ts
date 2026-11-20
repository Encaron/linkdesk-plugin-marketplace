/**
 * openDetailTab 单测（R4-3.16）——商店卡片 / 详情依赖跳转 / 命令面共用的**唯一入口**。
 * 钉三件：pinned:true 固定新开、label 原样透传（未装插件壳内无 manifest）、缺面/抛错诚实返 false。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { openPluginDetailTab } from "../services/openDetailTab";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

function stub(tabs: unknown) {
  Object.defineProperty(window, "linkdesk", { value: { tabs }, configurable: true });
}

afterEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  vi.restoreAllMocks();
});

describe("openPluginDetailTab", () => {
  it("pinned:true ＋ label 透传（08 v3.51：未装插件必须由调用方命名）", async () => {
    const create = vi.fn(async () => undefined);
    stub({ create });
    expect(await openPluginDetailTab("demo-plugin", "Demo Plugin")).toBe(true);
    expect(create).toHaveBeenCalledWith("plugin-detail", {
      pluginId: "demo-plugin",
      pinned: true,
      label: "Demo Plugin",
    });
  });

  it("无 label 时不塞空串（已装插件由壳按 manifest 取名）", async () => {
    const create = vi.fn(async () => undefined);
    stub({ create });
    await openPluginDetailTab("demo-plugin");
    expect(create).toHaveBeenCalledWith("plugin-detail", { pluginId: "demo-plugin", pinned: true });
  });

  it("壳无 tabs.create ⇒ false（不抛）", async () => {
    stub(undefined);
    expect(await openPluginDetailTab("demo-plugin", "Demo")).toBe(false);
  });

  it("create 抛错 ⇒ false（命令面回执诚实）", async () => {
    stub({ create: vi.fn(async () => Promise.reject(new Error("boom"))) });
    expect(await openPluginDetailTab("demo-plugin", "Demo")).toBe(false);
  });

  it("空 pluginId ⇒ 不调（防御：不产无主标签）", async () => {
    const create = vi.fn(async () => undefined);
    stub({ create });
    expect(await openPluginDetailTab("", "Demo")).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
