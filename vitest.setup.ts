// Shared test ground: the minimal `window.linkdesk` mock ships with the SDK (`@linkdesk/plugin-sdk/vitest-setup`).
// One line on purpose — plugin-specific stubs belong in your own test files (`vi.fn()`), not in here.
import "@linkdesk/plugin-sdk/vitest-setup";
import { beforeEach } from "vitest";
import { __resetRealmSlots } from "./src/services/realmSlot";

/* 跨表面共享槽按 realm 活（globalThis），**不随 `vi.resetModules()` 复位**——模块单例时代「每例取全新
 * 模块实例 = 状态全新」的等价物，现在必须显式清（2026-09-30 多表面塌缩修复；见 services/realmSlot.ts 头注）。 */
beforeEach(() => {
  __resetRealmSlots();
});
