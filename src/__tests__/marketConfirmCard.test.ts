/**
 * 市场自绘确认卡（D8′）的单测——`installConfirmApi()` 的编排。
 *
 * 钉的是「谁画」这条线：
 *   ① 有 `prepare*`/`commit*` ⇒ 需要确认时弹**市场自己的**内容视图（viewId = marketplace-*），
 *      载荷就是壳给的 `view`（⛔ 市场不自造 plan/labels）；
 *   ② 取消/内容槽弹不出来 ⇒ `discardInstall`，⛔ 不 commit（当成功是灾难）；
 *   ③ 全免问（ask 为空）⇒ **不弹卡**，直接 commit；
 *   ④ 壳没有两步面 ⇒ 回落 `requestInstall` 快捷路径（壳画默认卡）。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { installConfirmApi, MARKET_CONFIRM_VIEWS } from "../services/hostInstallConfirm";

const VIEW = {
  kind: "install",
  labels: { installTitle: "安装 {{name}}" },
  plan: { ask: [{ request: { pluginId: "demo" } }], totals: { total: 1, ask: 1, silent: 0 } },
  fromVersion: "1.0.0",
  policy: { silentOfficial: true, silentTrustedSources: false },
} as never;

const BATCH_VIEW = { ...(VIEW as object), kind: "batch", plan: { ask: [1], totals: { total: 2, ask: 1, silent: 1 } } } as never;

const REQ = { pluginId: "demo" } as never;

function stub(plugins: Record<string, unknown>, dialog?: Record<string, unknown>) {
  vi.stubGlobal("window", { linkdesk: { plugins, dialog } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestInstall —— 市场自绘", () => {
  it("ask>0 ⇒ 弹 marketplace-install-confirm，确认后 commit；载荷是壳给的 view", async () => {
    const commitInstall = vi.fn(async () => ({ confirmed: true, ok: true }));
    const confirmContent = vi.fn(async (_o: { pluginId: string; viewId: string; payload: unknown }) => true);
    stub(
      {
        requestInstall: vi.fn(),
        prepareInstall: vi.fn(async () => ({ planId: "p1", plan: (VIEW as { plan: unknown }).plan, view: VIEW })),
        commitInstall,
        discardInstall: vi.fn(),
      },
      { confirmContent },
    );

    const r = await installConfirmApi()!.requestInstall(REQ);

    expect(confirmContent).toHaveBeenCalledTimes(1);
    expect(confirmContent.mock.calls[0][0]).toEqual({
      pluginId: "marketplace",
      viewId: MARKET_CONFIRM_VIEWS.install,
      payload: VIEW,
    });
    expect(commitInstall).toHaveBeenCalledWith("p1");
    expect(r).toEqual({ confirmed: true, ok: true });
  });

  it("取消 ⇒ discard，⛔ 不 commit，回 cancelled", async () => {
    const commitInstall = vi.fn(async () => ({ confirmed: true }));
    const discardInstall = vi.fn(async () => undefined);
    stub(
      {
        requestInstall: vi.fn(),
        prepareInstall: vi.fn(async () => ({ planId: "p1", plan: (VIEW as { plan: unknown }).plan, view: VIEW })),
        commitInstall,
        discardInstall,
      },
      { confirmContent: vi.fn(async () => false) },
    );

    const r = await installConfirmApi()!.requestInstall(REQ);

    expect(discardInstall).toHaveBeenCalledWith("p1");
    expect(commitInstall).not.toHaveBeenCalled();
    expect(r).toMatchObject({ confirmed: false, cancelled: true });
  });

  it("全免问（ask 为空）⇒ 不弹卡、直接 commit", async () => {
    const silentView = { ...(VIEW as object), plan: { ask: [], totals: { total: 1, ask: 0, silent: 1 } } } as never;
    const confirmContent = vi.fn(async (_o: { pluginId: string; viewId: string; payload: unknown }) => true);
    const commitInstall = vi.fn(async () => ({ confirmed: true, ok: true }));
    stub(
      {
        requestInstall: vi.fn(),
        prepareInstall: vi.fn(async () => ({ planId: "p2", plan: (silentView as { plan: unknown }).plan, view: silentView })),
        commitInstall,
        discardInstall: vi.fn(),
      },
      { confirmContent },
    );

    await installConfirmApi()!.requestInstall(REQ);

    expect(confirmContent).not.toHaveBeenCalled();
    expect(commitInstall).toHaveBeenCalledWith("p2");
  });

  it("内容槽弹不出来 ⇒ 当取消（discard），⛔ 静默装下去", async () => {
    const commitInstall = vi.fn(async () => ({ confirmed: true }));
    const discardInstall = vi.fn(async () => undefined);
    stub(
      {
        requestInstall: vi.fn(),
        prepareInstall: vi.fn(async () => ({ planId: "p1", plan: (VIEW as { plan: unknown }).plan, view: VIEW })),
        commitInstall,
        discardInstall,
      },
      {}, // 没有 dialog 面
    );

    const r = await installConfirmApi()!.requestInstall(REQ);
    expect(discardInstall).toHaveBeenCalledWith("p1");
    expect(commitInstall).not.toHaveBeenCalled();
    expect(r.confirmed).toBe(false);
  });

  it("壳没有两步面 ⇒ 回落 requestInstall 快捷路径", async () => {
    const requestInstall = vi.fn(async () => ({ confirmed: true }));
    stub({ requestInstall });
    const r = await installConfirmApi()!.requestInstall(REQ);
    expect(requestInstall).toHaveBeenCalledWith(REQ);
    expect(r.confirmed).toBe(true);
  });
});

describe("requestUpdateBatch —— 市场自绘", () => {
  it("ask>0 ⇒ 弹 marketplace-update-batch 后 commit", async () => {
    const confirmContent = vi.fn(async (_o: { pluginId: string; viewId: string; payload: unknown }) => true);
    const commitInstall = vi.fn(async () => ({ confirmed: true }));
    stub(
      {
        requestInstall: vi.fn(),
        prepareUpdateBatch: vi.fn(async () => ({ planId: "b1", plan: (BATCH_VIEW as { plan: unknown }).plan, view: BATCH_VIEW })),
        commitInstall,
        discardInstall: vi.fn(),
      },
      { confirmContent },
    );

    const r = await installConfirmApi()!.requestUpdateBatch!([REQ]);
    expect(confirmContent.mock.calls[0][0]).toMatchObject({ viewId: MARKET_CONFIRM_VIEWS.batch, payload: BATCH_VIEW });
    expect(commitInstall).toHaveBeenCalledWith("b1");
    expect(r.confirmed).toBe(true);
  });
});
describe("风险分档：cardOwner = host（首装/来源变更/降级/未信任来源）", () => {
  it("单项：壳说这单要壳画 ⇒ 丢弃计划、改走 requestInstall（⛔ 不弹市场卡）", async () => {
    const confirmContent = vi.fn(async (_o: { pluginId: string; viewId: string; payload: unknown }) => true);
    const discardInstall = vi.fn(async () => undefined);
    const requestInstall = vi.fn(async () => ({ confirmed: true }));
    const commitInstall = vi.fn(async () => ({ confirmed: true }));
    stub(
      {
        requestInstall,
        prepareInstall: vi.fn(async () => ({
          planId: "p-host",
          plan: (VIEW as { plan: unknown }).plan,
          view: VIEW,
          cardOwner: "host",
        })),
        commitInstall,
        discardInstall,
      },
      { confirmContent },
    );

    const r = await installConfirmApi()!.requestInstall(REQ);

    expect(discardInstall).toHaveBeenCalledWith("p-host");
    expect(requestInstall).toHaveBeenCalledWith(REQ); // 壳默认卡
    expect(confirmContent).not.toHaveBeenCalled();
    expect(commitInstall).not.toHaveBeenCalled();
    expect(r.confirmed).toBe(true);
  });

  it("批量：壳说整批要壳画 ⇒ 改走 requestUpdateBatch", async () => {
    const confirmContent = vi.fn(async (_o: { pluginId: string; viewId: string; payload: unknown }) => true);
    const requestUpdateBatch = vi.fn(async () => ({ confirmed: true }));
    stub(
      {
        requestInstall: vi.fn(),
        prepareUpdateBatch: vi.fn(async () => ({
          planId: "b-host",
          plan: (BATCH_VIEW as { plan: unknown }).plan,
          view: BATCH_VIEW,
          cardOwner: "host",
        })),
        commitInstall: vi.fn(async () => ({ confirmed: true })),
        discardInstall: vi.fn(async () => undefined),
        requestUpdateBatch,
      },
      { confirmContent },
    );

    const r = await installConfirmApi()!.requestUpdateBatch!([REQ]);
    expect(requestUpdateBatch).toHaveBeenCalledWith([REQ]);
    expect(confirmContent).not.toHaveBeenCalled();
    expect(r.confirmed).toBe(true);
  });
});
