/**
 * catalogRowText 单测——探索视图目录行的两个纯展示取字器（E6#151 补；此前零测试）。
 *
 * 🔴 **同名判据看不见本文件**（本层实测的假红根因，与 file-tree 同形）：`installConfirmPayload.test.ts`
 * 里也有一组 `authorLabel` / `fmtSize` 断言，但那测的是 `services/installConfirmPayload.ts` 那一份**同名函数**，
 * 与本文件不是同一段代码——名字相同、模块不同，`grep authorLabel` 命中的是假红。
 *
 * ⚠️ 本文件头注自陈的两处近似重复（本轮**只补测试、不归一**——归一会改可见文案，属行为变更）：
 *   ① `authorLabel` 与 installConfirmPayload 那份逐字相同；
 *   ② `formatSize` 与那边 `fmtSize` 口径不同——**本份 KB 恒 `toFixed(0)`**（5120 B → 「5 KB」），
 *      那边 <10240 B 时 `toFixed(1)`（「5.0 KB」）⇒ 同一体积两个面可能显示不同串。本文件的
 *      KB 取整断言正是这条现状的钉子：将来谁归一，这组断言会红，提醒两处同改。
 * fixture 全虚构（硬约束 21）：Example/Demo 作者名。
 */

import { describe, it, expect } from "vitest";
import { authorLabel, formatSize } from "../views/sidebar/ExploreView/catalogRowText";

describe("authorLabel（author 兼容 {name,url} / string 两形态——抽展示名）", () => {
  it("string 形态 → 原样；空串 → undefined", () => {
    expect(authorLabel("Example Author")).toBe("Example Author");
    expect(authorLabel("")).toBeUndefined();
  });

  it("对象形态 → 取 name；无 name → undefined（不伪显示 url）", () => {
    expect(authorLabel({ name: "Zephyr Works", url: "https://example.invalid/zephyr" })).toBe("Zephyr Works");
    expect(authorLabel({ url: "https://example.invalid/noname" })).toBeUndefined();
  });

  it("undefined / null → undefined（诚实空）", () => {
    expect(authorLabel(undefined)).toBeUndefined();
    expect(authorLabel(null as never)).toBeUndefined();
  });
});

describe("formatSize（字节 → B/KB/MB；本份 KB 恒整数）", () => {
  it("undefined → undefined（体积行不显示，不造空位）", () => {
    expect(formatSize(undefined)).toBeUndefined();
  });

  it("< 1024 → B 直显（0 也显示）", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("1024 B ~ 1 MB → KB 整数（本份 toFixed(0)：四舍五入，不是一位小数）", () => {
    expect(formatSize(1024)).toBe("1 KB");
    expect(formatSize(5120)).toBe("5 KB"); // ⚠️ fmtSize 那份这里是 "5.0 KB"
    expect(formatSize(1536)).toBe("2 KB"); // 1.5 → 进位
    expect(formatSize(1024 * 1024 - 1)).toBe("1024 KB");
  });

  it("≥ 1 MB → MB 恒一位小数", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatSize(1024 * 1024 * 1.5)).toBe("1.5 MB");
    expect(formatSize(1024 * 1024 * 12)).toBe("12.0 MB");
  });
});
