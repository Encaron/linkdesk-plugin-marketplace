/**
 * installGate 单测——E6#71k 安装/更新确认门（E6#152 补；此前零测试）。
 *
 * 🔴 口径更正（裁决依据）：立案表把本单元写成「兼容判据（minAppVersion 等）→ 放行/拦下/理由」，
 *   **那条描述是陈旧的**——`minAppVersion` 比对住在 `useInstallAction.ts` 的 `installGateError`，
 *   不在本模块。本模块的真实规则只有一条（头注原文）：**一律弹卡**，没有判序表、没有豁免、没有记忆。
 *   故本文件钉的是「弹与怎么弹、弹不出怎么办」，不是版本判据。
 *
 * 三个必须钉住的分支：
 *   ① `dlg` 整个缺失（老 preload）→ **返回 false 且不弹**——「不能问就不装」（保守方向，
 *      反向做法「读不到当已信任」才是静默安装漏洞）；
 *   ② `entry` + `confirmContent` 齐备 → 市场自画富内容卡，payload 由 `installConfirmPayload` 单一构造；
 *   ③ `entry` 缺席（下架/离线读不到目录）→ 回落壳纯文字 confirm，**仍然要问**，名字走 fallbackName。
 * 返回值一律**严判 `=== true`**——壳面回落/异常值不算「用户点了确认」。
 *
 * fixture 全虚构（硬约束 21）：demo-* id、example.invalid 域名。断言走 `i18n.t` 现算
 * （i18n key = 中文原文，硬约束 2）——不硬写中文串，字典改了本文件不碎。
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import i18n from "i18next";
import { confirmMarketInstall, confirmMarketInstallById } from "../services/installGate";
import { installConfirmPayload } from "../services/installConfirmPayload";
import { __setCatalogIO, type StorageLike } from "../services/marketSources";
import type { CatalogEntry } from "../services/marketCatalog";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

type Lk = {
  linkdesk: {
    dialog?: {
      confirm?: ReturnType<typeof vi.fn>;
      confirmContent?: ReturnType<typeof vi.fn>;
    };
    configuration?: { get: () => Promise<unknown>; onChange: () => () => void };
  };
};

const ENTRY: CatalogEntry = {
  id: "demo-alpha",
  name: "Demo Alpha",
  version: "1.0.0",
  downloadUrl: "https://example.invalid/releases/demo-alpha-1.0.0.linkdesk-plugin",
  author: { name: "Demo Author" },
  sourceUrl: "https://example.invalid/catalog.json",
};

function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** 装壳面：dialog 面按用例给（可整个不传 = 老 preload） */
function setShell(dialog?: Lk["linkdesk"]["dialog"]) {
  (window as unknown as Lk).linkdesk = {
    dialog,
    configuration: { get: async () => null, onChange: () => () => {} },
  };
}

/** 注入目录替身——`FetchFn` 契约是**直接返回目录文本**；失败态要**抛**（reason=network），
 *  返回坏文本会被判 reason=parse（那是「源可达但在传坏数据」的另一回事）。 */
function injectCatalog(ok = true) {
  const text = JSON.stringify({ version: "1", updatedAt: "2026-09-01T00:00:00Z", plugins: [ENTRY] });
  __setCatalogIO(async () => {
    if (!ok) throw new Error("demo-offline");
    return text;
  }, fakeStorage());
}

/* 生产前提 = marketplace 入口 i18n init 先行；单测不走入口 ⇒ 手动 init 同款默认实例，
 * 否则未初始化时 `i18n.t` 返回 undefined（本门的两条文案断言就没有牙了）。
 * 资源留空 ⇒ `t` 回 key（i18n key = 中文原文，硬约束 2）——不引真字典、不硬写中文串。 */
beforeAll(async () => {
  await i18n.init({
    lng: "en",
    fallbackLng: false,
    nsSeparator: false,
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

beforeEach(() => {
  injectCatalog();
});

afterEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  __setCatalogIO(null, null);
});

describe("confirmMarketInstall（恒弹门——三个分支）", () => {
  it("🔴 dialog 面整个缺失（老 preload）→ false 且不弹——不能问就不装", async () => {
    setShell(undefined);
    await expect(confirmMarketInstall(ENTRY, "install")).resolves.toBe(false);
  });

  it("entry + confirmContent 齐备 → 走富内容卡：payload 由 installConfirmPayload 单一构造", async () => {
    const confirmContent = vi.fn(async () => true);
    const confirm = vi.fn(async () => true);
    setShell({ confirm, confirmContent });

    await expect(confirmMarketInstall(ENTRY, "install", "1.0.0")).resolves.toBe(true);

    expect(confirmContent).toHaveBeenCalledTimes(1);
    const arg = confirmContent.mock.calls[0][0] as {
      pluginId: string;
      viewId: string;
      title: string;
      message: string;
      payload: unknown;
    };
    // 身份与寻址：壳 DialogHost content 槽按 pluginId + viewId 找 ConfirmInstall 视图
    expect(arg.pluginId).toBe("marketplace");
    expect(arg.viewId).toBe("marketplace-install-confirm");
    // title/message 只在「视图寻址失败」时被壳当纯文字兜底用——必须有值
    expect(arg.title).toBe(i18n.t("确认安装"));
    expect(arg.message).toBe(i18n.t("确认前请查看来源与发布者。"));
    // payload 与纯函数同源同参——不许在本模块另拼一份
    expect(arg.payload).toEqual(installConfirmPayload(ENTRY, "install", "1.0.0"));
    // 富内容卡在时**不走**纯文字兜底
    expect(confirm).not.toHaveBeenCalled();
  });

  it("mode=update → 标题取「确认更新」（同一条门两种措辞）", async () => {
    const confirmContent = vi.fn(async () => true);
    setShell({ confirmContent });
    await confirmMarketInstall(ENTRY, "update");
    expect((confirmContent.mock.calls[0][0] as { title: string }).title).toBe(i18n.t("确认更新"));
  });

  it("返回值严判 === true：壳面给 false / undefined 一律不算「用户点了确认」", async () => {
    const confirmContent = vi.fn(async () => false);
    setShell({ confirmContent });
    await expect(confirmMarketInstall(ENTRY, "install")).resolves.toBe(false);

    const confirmContent2 = vi.fn(async () => undefined);
    setShell({ confirmContent: confirmContent2 });
    await expect(confirmMarketInstall(ENTRY, "install")).resolves.toBe(false);
  });

  it("entry 缺席 → 回落壳纯文字 confirm，**仍然要问**，名字走 fallbackName", async () => {
    const confirm = vi.fn(async () => true);
    const confirmContent = vi.fn(async () => true);
    setShell({ confirm, confirmContent });

    await expect(confirmMarketInstall(undefined, "install", undefined, "Demo Fallback")).resolves.toBe(true);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirmContent).not.toHaveBeenCalled(); // 条目不可得 ⇒ 画不出富内容卡
    expect(String(confirm.mock.calls[0][0])).toContain("Demo Fallback");
  });

  it("entry 缺席且无 fallbackName → 名字退化为空串（不造名字，仍要问）", async () => {
    const confirm = vi.fn(async () => true);
    setShell({ confirm });
    await expect(confirmMarketInstall(undefined, "install")).resolves.toBe(true);
    expect(String(confirm.mock.calls[0][0])).toContain(i18n.t("确认安装「{{name}}」？", { name: "" }));
  });

  it("有 entry 但壳只有纯文字 confirm（老壳无 confirmContent）→ 回落 confirm，名字取条目名", async () => {
    const confirm = vi.fn(async () => true);
    setShell({ confirm });
    await expect(confirmMarketInstall(ENTRY, "install")).resolves.toBe(true);
    expect(String(confirm.mock.calls[0][0])).toContain("Demo Alpha");
  });

  it("🔴 两面都没有 → false（不静默放行）", async () => {
    setShell({ confirm: undefined, confirmContent: undefined });
    await expect(confirmMarketInstall(ENTRY, "install")).resolves.toBe(false);
  });
});

describe("confirmMarketInstallById（重试路径专用——入参只有 pluginId，来源现查目录）", () => {
  it("目录能查到该 id → 富内容卡用目录条目（条目来自 loadCatalog 的现查结果）", async () => {
    const confirmContent = vi.fn(async () => true);
    setShell({ confirmContent });

    await expect(confirmMarketInstallById("demo-alpha", "Demo Fallback")).resolves.toBe(true);

    const arg = confirmContent.mock.calls[0][0] as { payload: { name?: string; publisher?: string } };
    // 比对载荷字段而非整对象：目录条目经 parse 白名单归一（字段集与手写 fixture 不必逐字相同）
    expect(arg.payload).toMatchObject({ name: "Demo Alpha", publisher: "Demo Author" });
    // 名字走的是**目录条目**（不是 fallbackName）——fallbackName 只在查不到条目时才用
    expect(String(arg.title)).not.toContain("Demo Fallback");
  });

  it("目录拉不到（离线/下架）→ 回落纯文字 confirm，名字用 fallbackName ?? pluginId", async () => {
    injectCatalog(false); // 全源失败 ⇒ 目录空 ⇒ 查不到条目
    const confirm = vi.fn(async () => true);
    setShell({ confirm });

    await expect(confirmMarketInstallById("demo-alpha", "Demo Fallback")).resolves.toBe(true);
    expect(String(confirm.mock.calls[0][0])).toContain("Demo Fallback");
  });

  it("不传 fallbackName → 名字退化为 pluginId（诚实兜底，不留空标题）", async () => {
    injectCatalog(false);
    const confirm = vi.fn(async () => true);
    setShell({ confirm });
    await confirmMarketInstallById("demo-alpha");
    expect(String(confirm.mock.calls[0][0])).toContain("demo-alpha");
  });
});
