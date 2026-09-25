/**
 * contribs 单测——`contributes` 四组解析（命令 / 配置项 / 键绑定 / 菜单项）（E6#151 补；此前零测试）。
 *
 * 纯函数零 IO：数据 = `list().manifest.contributes`（壳零新 API），解析口在详情页
 * `FeaturesTab.tsx`（parseContribs）与 `features-groups.tsx`（cmdIdOf）。
 * 契约 = **逐 key 收窄**：容忍缺省形状，坏项丢弃、好项照常。
 * 🔴 E6#151 修后本文件口径变了：修前 `commands` / `keybindings` 里的 **`null` 项会抛**
 * （`cmdIdOf` 直读 `c.id`——文件头「个别坏项不崩整组」当时做不到），那时**故意不写断言**
 * （固化待裁决的缺陷 = 把缺陷当正典）。修后该行为已定，遂把「空槽跳过 + 好项保留」写成断言钉住；
 * 壳侧同族修复（坏项会吃掉后续全部贡献）的断言在壳仓
 * `src/pluginLoader/contributions/contributions.badItems.test.ts`。fixture 全虚构（硬约束 21）。
 */

import { describe, it, expect } from "vitest";
import { cmdIdOf, parseContribs, type CmdItem } from "../views/detail/DetailView/contribs";

describe("cmdIdOf（命令标识取字——id 优先，command 兜底）", () => {
  it("有 id → 取 id（即使 command 也在）", () => {
    expect(cmdIdOf({ id: "demo.cmd.alpha", command: "demo.cmd.beta" })).toBe("demo.cmd.alpha");
  });

  it("无 id → 回落 command", () => {
    expect(cmdIdOf({ command: "demo.cmd.beta" })).toBe("demo.cmd.beta");
  });

  it("两者皆无 → 空串（调用方据此过滤该项）", () => {
    expect(cmdIdOf({})).toBe("");
    expect(cmdIdOf({ title: "Demo Title" } as CmdItem)).toBe("");
  });

  it("🔴 空槽入参不抛（E6#151 修后）：null / undefined → 空串，调用方照常过滤掉", () => {
    expect(cmdIdOf(null)).toBe("");
    expect(cmdIdOf(undefined)).toBe("");
  });

  it("前后空白被 trim", () => {
    expect(cmdIdOf({ id: "  demo.cmd.alpha  " })).toBe("demo.cmd.alpha");
    expect(cmdIdOf({ id: "   " })).toBe(""); // 纯空白 = 无标识
  });
});

describe("parseContribs（四组解析——有声明才出现，坏项丢弃不崩）", () => {
  it("undefined / 空对象 → 四组全空（视图据此走空态引导，不渲染组壳）", () => {
    const empty = { commands: [], configs: [], keybindings: [], menuRows: [] };
    expect(parseContribs(undefined)).toEqual(empty);
    expect(parseContribs({})).toEqual(empty);
  });

  it("各组非数组 / 形状不对 → 不崩，按空处理", () => {
    expect(parseContribs({ commands: "nope" as never, keybindings: 42 as never, menus: null as never })).toEqual({
      commands: [],
      configs: [],
      keybindings: [],
      menuRows: [],
    });
  });

  it("commands：无 id 无 command 的坏项被丢弃，好项保留", () => {
    const out = parseContribs({
      commands: [{}, { id: "demo.cmd.alpha" }, { command: "demo.cmd.beta" }, { title: "Demo Title" }] as never,
    });
    expect(out.commands.map(cmdIdOf)).toEqual(["demo.cmd.alpha", "demo.cmd.beta"]);
  });

  it("configuration.properties → [key, def] 对；无 properties / 无 configuration → 空", () => {
    const out = parseContribs({
      configuration: { properties: { "demo.setting.alpha": { description: "Demo Alpha" } } },
    });
    expect(out.configs).toEqual([["demo.setting.alpha", { description: "Demo Alpha" }]]);
    expect(parseContribs({ configuration: {} }).configs).toEqual([]);
  });

  it("keybindings：command 或 key 有其一即入列；两者皆无丢弃", () => {
    const out = parseContribs({
      keybindings: [{ key: "ctrl+demo" }, { command: "demo.cmd.beta" }, { command: "demo.cmd.gamma", key: "alt+demo" }, {}] as never,
    });
    expect(out.keybindings).toEqual([
      { key: "ctrl+demo" },
      { command: "demo.cmd.beta" },
      { command: "demo.cmd.gamma", key: "alt+demo" },
    ]);
  });

  it("menus：多菜单 × 多命令展开成 {menu, command} 行；非数组项与无 command 项丢弃", () => {
    const out = parseContribs({
      menus: {
        "demo/menu-one": [{ command: "demo.cmd.alpha" }, { title: "Demo Title" }, null],
        "demo/menu-two": [{ command: "demo.cmd.beta" }],
        "demo/menu-bad": "nope",
      } as never,
    });
    expect(out.menuRows).toEqual([
      { menu: "demo/menu-one", command: "demo.cmd.alpha" },
      { menu: "demo/menu-two", command: "demo.cmd.beta" },
    ]);
  });

  it("四组并存 → 各归其位互不串味", () => {
    const out = parseContribs({
      commands: [{ id: "demo.cmd.alpha" }],
      configuration: { properties: { "demo.setting.alpha": { description: "Demo Alpha" } } },
      keybindings: [{ key: "ctrl+demo" }],
      menus: { "demo/menu-one": [{ command: "demo.cmd.alpha" }] },
    } as never);
    expect(out.commands).toHaveLength(1);
    expect(out.configs).toHaveLength(1);
    expect(out.keybindings).toHaveLength(1);
    expect(out.menuRows).toHaveLength(1);
  });
});

describe("🔴 空槽与错形状（E6#151 修后：坏项丢弃，好项照常——详情页不崩）", () => {
  it("commands 里夹 null / undefined 空槽 → 好项保留（修前第一项就抛，整块「功能」页签渲染崩）", () => {
    const out = parseContribs({
      commands: [null, { id: "demo.cmd.alpha" }, undefined, { command: "demo.cmd.beta" }] as never,
    });
    expect(out.commands.map(cmdIdOf)).toEqual(["demo.cmd.alpha", "demo.cmd.beta"]);
  });

  it("keybindings 里夹 null / 原始值 → 好项保留（同族另一处直读）", () => {
    const out = parseContribs({ keybindings: [null, { key: "ctrl+demo" }, 7] as never });
    expect(out.keybindings).toEqual([{ key: "ctrl+demo" }]);
  });

  it("menus 写成数组 → 按空处理（不产出 \"0\"/\"1\" 这种假菜单行）", () => {
    const out = parseContribs({ menus: [{ command: "demo.cmd.alpha" }] as never });
    expect(out.menuRows).toEqual([]);
  });

  it("坏项不吃掉同组其余项，也不吃掉其余三组（一并给出）", () => {
    const out = parseContribs({
      commands: [null, { id: "demo.cmd.alpha" }],
      configuration: { properties: { "demo.setting.alpha": { description: "Demo Alpha" } } },
      keybindings: [null, { key: "ctrl+demo" }],
      menus: { "demo/menu-one": [null, { command: "demo.cmd.alpha" }] },
    } as never);
    expect(out.commands.map(cmdIdOf)).toEqual(["demo.cmd.alpha"]);
    expect(out.configs).toEqual([["demo.setting.alpha", { description: "Demo Alpha" }]]);
    expect(out.keybindings).toEqual([{ key: "ctrl+demo" }]);
    expect(out.menuRows).toEqual([{ menu: "demo/menu-one", command: "demo.cmd.alpha" }]);
  });
});
