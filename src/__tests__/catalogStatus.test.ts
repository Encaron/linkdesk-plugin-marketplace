/**
 * catalogStatus —— 目录条目本地状态推导（侧栏与商店共用唯一实现）。
 *
 * 钉住：list() ∪ getDisabled() 两源合并 → 未装 / 已装 / 可更新 / 已禁用 四态；
 * 可更新判定走 updateTargetFor（stable-only + 住所闸），⛔ 顶层 version 裸比。
 */

import { describe, it, expect } from "vitest";
import { derivePackageState, type LocalEntryInfo } from "../services/catalogStatus";
import type { CatalogEntry } from "../services/marketCatalog";

const entry = (version: string): CatalogEntry => ({
  id: "demo-plugin",
  name: "Demo Plugin",
  version,
});

function maps(version: string, updatable?: boolean) {
  return {
    localById: new Map<string, LocalEntryInfo>([["demo-plugin", { version, updatable }]]),
    disabledIds: new Set<string>(),
  };
}

describe("derivePackageState", () => {
  it("本地表无该 id → install", () => {
    expect(derivePackageState(entry("1.0.0"), new Map(), new Set())).toBe("install");
  });

  it("本地版本 = 目录版本 → installed；目录更高 → update；目录更低 → installed（不报降级）", () => {
    expect(derivePackageState(entry("1.0.0"), maps("1.0.0").localById, new Set())).toBe("installed");
    expect(derivePackageState(entry("2.0.0"), maps("1.0.0").localById, new Set())).toBe("update");
    expect(derivePackageState(entry("1.0.0"), maps("2.0.0").localById, new Set())).toBe("installed");
  });

  it("住所闸：updatable:false → 不显更新", () => {
    expect(derivePackageState(entry("2.0.0"), maps("1.0.0", false).localById, new Set())).toBe("installed");
  });

  it("禁用集优先于一切（list() 排除禁用 → 不误显安装）", () => {
    expect(derivePackageState(entry("2.0.0"), maps("1.0.0").localById, new Set(["demo-plugin"]))).toBe("disabled");
    expect(derivePackageState(entry("1.0.0"), new Map(), new Set(["demo-plugin"]))).toBe("disabled");
  });
});
