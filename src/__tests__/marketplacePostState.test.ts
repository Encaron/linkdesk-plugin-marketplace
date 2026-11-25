/**
 * marketplace.enable/disable/uninstall 的后置状态契约（Block 2 跨领域试点）。
 * 判据：成功 ⇒ 回读真实装/启态；缺 pluginId ⇒ 可判读 reason（⛔ 静默 undefined）。
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";

type Handler = (...args: unknown[]) => Promise<unknown>;
const handlers = new Map<string, Handler>();
let installed: string[] = [];
let disabled: string[] = [];

beforeAll(async () => {
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    commands: { registerCommand: (id: string, h: Handler) => { handlers.set(id, h); } },
    menu: { registerItems: () => {} },
    pluginManager: {
      list: async () => installed.map((id) => ({ id })),
      getDisabled: async () => [...disabled],
      enable: async (id: string) => { disabled = disabled.filter((x) => x !== id); if (!installed.includes(id)) installed.push(id); },
      disable: async (id: string) => { if (!disabled.includes(id)) disabled.push(id); },
      uninstall: async (id: string) => { installed = installed.filter((x) => x !== id); disabled = disabled.filter((x) => x !== id); },
    },
  };
  await import("../services/marketplaceShared/commands");
});

beforeEach(() => {
  installed = ["demo-plugin"];
  disabled = [];
});

const call = (id: string, ...args: unknown[]) => handlers.get(`marketplace.${id}`)!(...args);

describe("marketplace enable/disable/uninstall 后置状态", () => {
  it("enable ⇒ 回读 enabled:true", async () => {
    disabled = ["demo-plugin"];
    const res = await call("enable", { pluginId: "demo-plugin" }) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true, pluginId: "demo-plugin", enabled: true });
  });

  it("disable ⇒ 回读 enabled:false", async () => {
    const res = await call("disable", { pluginId: "demo-plugin" }) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true, pluginId: "demo-plugin", enabled: false });
  });

  it("uninstall ⇒ 回读 installed:false", async () => {
    const res = await call("uninstall", { pluginId: "demo-plugin" }) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true, pluginId: "demo-plugin", installed: false });
  });

  it("缺 pluginId ⇒ 可判读 reason（⛔ 静默 undefined）", async () => {
    const res = await call("enable", {}) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: false, pluginId: null, reason: "missing-pluginId" });
  });

  it("逐位 pluginId 与具名对象两形等价", async () => {
    const res = await call("disable", "demo-plugin") as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true, pluginId: "demo-plugin", enabled: false });
  });
});
