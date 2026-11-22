/**
 * uiPrefs —— UI 偏好唯一读写口（06 §八 · R4-2.4 I9）。
 *
 * 钉：① 六个键的缺省回落（坏值/缺字段逐个回落，⛔ 炸 UI）② 合并写 + 幂等（无变化不落盘）
 * ③ setViewPrefs 的 page/view/sort 校验与回执 ④ 持久面缺失 = 抛（⛔ 假成功）。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  DEFAULT_UI_PREFS,
  __resetUIPrefsState,
  __setPrefsStore,
  normalizeUIPrefs,
  readUIPrefs,
  setViewPrefs,
  writeUIPrefs,
} from "../services/marketplaceShared/uiPrefs";
import { __resetRealmSlots } from "../services/realmSlot";

function makeStore(initial?: unknown) {
  let stored = initial;
  const get = vi.fn(async () => stored);
  const set = vi.fn(async (_key: string, v: unknown) => {
    stored = v;
  });
  return { get, set, stored: () => stored };
}

afterEach(() => {
  __setPrefsStore(null);
  __resetUIPrefsState();
  __resetRealmSlots();
  Reflect.deleteProperty(window, "linkdesk");
});

describe("normalizeUIPrefs —— 缺省回落", () => {
  it("空/坏值 ⇒ 全默认（库详细、分类/作者平铺、排序蓝图缺省）", () => {
    expect(normalizeUIPrefs(undefined)).toEqual(DEFAULT_UI_PREFS);
    expect(normalizeUIPrefs(null)).toEqual(DEFAULT_UI_PREFS);
    expect(normalizeUIPrefs("nope")).toEqual(DEFAULT_UI_PREFS);
    expect(DEFAULT_UI_PREFS).toEqual({
      libView: "list",
      libSort: "name",
      authorView: "grid",
      authorSort: "name",
      catView: "grid",
      catSort: "dl",
      authorTipDismissed: false,
      dockTipDismissed: false,
      authorMode: "browse",
    });
  });

  it("逐键校验：合法保留、非法回落（不整份丢弃）", () => {
    expect(
      normalizeUIPrefs({ libView: "grid", libSort: "bogus", authorView: "list", catSort: "az" }),
    ).toEqual({
      libView: "grid",
      libSort: "name",
      authorView: "list",
      authorSort: "name",
      catView: "grid",
      catSort: "az",
      authorTipDismissed: false,
      dockTipDismissed: false,
      authorMode: "browse",
    });
  });

  it("作者页模式：合法保留（manage），坏值回落 browse", () => {
    expect(normalizeUIPrefs({ authorMode: "manage" }).authorMode).toBe("manage");
    expect(normalizeUIPrefs({ authorMode: "bogus" }).authorMode).toBe("browse");
  });
});

describe("read / write —— 持久化与幂等", () => {
  it("读：store 里的值归一化返回", async () => {
    const s = makeStore({ libView: "grid", catSort: "upd" });
    __setPrefsStore(s);
    expect(await readUIPrefs()).toEqual({ ...DEFAULT_UI_PREFS, libView: "grid", catSort: "upd" });
  });

  it("写：合并只改传入键，并落盘完整六键", async () => {
    const s = makeStore(undefined);
    __setPrefsStore(s);
    const next = await writeUIPrefs({ libView: "grid", libSort: "updated" });
    expect(next).toEqual({ ...DEFAULT_UI_PREFS, libView: "grid", libSort: "updated" });
    expect(s.set).toHaveBeenCalledWith("ui.prefs", next);
  });

  it("幂等：同值再写零落盘", async () => {
    const s = makeStore(undefined);
    __setPrefsStore(s);
    await writeUIPrefs({ libView: "grid" });
    const calls = s.set.mock.calls.length;
    await writeUIPrefs({ libView: "grid" });
    expect(s.set.mock.calls.length).toBe(calls);
  });

  it("持久面缺失 ⇒ 写抛（⛔ 假成功）", async () => {
    __setPrefsStore(null);
    Object.defineProperty(window, "linkdesk", { value: {}, configurable: true });
    await expect(writeUIPrefs({ libView: "grid" })).rejects.toThrow(/pluginState 不可用/);
  });
});

describe("setViewPrefs —— 命令落点", () => {
  it("page=lib 写 libView/libSort", async () => {
    const s = makeStore(undefined);
    __setPrefsStore(s);
    const r = await setViewPrefs("lib", { view: "grid", sort: "size" });
    expect(r.ok).toBe(true);
    expect(s.stored()).toMatchObject({ libView: "grid", libSort: "size" });
  });

  it("三页各自的 sort 取值域互不串用（cat 不认 name、author 不认 dl）", async () => {
    const s = makeStore(undefined);
    __setPrefsStore(s);
    expect(await setViewPrefs("cat", { sort: "name" })).toEqual({ ok: false, reason: "bad-sort" });
    expect(await setViewPrefs("author", { sort: "dl" })).toEqual({ ok: false, reason: "bad-sort" });
    expect(await setViewPrefs("cat", { sort: "az" })).toMatchObject({ ok: true });
    expect(await setViewPrefs("author", { sort: "repos" })).toMatchObject({ ok: true });
  });

  it("坏 page / 坏 view ⇒ 拒绝且零落盘", async () => {
    const s = makeStore(undefined);
    __setPrefsStore(s);
    expect(await setViewPrefs("home", { view: "grid" })).toEqual({ ok: false, reason: "bad-page" });
    expect(await setViewPrefs("lib", { view: "mega" })).toEqual({ ok: false, reason: "bad-view" });
    expect(s.set).not.toHaveBeenCalled();
  });

  it("只给 page（无 view/sort）= 幂等 no-op", async () => {
    const s = makeStore(undefined);
    __setPrefsStore(s);
    expect(await setViewPrefs("lib", {})).toEqual({ ok: true });
    expect(s.set).not.toHaveBeenCalled();
  });
});
