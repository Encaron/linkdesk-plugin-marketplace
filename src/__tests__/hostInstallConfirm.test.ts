/**
 * hostInstallConfirm + updateAll 壳托管线的单测（P1）。
 *
 * 覆盖三条判据（缺一条就可能「新壳仍走旧链」或「老壳被新链拒」）：
 *   ① 来源身份单点推导（official / 第三方 / 缺字段）；
 *   ② API 形状守卫——dev 宿主对树外路径返回 call-stub 函数（不是对象），必须判 null；
 *   ③ updateAll 命中壳托管线时 `hosted: true`，且取消 = 0 个入队。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInstallRequest, installConfirmApi, publisherOf, sourceIdentityOf } from "../services/hostInstallConfirm";
import { updateAll } from "../services/libraryActions";
import type { CatalogEntry } from "../services/marketCatalog";

function entry(over: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: "demo-plugin",
    name: "Demo Plugin",
    version: "2.0.0",
    description: "demo",
    downloadUrl: "https://example.dev/demo-2.0.0.zip",
    size: 1234,
    ...over,
  } as CatalogEntry;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sourceIdentityOf —— 来源身份单点", () => {
  it("official 条目 → 固定 id official", () => {
    const id = sourceIdentityOf(entry({ official: true, sourceName: "Encaron/catalog", sourceUrl: "https://x.dev/marketplace.json" }));
    expect(id.id).toBe("official");
    expect(id.repo).toBe("Encaron/catalog");
  });

  it("第三方 → 来源仓库名当 id；缺仓库名退到源 URL", () => {
    expect(sourceIdentityOf(entry({ sourceName: "lab/market" })).id).toBe("lab/market");
    expect(sourceIdentityOf(entry({ sourceUrl: "https://lab.dev/marketplace.json" })).id).toBe(
      "https://lab.dev/marketplace.json",
    );
  });

  it("publisher 兼容 author 两种形态", () => {
    expect(publisherOf(entry({ author: "Solo Author" }))).toBe("Solo Author");
    expect(publisherOf(entry({ author: { name: "Org", url: "https://org.dev" } }))).toBe("Org");
    expect(publisherOf(entry())).toBeUndefined();
  });
});

describe("buildInstallRequest", () => {
  it("映射 mode/version/url/display，且过渡期 sha256 缺省", () => {
    const req = buildInstallRequest(entry(), "update", "https://example.dev/demo-2.0.1.zip", { version: "2.0.1" });
    expect(req).toMatchObject({
      mode: "update",
      pluginId: "demo-plugin",
      version: "2.0.1",
      downloadUrl: "https://example.dev/demo-2.0.1.zip",
      display: { name: "Demo Plugin", size: 1234 },
    });
    expect(req.sha256).toBeUndefined();
  });

  it("展示图优先 marketIcon → icon", () => {
    expect(buildInstallRequest(entry({ marketIcon: "m.png", icon: "i.png" }), "install", "https://x/y.zip").display.icon).toBe("m.png");
    expect(buildInstallRequest(entry({ icon: "i.png" }), "install", "https://x/y.zip").display.icon).toBe("i.png");
  });

  it("降级显式放行透传 allowOlder", () => {
    expect(buildInstallRequest(entry(), "update", "https://x/y.zip", { allowOlder: true }).allowOlder).toBe(true);
  });
});

describe("installConfirmApi —— 形状守卫", () => {
  it("无 window.linkdesk → null（老壳/预览）", () => {
    vi.stubGlobal("window", {});
    expect(installConfirmApi()).toBeNull();
  });

  it("plugins 是 call-stub 函数（dev 宿主假对象）→ null，⛔ 不当对象用", () => {
    vi.stubGlobal("window", { linkdesk: { plugins: () => undefined } });
    expect(installConfirmApi()).toBeNull();
  });

  it("有 requestInstall → 返回窄面；缺 requestUpdateBatch 时用单项逐个兜底", async () => {
    const calls: string[] = [];
    const requestInstall = vi.fn(async (r: { pluginId: string }) => {
      calls.push(r.pluginId);
      return { confirmed: true };
    });
    vi.stubGlobal("window", { linkdesk: { plugins: { requestInstall } } });
    const api = installConfirmApi();
    expect(api).not.toBeNull();
    const r = await api!.requestUpdateBatch!([
      { pluginId: "a" } as never,
      { pluginId: "b" } as never,
    ]);
    expect(calls).toEqual(["a", "b"]);
    expect(r.confirmed).toBe(true);
  });
});

describe("updateAll —— 壳托管线", () => {
  it("确认后返回 hosted:true + confirmed:true（完成反馈归壳）", async () => {
    const requestUpdateBatch = vi.fn(async () => ({ confirmed: true }));
    vi.stubGlobal("window", { linkdesk: { plugins: { requestInstall: async () => ({ confirmed: true }), requestUpdateBatch } } });
    const r = await updateAll([entry()], true, (k: string) => k);
    expect(r.hosted).toBe(true);
    expect(r.confirmed).toBe(true);
    expect(requestUpdateBatch).toHaveBeenCalledTimes(1);
  });

  it("取消 → hosted:true + confirmed:false + cancelled=请求数（0 个入队）", async () => {
    vi.stubGlobal("window", {
      linkdesk: { plugins: { requestInstall: async () => ({ confirmed: true }), requestUpdateBatch: async () => ({ confirmed: false, cancelled: true }) } },
    });
    const r = await updateAll([entry(), entry({ id: "demo-two" })], true, (k: string) => k);
    expect(r).toMatchObject({ hosted: true, confirmed: false, cancelled: 2, ok: 0 });
  });
});
