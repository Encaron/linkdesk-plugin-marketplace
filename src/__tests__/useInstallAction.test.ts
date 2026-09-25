/**
 * useInstallAction 单测——详情视图的安装腿（E6#152 必做⑥；此前零测试）。
 * 它既是「用户点得到的那一下」，也是全仓 minAppVersion 拦装的**唯一落点**（installGate 只管弹卡）。
 *
 * 替身口径（照本仓既有惯例：**要取外壳面就 mock 掉本仓自己的模块**，不动共享 mock）：
 *   - `marketplaceShared`（startMarketInstall / retryMarketInstall / notifyError）
 *   - `installGate`（confirmMarketInstall）—— 确认门的返回值由用例控制
 *   - `installJobs`（useInstallJob）—— 按钮五态的数据源由用例直接摆
 *   - `installedUpdateMeta`（setPinnedVersion）—— 只管「写了什么钉」
 *   - `react-i18next`（useTranslation）—— 假 `t` 原样回 key（i18n key = 中文原文，硬约束 2）
 * 真逻辑保留：`installGateError` 全部分支、`runInstall` 的钉写、三个点击入口的编排顺序。
 *
 * 🔴 本文件最值钱的两条否定断言：
 *   ① **确认前不落任何安装动作**（用户取消 ⇒ `startMarketInstall` 一次都没调）；
 *   ② 拦下时**无 toast**（G3：已装冲突 / 离线是状态类，红字与 toast 都是噪音）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { CatalogEntry } from "../services/marketCatalog";

const h = vi.hoisted(() => {
  const S: { job: unknown } = { job: null };
  return {
    S,
    startMarketInstall: vi.fn(async () => true),
    retryMarketInstall: vi.fn(async () => true),
    notifyError: vi.fn(),
    confirmMarketInstall: vi.fn(async () => true),
    setPinnedVersion: vi.fn(async () => {}),
  };
});

vi.mock("../services/marketplaceShared", () => ({
  startMarketInstall: h.startMarketInstall,
  retryMarketInstall: h.retryMarketInstall,
  notifyError: h.notifyError,
}));

vi.mock("../services/installGate", () => ({ confirmMarketInstall: h.confirmMarketInstall }));

vi.mock("../services/installedUpdateMeta", () => ({ setPinnedVersion: h.setPinnedVersion }));

vi.mock("../services/installJobs", () => ({
  installJobLabel: (_t: unknown, job: { state?: string } | null) => `job:${job?.state ?? "none"}`,
  useInstallJob: () => h.S.job,
}));

vi.mock("react-i18next", () => ({
  /** 假 `t`：回 key + 自行插值（key = 中文原文，硬约束 2）——不引真字典，但保住「带参文案」的牙 */
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? key.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(opts[k] ?? "")) : key,
  }),
}));

import { useInstallAction } from "../views/detail/DetailView/useInstallAction";

const URL_DL = "https://example.invalid/releases/demo-alpha-1.0.0.linkdesk-plugin";

const ENTRY: CatalogEntry = {
  id: "demo-alpha",
  name: "Demo Alpha",
  version: "1.0.0",
  downloadUrl: URL_DL,
  sourceUrl: "https://example.invalid/catalog.json",
};

type IdArg = Parameters<typeof useInstallAction>[0];
type OptsArg = Parameters<typeof useInstallAction>[1];

/** 身份层入参（本 hook 只消费 pluginId / entry / installed 三项） */
function identity(o: { pluginId?: string; entry?: CatalogEntry; installed?: boolean } = {}): IdArg {
  return { pluginId: "demo-alpha", entry: ENTRY, installed: false, ...o } as IdArg;
}

/** 选项默认：在线、有地址、有壳版本——各例只改自己那一项 */
function opts(o: Partial<OptsArg> = {}): OptsArg {
  return { busy: false, online: true, installUrl: URL_DL, installVer: "1.0.0", appVersion: "1.0.0", ...o };
}

beforeEach(() => {
  h.S.job = null;
  h.startMarketInstall.mockClear();
  h.retryMarketInstall.mockClear();
  h.notifyError.mockClear();
  h.confirmMarketInstall.mockClear().mockResolvedValue(true);
  h.setPinnedVersion.mockClear();
  (window as unknown as { linkdesk: unknown }).linkdesk = { pluginManager: { installWithProgress: vi.fn() } };
});

afterEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = undefined;
});

describe("installGateError——拦与放行的全部分支（静默拦 vs 事件型 toast）", () => {
  it("🔴 已装 ⇒ 静默拦：无 toast（UI 本已翻转，冲突非用户可见失败）", () => {
    const { result } = renderHook(() => useInstallAction(identity({ installed: true }), opts()));
    expect(result.current.installGateError()).toBe(true);
    expect(h.notifyError).not.toHaveBeenCalled();
  });

  it("🔴 离线 ⇒ 静默拦：无 toast（按钮已置灰 + title 已表达，离线≠失败）", () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts({ online: false })));
    expect(result.current.installGateError()).toBe(true);
    expect(h.notifyError).not.toHaveBeenCalled();
  });

  it("缺下载地址 ⇒ 事件型失败：error toast 报一次", () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts({ installUrl: undefined })));
    expect(result.current.installGateError()).toBe(true);
    expect(h.notifyError).toHaveBeenCalledWith("该插件缺少下载地址");
  });

  it("壳无安装面（老 preload）⇒ 事件型失败 toast", () => {
    (window as unknown as { linkdesk: unknown }).linkdesk = {};
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    expect(result.current.installGateError()).toBe(true);
    expect(h.notifyError).toHaveBeenCalledWith("安装失败");
  });

  it("🔴 minAppVersion 高于壳版本 ⇒ 拒装并点名要求版本", () => {
    const { result } = renderHook(() =>
      useInstallAction(identity({ entry: { ...ENTRY, minAppVersion: "9.9.9" } }), opts({ appVersion: "1.0.0" })),
    );
    expect(result.current.installGateError()).toBe(true);
    expect(h.notifyError).toHaveBeenCalledTimes(1);
    expect(String(h.notifyError.mock.calls[0][0])).toContain("9.9.9");
  });

  it("minAppVersion 低于/等于壳版本 ⇒ 放行", () => {
    const a = renderHook(() =>
      useInstallAction(identity({ entry: { ...ENTRY, minAppVersion: "1.0.0" } }), opts({ appVersion: "1.0.0" })),
    );
    expect(a.result.current.installGateError()).toBe(false);
    const b = renderHook(() =>
      useInstallAction(identity({ entry: { ...ENTRY, minAppVersion: "0.9.0" } }), opts({ appVersion: "1.0.0" })),
    );
    expect(b.result.current.installGateError()).toBe(false);
    expect(h.notifyError).not.toHaveBeenCalled();
  });

  it("🔴 插件声明了 minAppVersion 但读不到壳版本 ⇒ 放行（诚实不缺省拦装）", () => {
    const { result } = renderHook(() =>
      useInstallAction(identity({ entry: { ...ENTRY, minAppVersion: "9.9.9" } }), opts({ appVersion: undefined })),
    );
    expect(result.current.installGateError()).toBe(false);
    expect(h.notifyError).not.toHaveBeenCalled();
  });

  it("条目无 minAppVersion ⇒ 不判（老目录条目照装）", () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts({ appVersion: "0.1.0" })));
    expect(result.current.installGateError()).toBe(false);
  });
});

describe("runInstall（安装执行单一入口）", () => {
  it("放行 ⇒ 直呼 startMarketInstall，身份四件随行（含条目来源 URL——壳据此装缺失依赖）", async () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    await act(async () => {
      await result.current.runInstall();
    });
    expect(h.startMarketInstall).toHaveBeenCalledWith("demo-alpha", URL_DL, "Demo Alpha", ENTRY.sourceUrl);
  });

  it("🔴 拦下 ⇒ 不发起（否定断言）", async () => {
    const { result } = renderHook(() => useInstallAction(identity({ installed: true }), opts()));
    await act(async () => {
      await result.current.runInstall();
    });
    expect(h.startMarketInstall).not.toHaveBeenCalled();
  });

  it("🔴 busy ⇒ 直接返回，不发起", async () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts({ busy: true })));
    await act(async () => {
      await result.current.runInstall();
    });
    expect(h.startMarketInstall).not.toHaveBeenCalled();
  });

  it("🔴 本插件已在跑（installingHere）⇒ 不重复发起", async () => {
    h.S.job = { pluginId: "demo-alpha", state: "running" };
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    await act(async () => {
      await result.current.runInstall();
    });
    expect(h.startMarketInstall).not.toHaveBeenCalled();
  });

  it("装目录稳定最新 ⇒ 写钉为 null（清钉语义：装 = 一次新的落地，压过以前那次）", async () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts({ installVer: "1.0.0" })));
    await act(async () => {
      await result.current.runInstall();
    });
    expect(h.setPinnedVersion).toHaveBeenCalledWith("demo-alpha", null);
  });

  it("装旧版（非目录稳定最新）⇒ 记 appliedVersion 为钉（尊重「停在旧版」意图）", async () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts({ installVer: "0.9.0" })));
    await act(async () => {
      await result.current.runInstall();
    });
    expect(h.setPinnedVersion).toHaveBeenCalledWith("demo-alpha", "0.9.0");
  });

  it("🔴 E6#81：entry 缺席（目录读不到）也必须**写 null 清钉**——不是「不写」", async () => {
    const { result } = renderHook(() =>
      useInstallAction(identity({ entry: undefined }), opts({ installVer: "0.9.0" })),
    );
    await act(async () => {
      await result.current.runInstall();
    });
    expect(h.setPinnedVersion).toHaveBeenCalledWith("demo-alpha", null);
  });

  it("无 installVer（未选中具体版本）⇒ 不碰钉", async () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts({ installVer: undefined })));
    await act(async () => {
      await result.current.runInstall();
    });
    expect(h.setPinnedVersion).not.toHaveBeenCalled();
  });
});

describe("handleInstallClick（确认门恒弹——本次安装一次确认只对这一次有效）", () => {
  it("🔴 用户点确认 ⇒ 才发起（顺序：先弹卡，再落动作）", async () => {
    h.confirmMarketInstall.mockResolvedValue(true);
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    await act(async () => {
      await result.current.handleInstallClick();
    });

    expect(h.confirmMarketInstall).toHaveBeenCalledWith(ENTRY, "install", "1.0.0");
    expect(h.startMarketInstall).toHaveBeenCalledTimes(1);
  });

  it("🔴🔴 用户取消 ⇒ **确认前不落任何安装动作**（本层最值钱的一条否定断言）", async () => {
    h.confirmMarketInstall.mockResolvedValue(false);
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    await act(async () => {
      await result.current.handleInstallClick();
    });

    expect(h.confirmMarketInstall).toHaveBeenCalledTimes(1); // 真弹了
    expect(h.startMarketInstall).not.toHaveBeenCalled(); // 但一个动作都没落
    expect(h.setPinnedVersion).not.toHaveBeenCalled();
  });

  it("🔴 门禁不过 ⇒ 连确认卡都不弹（静默拦在弹卡之前）", async () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts({ online: false })));
    await act(async () => {
      await result.current.handleInstallClick();
    });
    expect(h.confirmMarketInstall).not.toHaveBeenCalled();
    expect(h.startMarketInstall).not.toHaveBeenCalled();
  });

  it("条目不可得（entry 缺席）⇒ 弹不出富内容卡即返回，不发起", async () => {
    const { result } = renderHook(() => useInstallAction(identity({ entry: undefined }), opts()));
    await act(async () => {
      await result.current.handleInstallClick();
    });
    expect(h.confirmMarketInstall).not.toHaveBeenCalled();
    expect(h.startMarketInstall).not.toHaveBeenCalled();
  });
});

describe("retryInstall（行内 [重试] 红钮——与 toast [重试] 同一条路）", () => {
  it("点击 ⇒ retryMarketInstall 带同三项（pluginId / downloadUrl / 显示名）", () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    act(() => {
      result.current.retryInstall();
    });
    expect(h.retryMarketInstall).toHaveBeenCalledWith("demo-alpha", URL_DL, "Demo Alpha");
  });

  it("缺地址/缺 id ⇒ 以空串兜底（重试入口自己防——不在这里崩）", () => {
    const { result } = renderHook(() => useInstallAction(identity({ entry: undefined }), opts({ installUrl: undefined })));
    act(() => {
      result.current.retryInstall();
    });
    expect(h.retryMarketInstall).toHaveBeenCalledWith("demo-alpha", "", undefined);
  });
});

describe("按钮五态（壳侧 job 只读镜像 → 原位画什么）", () => {
  it("本插件在跑 ⇒ installingHere", () => {
    h.S.job = { pluginId: "demo-alpha", state: "running" };
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    expect(result.current.installingHere).toBe(true);
    expect(result.current.queuedHere).toBe(false);
  });

  it("本插件排队（不在跑）⇒ queuedHere", () => {
    h.S.job = { pluginId: "demo-alpha", state: "queued" };
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    expect(result.current.queuedHere).toBe(true);
    expect(result.current.installingHere).toBe(false);
  });

  it("已出结果且失败 ⇒ installErrHere（安装钮原位变红「重试安装」）", () => {
    h.S.job = { pluginId: "demo-alpha", state: "settled", terminal: "failed" };
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    expect(result.current.installErrHere).not.toBeNull();
  });

  it("已出结果且成功 ⇒ installErrHere 为空（不留红行）", () => {
    h.S.job = { pluginId: "demo-alpha", state: "settled", terminal: "succeeded" };
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    expect(result.current.installErrHere).toBeNull();
  });

  it("卸载腿在跑 ⇒ uninstallingHere（此前按钮灰着字不变，看不出在动）", () => {
    h.S.job = { pluginId: "demo-alpha", kind: "uninstall", state: "running" };
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    expect(result.current.uninstallingHere).toBe(true);
  });

  it("无 job ⇒ 五态皆空，标签走 installJobLabel(t, null)", () => {
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    expect(result.current.installingHere).toBe(false);
    expect(result.current.queuedHere).toBe(false);
    expect(result.current.installErrHere).toBeNull();
    expect(result.current.uninstallingHere).toBe(false);
    expect(result.current.installLabel()).toBe("job:none");
  });

  it("在跑时标签由 installJobLabel 派生（同一个 t 实例）", () => {
    h.S.job = { pluginId: "demo-alpha", state: "running" };
    const { result } = renderHook(() => useInstallAction(identity(), opts()));
    expect(result.current.installLabel()).toBe("job:running");
  });
});
