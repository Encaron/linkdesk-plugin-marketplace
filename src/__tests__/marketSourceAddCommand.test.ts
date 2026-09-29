/**
 * marketSourceAddCommand 单测——「添加市场源」的命令面（M2 生长格 `AI#56`）。
 *
 * 钉的是四条：
 *   ① **与弹窗同一条写路径**——读现作者源 → 决策 → **仅 ok 才** `configuration.set("marketplace.marketplaceSources", next)`；
 *      ⛔ 命令层不复制判重（四种拒因全部来自纯决策单点 `decideAddSource`），故本文件不复测决策本身
 *      （那半边在 `settingsSwapSmoke.test.ts` ＋ 壳侧 audit 面），只测**命令层的接线与回执**。
 *   ② **回执三态**（`AI#55`/`AI#60` 口径）——加上了 `{ok:true,added}` ／ 成立但没变
 *      `{ok:true,noop:true,reason:"official"|"duplicate"}` ／ 调用本身不成立
 *      `{ok:false,noop:true,reason:"empty"|"bad-url"}`；**只有第一种真落盘**（其余 set 一次都不许被调）。
 *   ③ **两种调用形等价**——位置形（一串 URL）与具名对象形（`{ url }`：参数只声明一条 ⇒ 壳不展开，对象原样进来）。
 *   ④ **写盘失败大声抛**——`set` 抛错 / 配置面孔整个缺失都不吞成假 ok（⛔「什么都没发生」比报错更难查）。
 *
 * fixture 全虚构（硬约束 21）：owner-two / owner-three 作者源仓库——与 `settingsSwapSmoke.test.ts` 同常量。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { runAddSource, registerMarketSourceAddCommand } from "../services/marketSourceAddCommand";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";

const OFFICIAL_REPO_PAGE = "https://github.com/encaron/linkdesk-marketplace";
// 虚构作者源（硬约束 21）
const AUTHOR_A_MAIN = "https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/marketplace.json";
const AUTHOR_A_REPO_PAGE = "https://github.com/owner-two/catalog-repo-b";
const AUTHOR_B_REPO_PAGE = "https://github.com/owner-three/catalog-repo-c";

/** 配置面替身——get 读可变 stored（模拟持久化），set 写回；set 可断言落盘次数与入参 */
function makeConfig(initial: string[] | undefined) {
  let stored = initial;
  const get = vi.fn(async () => stored);
  const set = vi.fn(async (_key: string, v: unknown) => {
    stored = v as string[];
  });
  Object.defineProperty(window, "linkdesk", {
    value: { configuration: { get, set } },
    configurable: true,
  });
  return { get, set, stored: () => stored };
}

afterEach(() => {
  Reflect.deleteProperty(window, "linkdesk");
});

describe("runAddSource —— AI#56 加源命令的回执三态", () => {
  it("位置形：新作者源 → {ok:true,added} ＋ 落盘恰一次（键名与整数组都对）", async () => {
    const cfg = makeConfig(undefined); // 冷盘：配置里只有官方 default（读侧已滤）⇒ 现作者源 = 空

    expect(await runAddSource(AUTHOR_A_REPO_PAGE)).toEqual({ ok: true, added: AUTHOR_A_REPO_PAGE });
    expect(cfg.set).toHaveBeenCalledTimes(1);
    expect(cfg.set).toHaveBeenCalledWith("marketplace.marketplaceSources", [AUTHOR_A_REPO_PAGE]);
    expect(cfg.stored()).toEqual([AUTHOR_A_REPO_PAGE]); // 官方源不入册
  });

  it("具名对象形 {url} 与位置形等价；粘来的空白 trim 后落盘原文（不归一）", async () => {
    const cfg = makeConfig([]);

    expect(await runAddSource({ url: `  ${AUTHOR_B_REPO_PAGE}  ` })).toEqual({
      ok: true,
      added: AUTHOR_B_REPO_PAGE,
    });
    expect(cfg.set).toHaveBeenCalledWith("marketplace.marketplaceSources", [AUTHOR_B_REPO_PAGE]);
    expect(cfg.stored()).toEqual([AUTHOR_B_REPO_PAGE]);
  });

  it("已有作者源 → 追加在后（不重排；官方残留读侧滤掉、永不写回）", async () => {
    const cfg = makeConfig([OFFICIAL_REPO_PAGE, AUTHOR_A_MAIN]);

    expect(await runAddSource(AUTHOR_B_REPO_PAGE)).toEqual({ ok: true, added: AUTHOR_B_REPO_PAGE });
    expect(cfg.stored()).toEqual([AUTHOR_A_MAIN, AUTHOR_B_REPO_PAGE]);
  });

  it.each([OFFICIAL_SOURCE_URL, OFFICIAL_REPO_PAGE])(
    "official：官方源任何形态（%s）⇒ {ok:true,noop:true} 且零落盘",
    async (official) => {
      const cfg = makeConfig([]);

      expect(await runAddSource(official)).toEqual({ ok: true, noop: true, reason: "official" });
      expect(cfg.set).not.toHaveBeenCalled();
    },
  );

  it("duplicate：同身份已在列表（主页 vs 已存的 HEAD 直链）⇒ {ok:true,noop:true} 且零落盘", async () => {
    const cfg = makeConfig([AUTHOR_A_MAIN]);

    expect(await runAddSource(AUTHOR_A_REPO_PAGE)).toEqual({ ok: true, noop: true, reason: "duplicate" });
    expect(cfg.set).not.toHaveBeenCalled();
  });

  it.each([[undefined], [""], ["   "], [{}], [{} as { url?: string }]])(
    "empty：没给 URL（%s）⇒ {ok:false,noop:true,reason:empty} 且零落盘",
    async (args) => {
      const cfg = makeConfig([]);

      expect(await runAddSource(args as string | { url?: string } | undefined)).toEqual({
        ok: false,
        noop: true,
        reason: "empty",
      });
      expect(cfg.set).not.toHaveBeenCalled();
    },
  );

  it.each([["not-a-url"], ["ftp://nope"], ["https://gitlab.com/owner/repo"]])(
    "bad-url：归一失败（%s）⇒ {ok:false,noop:true,reason:bad-url} 且零落盘",
    async (bad) => {
      const cfg = makeConfig([]);

      expect(await runAddSource(bad)).toEqual({ ok: false, noop: true, reason: "bad-url" });
      expect(cfg.set).not.toHaveBeenCalled();
    },
  );

  it("写盘抛错 ⇒ 异常上抛（⛔ 不回假 ok）", async () => {
    const cfg = makeConfig([]);
    cfg.set.mockRejectedValueOnce(new Error("IPC 断了"));

    await expect(runAddSource(AUTHOR_A_REPO_PAGE)).rejects.toThrow("IPC 断了");
  });

  it("配置写入面孔整个缺失 ⇒ 抛（不是静默成功）", async () => {
    Object.defineProperty(window, "linkdesk", { value: {}, configurable: true });

    await expect(runAddSource(AUTHOR_A_REPO_PAGE)).rejects.toThrow(/配置写入面不可用/);
  });
});

describe("registerMarketSourceAddCommand —— 注册面", () => {
  it("注册恰一条：id = marketplace.addSource、title = 词条原文；返回 1", async () => {
    const registerCommand = vi.fn();
    Object.defineProperty(window, "linkdesk", {
      value: { commands: { registerCommand } },
      configurable: true,
    });

    expect(registerMarketSourceAddCommand()).toBe(1);
    expect(registerCommand).toHaveBeenCalledTimes(1);
    const [id, handler, meta] = registerCommand.mock.calls[0] as [string, (a?: unknown) => Promise<unknown>, { title?: string }];
    expect(id).toBe("marketplace.addSource");
    expect(meta).toEqual({ title: "添加市场源" });

    // 注册进去的 handler 就是 runAddSource 那条路（读配置 → 回执），不是空壳
    let stored: string[] = [];
    Object.defineProperty(window, "linkdesk", {
      value: {
        commands: { registerCommand },
        configuration: {
          get: async () => stored,
          set: async (_k: string, v: unknown) => {
            stored = v as string[];
          },
        },
      },
      configurable: true,
    });
    expect(await handler(AUTHOR_A_REPO_PAGE)).toEqual({ ok: true, added: AUTHOR_A_REPO_PAGE });
  });

  it("window.linkdesk.commands 缺席 ⇒ 返回 0（不抛）", () => {
    Object.defineProperty(window, "linkdesk", { value: {}, configurable: true });

    expect(registerMarketSourceAddCommand()).toBe(0);
  });
});
