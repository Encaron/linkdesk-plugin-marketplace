/**
 * planDiscovery blocked 标记单测（2026-11-05 拍板③：自动更新遇「需要更高壳版本」的候选 ⇒ 停在旧版）。
 * 纯函数直测——shellVersion 由编排注入（run.ts readShellVersion），本层只判标记与选择。
 */
import { describe, expect, it } from "vitest";
import { planDiscovery, selectAutoCandidates } from "../services/updateDiscovery/plan";
import type { InstalledSnapshot } from "../services/updateDiscovery/types";
import type { CatalogEntry } from "../services/marketCatalog";

const entry = (over: Partial<CatalogEntry> & { id: string; version: string }): CatalogEntry => ({
  name: over.id,
  ...over,
});
const inst = (id: string, version: string): InstalledSnapshot => ({
  pluginId: id,
  localVersion: version,
  name: id,
  disabled: false,
  updatable: true,
});

describe("planDiscovery blocked（壳版本低于插件要求）", () => {
  it("壳低于 minAppVersion ⇒ 候选标 blocked、留在 toNotify，但不进自动更新选择", () => {
    const e = entry({ id: "demo-a", version: "1.1.0", minAppVersion: "0.2.52" });
    const plan = planDiscovery([e], [inst("demo-a", "1.0.0")], {}, "0.2.50");
    expect(plan.candidates[0]?.blockedByMinApp).toBe("0.2.52");
    expect(plan.toNotify).toHaveLength(1);
    expect(selectAutoCandidates(plan.candidates, { "demo-a": { autoUpdate: true } })).toHaveLength(0);
  });

  it("壳满足 minAppVersion ⇒ 不标，自动更新照常可选", () => {
    const e = entry({ id: "demo-b", version: "1.1.0", minAppVersion: "0.2.20" });
    const plan = planDiscovery([e], [inst("demo-b", "1.0.0")], {}, "0.2.50");
    expect(plan.candidates[0]?.blockedByMinApp).toBeUndefined();
    expect(selectAutoCandidates(plan.candidates, { "demo-b": { autoUpdate: true } })).toHaveLength(1);
  });

  it("壳版本缺（读失败）= 判不了 ⇒ 不标 blocked（30.8c 诚实口径：判不了 ≠ 判不满足）", () => {
    const e = entry({ id: "demo-c", version: "1.1.0", minAppVersion: "99.0.0" });
    const plan = planDiscovery([e], [inst("demo-c", "1.0.0")], {}, undefined);
    expect(plan.candidates[0]?.blockedByMinApp).toBeUndefined();
  });
});
