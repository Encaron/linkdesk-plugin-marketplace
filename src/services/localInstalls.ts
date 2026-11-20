/**
 * localInstalls —— 本地安装记录（06 §九，R4-2.5 `marketplace.addLocalPlugin` 的写点）。
 *
 * 语义边界（正典 06 §九，⛔ 越界就是第二份真相源）：
 *   - **不是已装真相源**——插件是否真的装着以壳的 `pluginManager.list()` 为准；本记录只回答
 *     「这个副本是从哪个文件夹装进来的」。
 *   - **只落本地**：`sourcePath` 是本机路径，不进目录、不上报。
 *   - 记录里的 pluginId 若已不在壳侧列表，渲染方应忽略并自清（清理由棒 8 来源页消费面做）。
 *
 * IO 沿用本仓既有模式（`installedUpdateMeta.ts` 同款）：单 key、可注入 store、读失败折空表、
 * 写失败静默（记录丢失只损失溯源信息，不破坏已装插件）。
 */

export interface LocalInstallRecord {
  pluginId: string;
  sourcePath: string;
  installedAt: number;
}

interface LocalInstallsStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const OWNER = "marketplace";
const KEY = "localInstalls";

let _store: LocalInstallsStore | null = null;
/** 测试注入 store；传 null 恢复默认（`window.linkdesk.pluginState`，owner "marketplace"） */
export function __setLocalInstallsStore(store: LocalInstallsStore | null): void {
  _store = store;
}

function store(): LocalInstallsStore | null {
  if (_store !== null) return _store;
  const ps = window.linkdesk?.pluginState;
  if (!ps) return null; // 预览环境无 pluginState——空表，不崩
  return {
    get: (k) => ps.get(OWNER, k),
    set: (k, v) => ps.set(OWNER, k, v),
  };
}

/** 读侧归一：只认完整的三字段记录（坏行静默过滤——记录不是真相源，不值得为坏行报错） */
export function normalizeLocalInstalls(raw: unknown): LocalInstallRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalInstallRecord[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Partial<LocalInstallRecord>;
    if (typeof r.pluginId !== "string" || !r.pluginId.trim()) continue;
    if (typeof r.sourcePath !== "string" || !r.sourcePath.trim()) continue;
    out.push({
      pluginId: r.pluginId.trim(),
      sourcePath: r.sourcePath,
      installedAt: typeof r.installedAt === "number" ? r.installedAt : 0,
    });
  }
  return out;
}

/** 全量读（来源页「本地安装」分组 / 库的来源筛选用——棒 8 消费） */
export async function readLocalInstalls(): Promise<LocalInstallRecord[]> {
  const s = store();
  if (!s) return [];
  try {
    return normalizeLocalInstalls(await s.get(KEY));
  } catch {
    return [];
  }
}

/** 记一条安装溯源（同 pluginId 覆盖旧记录——重装换了源文件夹时以最后一次为准） */
export async function recordLocalInstall(pluginId: string, sourcePath: string): Promise<void> {
  const s = store();
  if (!s) return;
  const records = await readLocalInstalls();
  const next = [
    ...records.filter((r) => r.pluginId !== pluginId),
    { pluginId, sourcePath, installedAt: Date.now() },
  ];
  try {
    await s.set(KEY, next);
  } catch {
    /* 写失败非致命——记录只提供溯源 */
  }
}
