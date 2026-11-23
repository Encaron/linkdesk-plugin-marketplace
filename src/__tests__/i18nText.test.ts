import { describe, expect, it } from "vitest";
import { localizedField, parseLocales } from "../services/i18nText";

describe("目录 locale 解析（G-N1/i18n 契约）", () => {
  const entry = {
    name: "官方主题",
    description: "中文描述",
    locales: {
      en: { name: "Official Themes", description: "English description" },
      "zh-cn": { name: "官方主题（大陆）" },
    },
  };

  it("精确语言优先于主语言与 base", () => {
    expect(localizedField(entry, "name", "zh-CN")).toBe("官方主题（大陆）");
    expect(localizedField(entry, "name", "zh")).toBe("官方主题");
    expect(localizedField(entry, "name", "en")).toBe("Official Themes");
  });

  it("字段缺失回退到 base（不跨字段）", () => {
    expect(localizedField(entry, "description", "zh-CN")).toBe("中文描述");
    expect(localizedField(entry, "description", "en")).toBe("English description");
    expect(localizedField(entry, "storeTitle", "en")).toBeUndefined();
  });

  it("任意语言（de/fr/ja）按 app 语言解析，未声明回退 base", () => {
    const e = { name: "Standard", locales: { de: { name: "Standard (DE)" }, fr: { name: "Standard (FR)" } } };
    expect(localizedField(e, "name", "de")).toBe("Standard (DE)");
    expect(localizedField(e, "name", "fr")).toBe("Standard (FR)");
    expect(localizedField(e, "name", "ja")).toBe("Standard");
  });

  it("未声明 locales ⇒ base；空对象/空值不生效", () => {
    expect(localizedField({ name: "Base" }, "name", "en")).toBe("Base");
    const parsed = parseLocales({ en: { name: "  " }, FR: { name: "Nom" }, bad_key: { name: "x" } });
    expect(parsed).toEqual({ fr: { name: "Nom" } });
  });

  it("parseLocales 过滤坏形状与非字符串值", () => {
    expect(parseLocales(null)).toBeUndefined();
    expect(parseLocales({ en: "nope", zh: { name: 42 } })).toBeUndefined();
    expect(parseLocales({ en: { name: "Ok", description: " " } })).toEqual({ en: { name: "Ok" } });
  });
});
