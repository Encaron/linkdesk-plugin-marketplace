/**
 * useCompatReading——详情页兼容读数的取数 hook（E6#118）。
 *
 * 🔴 **只消费、不复算**：状态由宿主单点算出（壳 `src/core/compat/compatibility.ts`，E6#117），
 * 本插件只调 `plugins.getCompatibility` 这一个入口并把读数画出来（用户面五词 = [00 §〇d] 定稿）。
 *
 * ⚠️ 类型本地声明：本仓 `@linkdesk/contracts` 为 npm 0.1.15，尚未含新面的类型（E6#117 的 contracts
 * 发版等用户点头）——此处按 wire 形状本地声明 + 受控收窄访问；契约包升版后可替换为 import type。
 * ⛔ 读数里的 `unknown[]`（机器码诊断面）与 `dangling.names`（作者面词）不许上屏。
 */

import { useEffect, useState } from "react";
import type { CatalogEntry } from "../../services/marketCatalog";

/** 兼容读数 wire 形状（与壳 `PluginCompatibilityReading` 同形——见文件头注） */
export interface CompatReading {
  pluginId: string;
  state: "current" | "compatible" | "drifted" | "incompatible" | "unknown";
  dangling: { count: number; names: string[] } | null;
  minAppVersion: string | null;
  shellVersion: string;
  minAppSatisfied: boolean | null;
  lastUpdate: string | null;
  shellBuiltAt: string | null;
  unknown: string[];
}

/** 受控收窄——契约包类型跟上之前的过渡访问面（面 optional：旧壳没有 ⇒ undefined ⇒ 显示「—」） */
function fetchCompat(pluginId: string, minApp: string | null, publishedAt: string | null): Promise<CompatReading> | undefined {
  const plugins = window.linkdesk?.plugins as
    | { getCompatibility?: (req: { pluginId: string; minAppVersion?: string | null; publishedAt?: string | null }) => Promise<CompatReading> }
    | undefined;
  return plugins?.getCompatibility?.({ pluginId, minAppVersion: minApp, publishedAt });
}

/** 兼容读数——面缺失/调用失败 ⇒ undefined（调用方显示「—」，⛔ 不判坏消息） */
export function useCompatReading(input: { pluginId?: string; entry?: CatalogEntry; installed: boolean }): CompatReading | undefined {
  const { pluginId, entry, installed } = input;
  const minApp = entry?.minAppVersion ?? null;
  const publishedAt = entry?.publishedAt ?? null;
  const [reading, setReading] = useState<CompatReading | undefined>(undefined);

  useEffect(() => {
    if (!pluginId) return;
    let alive = true; // 硬约束 14：活跃守卫——卸载/换插件后不回写
    fetchCompat(pluginId, minApp, publishedAt)
      ?.then((r) => {
        if (alive && r?.pluginId === pluginId) setReading(r);
      })
      .catch(() => {
        /* 读数拿不到 = 「—」，不弹错（⛔ 缺数据不许当坏消息） */
      });
    return () => {
      alive = false;
    };
  }, [pluginId, minApp, publishedAt, installed]);

  return reading;
}
