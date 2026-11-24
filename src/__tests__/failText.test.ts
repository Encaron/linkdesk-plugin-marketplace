/**
 * 失败文案的**单一实现**单测（2026-11-25）。
 *
 * 两条判据：
 *   ① 归因认得出 ⇒ 归因短语（人话），原文只作兜底；
 *   ② 兜底直显原文时，先剥掉 Electron IPC 管道前缀——`Error invoking remote method 'x': Error: y` → `y`。
 *      用户不该看到通道名（2026-11-24 实机：完整性校验失败原样甩到界面）。
 */

import { describe, expect, it } from "vitest";
import {
  classifyInstallError,
  failText,
  installFailLabelKey,
  stripIpcPrefix,
} from "../services/marketplaceShared/messages";

const t = (k: string) => `t:${k}`;
const label = (r: Parameters<typeof installFailLabelKey>[0]) => installFailLabelKey(r);

describe("stripIpcPrefix", () => {
  it("剥一层 invoke 前缀 + Error:", () => {
    expect(stripIpcPrefix("Error invoking remote method 'plugins:download': Error: 包完整性校验失败：期望 sha256 000…")).toBe(
      "包完整性校验失败：期望 sha256 000…",
    );
  });

  it("剥多层（invoke 套 invoke）与各种 Error 前缀", () => {
    expect(stripIpcPrefix("Error invoking remote method 'a': Error invoking remote method 'b': TypeError: boom")).toBe("boom");
  });

  it("不带前缀的原文原样返回（只 trim）", () => {
    expect(stripIpcPrefix("  服务器返回 404  ")).toBe("服务器返回 404");
  });

  it("空 / undefined ⇒ 空串", () => {
    expect(stripIpcPrefix(undefined)).toBe("");
    expect(stripIpcPrefix("   ")).toBe("");
  });
});

describe("failText —— 归因优先，原文兜底", () => {
  it("完整性失败（即使原文带 IPC 前缀）⇒ 人话归因", () => {
    const raw = "Error invoking remote method 'plugins:download': Error: 包完整性校验失败：期望 sha256 000…";
    expect(classifyInstallError(raw)).toBe("integrity");
    expect(failText(t, label, "integrity", raw)).toBe("t:安装失败：文件校验未通过");
  });

  it("认不出（unknown）⇒ 原文（已剥前缀），⛔ 不说「未知错误」", () => {
    const raw = "Error invoking remote method 'plugins:install': Error: 不在用户安装区";
    expect(classifyInstallError(raw)).toBe("unknown");
    expect(failText(t, label, "unknown", raw)).toBe("不在用户安装区");
  });

  it("认不出且原文为空 ⇒ 通用重试语", () => {
    expect(failText(t, label, "unknown", "")).toBe("t:安装失败，请重试");
  });
});
