import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * E1 设置开关（03 §一·3 方案 B）：壳侧读 `{pluginId}.openTabOnIcon`，
 * 插件必须在 contributes.configuration 里声明，设置页才会出现这一行。
 */
describe("marketplace.openTabOnIcon 声明", () => {
  const manifest = JSON.parse(readFileSync("plugin.json", "utf8")) as {
    contributes?: { configuration?: { properties?: Record<string, unknown> } };
  };
  const prop = manifest.contributes?.configuration?.properties?.["marketplace.openTabOnIcon"] as
    | { type?: string; default?: unknown; title?: string }
    | undefined;

  it("布尔、默认关、有短名", () => {
    expect(prop).toMatchObject({ type: "boolean", default: false });
    expect(prop?.title).toBeTruthy();
  });

  it("中英文案都在（设置页/搜索可读）", () => {
    const en = JSON.parse(readFileSync("i18n/en.json", "utf8")) as Record<string, string>;
    const zh = JSON.parse(readFileSync("i18n/zh.json", "utf8")) as Record<string, string>;
    expect(en[prop!.title!]).toBeTruthy();
    expect(zh[prop!.title!]).toBeTruthy();
  });
});
