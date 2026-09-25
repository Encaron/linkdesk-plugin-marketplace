/**
 * updateTargetFor 单测——`select.ts` 里**唯一零断言的导出**（E6#151 裁决时实测发现）。
 *
 * 该单元的其余导出（stableLatestVersion / versionDownloadUrl / updateToVersion / selectableVersions /
 * defaultVersionPick / versionActionTarget / pinnedAfterApply）已被既有 `marketCatalog.test.ts` 约 30 例穿过，
 * 但 `updateTargetFor`（E6#73j G6「住所闸」）在全部既有测试里**零引用**——裁决表因此把它单列补测。
 *
 * 它为什么值钱：`updateToVersion` 只问「目录里有没有更高版本」，**不问插件住在哪**；而引擎更新流只接受
 * 用户安装家 ⇒ 随包发货/目录源安装的插件会挂一个「点下去必然失败」的更新钮。本函数就是那道闸
 * （`updatable === false` 才拦、`undefined` 放行 = fail-open）。
 * fixture 全虚构（硬约束 21）：demo-* 条目、example.invalid 下载址。
 */

import { describe, it, expect } from "vitest";
import { updateTargetFor, type CatalogEntry } from "../services/marketCatalog";

function entry(version: string, versions?: Array<{ version: string }>): CatalogEntry {
  return {
    id: "demo-alpha",
    name: "Demo Alpha",
    version,
    versions,
    downloadUrl: `https://example.invalid/releases/demo-alpha-${version}.linkdesk-plugin`,
  };
}

describe("updateTargetFor（可更新判定的全站单点——updateToVersion ＋ 住所闸）", () => {
  it("updatable === false → undefined（目录有更高稳定版也不给更新目标——点必死的钮不该存在）", () => {
    expect(updateTargetFor(entry("1.1.0", [{ version: "1.1.0" }]), "1.0.0", false)).toBeUndefined();
  });

  it("updatable === true → 与 updateToVersion 同答案（有更高稳定版 → 给该版）", () => {
    expect(updateTargetFor(entry("1.1.0", [{ version: "1.1.0" }]), "1.0.0", true)).toBe("1.1.0");
  });

  it("updatable === undefined → 放行（旧上游/未上报缺这个字段时保持原行为——藏掉「有新版」比死钮更糟）", () => {
    expect(updateTargetFor(entry("1.1.0", [{ version: "1.1.0" }]), "1.0.0")).toBe("1.1.0");
    expect(updateTargetFor(entry("1.1.0", [{ version: "1.1.0" }]), "1.0.0", undefined)).toBe("1.1.0");
  });

  it("住所闸在版本判定**之前**——不可更新 + 本地已是最新，仍是 undefined（不因两条都为空而误判）", () => {
    expect(updateTargetFor(entry("1.0.0", [{ version: "1.0.0" }]), "1.0.0", false)).toBeUndefined();
    expect(updateTargetFor(entry("1.0.0", [{ version: "1.0.0" }]), "1.0.0", true)).toBeUndefined();
  });

  it("无本地版本 / 条目缺失（未上架·下架）→ undefined（调用方可不守卫直传 Map.get 结果）", () => {
    expect(updateTargetFor(entry("1.1.0", [{ version: "1.1.0" }]), undefined, true)).toBeUndefined();
    expect(updateTargetFor(undefined, "1.0.0", true)).toBeUndefined();
  });

  it("目录全 beta（无稳定版）→ undefined；稳定版不比本地高 → undefined", () => {
    expect(updateTargetFor(entry("1.1.0-beta.1", [{ version: "1.1.0-beta.1" }]), "1.0.0", true)).toBeUndefined();
    expect(updateTargetFor(entry("0.9.0", [{ version: "0.9.0" }]), "1.0.0", true)).toBeUndefined();
  });
});
