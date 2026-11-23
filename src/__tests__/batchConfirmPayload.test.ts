/**
 * batchConfirmPayload 单测——P0 批量确认卡载荷。
 * 钉三件：字段映射（authorLabel 复用单一实现）、官方/第三方计数、已装版本透传。
 * fixture 全虚构（硬约束 21）。
 */

import { describe, expect, it } from "vitest";
import { batchConfirmPayload } from "../services/batchConfirmPayload";
import type { CatalogEntry } from "../services/marketCatalog";

const OFFICIAL: CatalogEntry = {
  id: "demo-alpha",
  name: "Demo Alpha",
  version: "2.0.0",
  downloadUrl: "https://example.invalid/demo-alpha-2.0.0.linkdesk-plugin",
  author: { name: "Demo Author" },
  sourceName: "demo-owner/demo-alpha",
  official: true,
  size: 2 * 1024 * 1024,
};

const THIRD: CatalogEntry = {
  id: "demo-beta",
  name: "Demo Beta",
  version: "1.1.0",
  downloadUrl: "https://example.invalid/demo-beta-1.1.0.linkdesk-plugin",
  author: "Demo Third",
  sourceName: "third.invalid/demo-beta",
  size: 900 * 1024,
};

describe("batchConfirmPayload", () => {
  it("映射名称/发布者/来源/目标版本/大小；已装版本按 id 透传", () => {
    const p = batchConfirmPayload([OFFICIAL, THIRD], { "demo-alpha": "1.9.0" });
    expect(p.mode).toBe("batch");
    expect(p.entries).toEqual([
      {
        id: "demo-alpha",
        name: "Demo Alpha",
        publisher: "Demo Author",
        official: true,
        sourceName: "demo-owner/demo-alpha",
        version: "2.0.0",
        fromVersion: "1.9.0",
        size: 2 * 1024 * 1024,
      },
      {
        id: "demo-beta",
        name: "Demo Beta",
        publisher: "Demo Third",
        official: false,
        sourceName: "third.invalid/demo-beta",
        version: "1.1.0",
        fromVersion: undefined,
        size: 900 * 1024,
      },
    ]);
  });

  it("官方/第三方计数分桶（official 缺省 = 第三方）", () => {
    const p = batchConfirmPayload([OFFICIAL, THIRD, { ...THIRD, id: "demo-gamma", official: false }]);
    expect(p.officialCount).toBe(1);
    expect(p.thirdPartyCount).toBe(2);
  });

  it("不传 localVersions → fromVersion 全 undefined（只显示目标版本）", () => {
    const p = batchConfirmPayload([OFFICIAL]);
    expect(p.entries[0].fromVersion).toBeUndefined();
  });
});
