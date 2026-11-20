/**
 * licensesView — 壳权益表的**只读展示投影**（R4-3.2 statusTag 的 license 数据源；棒 10 付费流复用）。
 *
 * 责任边界（05 §三·4）：本模块**只读** `licenses.list()`——权益的写入/验签/删除全在壳（棒 2 已落）。
 * 市场只拿它渲染「已购/临期/过期」状态；⛔ 不在插件侧做任何付费裁决。
 *
 * 跨表面：权益是壳侧事实，各表面各自读一次即可（读的是同一份 licenses.json）；棒 10 验签成功后
 * 调 `refresh()` 收敛。缺面（旧壳/预览）→ 空表 = 无权益（不是「免费」，付费条目会按未购渲染）。
 */

import { useCallback, useEffect, useState } from "react";
import { licensesApi, type LicenseEntitlementView } from "./hostApi";

export interface LicenseMapState {
  map: ReadonlyMap<string, LicenseEntitlementView>;
  refresh: () => void;
}

export function useLicenseEntitlements(): LicenseMapState {
  const [map, setMap] = useState<ReadonlyMap<string, LicenseEntitlementView>>(new Map());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const api = licensesApi();
    if (!api) return;
    api
      .list()
      .then((rows) => {
        if (!alive) return;
        const next = new Map<string, LicenseEntitlementView>();
        for (const row of rows ?? []) {
          if (row && typeof row.pluginId === "string") next.set(row.pluginId, row);
        }
        setMap(next);
      })
      .catch(() => {
        /* 读失败 = 无权益展示；不造假、不阻塞浏览 */
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { map, refresh };
}
