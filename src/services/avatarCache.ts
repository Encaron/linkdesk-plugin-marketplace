/**
 * avatarCache —— 作者头像 / 仓库头像 + 主色的本地缓存（2026-11-23 用户口径）。
 *
 * 两种资源、两个目录（⛔ 不平铺；以后添别的缓存也各有子目录）：
 *   `{pluginDataDir}/avatars/<authorId>.<ext>`              作者头像
 *   `{pluginDataDir}/repo-avatars/<authorId>/<repoId>.<ext>` 仓库头像
 *
 * `pluginDataDir` = 壳按插件给的数据目录（`window.linkdesk.env.get("marketplace")`）；
 * 目录一旦存在，插件详情页右侧会自动出现「数据位置」。
 * 扩展名跟响应 Content-Type 走（GitHub 头像实际是 image/jpeg）；⛔ 不写插件安装目录。
 *
 * 主色：图片落盘/读回后缩到 24×24 取「饱和度加权平均色」，再把饱和度拉回 1.35 倍——
 * 光环/底纹/边框取的是图里的颜色，灰图也不会脏。
 *
 * 策略（用户拍板）：
 *   - 7 天 TTL，自动更新；⛔ 不挂刷新按钮/刷新动作；成功失败都不提示；
 *   - 失败本次登录不再试（进程内记 failed），过期时先用旧图；下次启动再试；
 *   - 源被删 ⇒ 该作者的两种缓存一起删（`pruneAuthorCache` / `sweepAvatarCache`）；
 *   - ⛔ 不走 `api.github.com`（REST 匿名额度），头像走静态 CDN。
 */

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResolvedAvatar {
  /** 可直接给 <img src>：Blob URL（本地缓存）或远端 URL（降级） */
  src: string;
  /** 图片主色（#rrggbb）。取不到（降级/灰图/无图）时不带 */
  hue?: string;
}

/** 结果复用（作者坞/作者页/多个卡共享一份） */
const memo = new Map<string, ResolvedAvatar>();
/** 本进程内拉取失败过的 key —— 本次登录不再重试（下次启动进程重启，自然重试） */
const failed = new Set<string>();

type Ld = typeof window.linkdesk;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
};

function ld(): Ld | undefined {
  return window.linkdesk;
}

function safeId(raw: string): string {
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return safe || "item";
}

function mimeForFileName(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".bmp") return "image/bmp";
  return "image/png";
}

/** 从图片字节取主色——缩到 24×24，饱和度加权平均，再拉饱和。失败返回 undefined（不阻塞头像）。 */
async function dominantHue(bytes: Uint8Array, mime: string): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
    const n = 24;
    const canvas = document.createElement("canvas");
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(bmp, 0, 0, n, n);
    const { data } = ctx.getImageData(0, 0, n, n);
    let r = 0;
    let g = 0;
    let b = 0;
    let w = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 160) continue;
      const R = data[i];
      const G = data[i + 1];
      const B = data[i + 2];
      const max = Math.max(R, G, B);
      const min = Math.min(R, G, B);
      const lum = (R + G + B) / 3;
      if (lum < 30 || lum > 235) continue;
      const sat = max === 0 ? 0 : (max - min) / max;
      const weight = 0.25 + sat;
      r += R * weight;
      g += G * weight;
      b += B * weight;
      w += weight;
    }
    if (!w) return undefined;
    const gray = (r + g + b) / (3 * w);
    const lift = (v: number) => Math.max(0, Math.min(255, Math.round(gray + (v / w - gray) * 1.35)));
    return `#${[lift(r), lift(g), lift(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return undefined;
  }
}

/** 插件**缓存**目录（不存在则创建）——2026-11-24（D11/M4）：头像缓存应可清理，落 pluginCacheDir。
 *  旧缓存曾落 pluginDataDir（永久区）——首次读时一次性迁到 cache 区（标记文件防重复）。 */
async function dataDir(api: Ld): Promise<string | null> {
  if (!api?.env?.get || !api.filesystem || !api.path?.join) return null;
  try {
    const env = await api.env.get("marketplace");
    const base = env?.pluginCacheDir ?? env?.pluginDataDir;
    if (!base) return null;
    if (!(await api.filesystem.exists(base))) await api.filesystem.createDir(base);
    await migrateLegacyAvatarCache(api, env?.pluginDataDir, base);
    return base;
  } catch {
    return null;
  }
}

/** 头像缓存子目录（迁移范围——不搬 pluginDataDir 里的其它数据） */
const AVATAR_CACHE_SUBDIRS = ["avatars", "repo-avatars"] as const;

async function copyCacheTree(api: Ld, from: string, to: string): Promise<void> {
  if (!api.path?.join || !api.filesystem) return;
  const list = await api.filesystem.listDir(from).catch(() => []);
  if (!(await ensureDir(api, to))) return;
  for (const e of list) {
    const src = api.path.join(from, e.name);
    const dst = api.path.join(to, e.name);
    if (e.isDirectory) { await copyCacheTree(api, src, dst); continue; }
    try {
      const bytes = await api.filesystem.readBinaryFile(src);
      await api.filesystem.writeBinaryFile(dst, bytes);
    } catch { /* 单文件失败不阻断 */ }
  }
}

/** D11 一次性迁移：pluginDataDir 的旧头像缓存 → pluginCacheDir（目标标记文件存在则跳过） */
async function migrateLegacyAvatarCache(api: Ld, legacyBase: string | undefined, cacheBase: string): Promise<void> {
  if (!legacyBase || legacyBase === cacheBase || !api.path?.join) return;
  const marker = api.path.join(cacheBase, ".avatar-cache-migrated");
  try { if (await api.filesystem?.exists(marker)) return; } catch { return; }
  for (const sub of AVATAR_CACHE_SUBDIRS) {
    try { await copyCacheTree(api, api.path.join(legacyBase, sub), api.path.join(cacheBase, sub)); } catch { /* 子目录缺省 = 无旧缓存 */ }
  }
  try { await api.filesystem?.writeTextFile(marker, "1"); } catch { /* 标记失败下次重试 */ }
}
}

async function ensureDir(api: Ld, dir: string): Promise<boolean> {
  try {
    if (!(await api.filesystem.exists(dir))) await api.filesystem.createDir(dir);
    return true;
  } catch {
    return false;
  }
}

interface CacheHit {
  full: string;
  name: string;
  modifiedAt: number;
}

async function findCached(api: Ld, dir: string, id: string): Promise<CacheHit | null> {
  try {
    const list = await api.filesystem.listDir(dir);
    const entry = list.find((e) => e.name.startsWith(`${id}.`));
    if (!entry) return null;
    return { full: api.path.join(dir, entry.name), name: entry.name, modifiedAt: entry.modifiedAt ?? 0 };
  } catch {
    return null;
  }
}

/** 通用解析：给定目标目录与文件名前缀，返回 Blob URL + 主色 */
async function resolveInto(
  key: string,
  api: Ld,
  dir: string,
  id: string,
  url: string,
): Promise<ResolvedAvatar> {
  const fromBytes = async (bytes: Uint8Array, mime: string): Promise<ResolvedAvatar> => {
    const src = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const hue = await dominantHue(bytes, mime);
    return { src, ...(hue ? { hue } : {}) };
  };

  const cached = await findCached(api, dir, id);
  if (cached && cached.modifiedAt > 0 && Date.now() - cached.modifiedAt < TTL_MS) {
    try {
      const bytes = await api.filesystem.readBinaryFile(cached.full);
      const out = await fromBytes(bytes, mimeForFileName(cached.name));
      memo.set(key, out);
      return out;
    } catch {
      /* 读失败 ⇒ 走网络重拉 */
    }
  }

  try {
    const res = await fetch(url, { referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = (res.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase();
    const ext = EXT_BY_MIME[mime] ?? ".png";
    const full = api.path.join(dir, `${id}${ext}`);
    await api.filesystem.writeBinaryFile(full, buf);
    try {
      const list = await api.filesystem.listDir(dir);
      for (const e of list) {
        if (e.name.startsWith(`${id}.`) && e.name !== `${id}${ext}`) {
          await api.filesystem.remove(api.path.join(dir, e.name));
        }
      }
    } catch {
      /* 清理失败不影响本次结果 */
    }
    const out = await fromBytes(buf, mime);
    memo.set(key, out);
    return out;
  } catch {
    failed.add(key);
    if (cached) {
      try {
        const bytes = await api.filesystem.readBinaryFile(cached.full);
        const out = await fromBytes(bytes, mimeForFileName(cached.name));
        memo.set(key, out);
        return out;
      } catch {
        /* 旧图也读不出 ⇒ 回落远端 */
      }
    }
    return { src: url };
  }
}

/** 作者头像：`avatars/<authorId>.<ext>` */
export async function resolveAvatar(authorId: string, url: string): Promise<ResolvedAvatar> {
  if (!/^https?:\/\//i.test(url)) return { src: url };
  const key = `author|${authorId}|${url}`;
  const hit = memo.get(key);
  if (hit) return hit;
  if (failed.has(key)) return { src: url };
  const api = ld();
  const base = api ? await dataDir(api) : null;
  if (!api || !base) return { src: url };
  const dir = api.path.join(base, "avatars");
  if (!(await ensureDir(api, dir))) return { src: url };
  return resolveInto(key, api, dir, safeId(authorId), url);
}

/** 仓库头像：`repo-avatars/<authorId>/<repoId>.<ext>` */
export async function resolveRepoAvatar(
  authorId: string,
  repoId: string,
  url: string,
): Promise<ResolvedAvatar> {
  if (!/^https?:\/\//i.test(url)) return { src: url };
  const key = `repo|${authorId}|${repoId}|${url}`;
  const hit = memo.get(key);
  if (hit) return hit;
  if (failed.has(key)) return { src: url };
  const api = ld();
  const base = api ? await dataDir(api) : null;
  if (!api || !base) return { src: url };
  const dir = api.path.join(base, "repo-avatars", safeId(authorId));
  if (!(await ensureDir(api, dir))) return { src: url };
  return resolveInto(key, api, dir, safeId(repoId), url);
}

/** 删掉某作者的全部缓存（作者头像 + 仓库头像目录）——删源/删作者时调用 */
export async function pruneAuthorCache(authorId: string): Promise<void> {
  const api = ld();
  const base = api ? await dataDir(api) : null;
  if (!api || !base) return;
  const id = safeId(authorId);
  try {
    const avatars = api.path.join(base, "avatars");
    const list = await api.filesystem.listDir(avatars);
    for (const e of list) {
      if (e.name.startsWith(`${id}.`)) await api.filesystem.remove(api.path.join(avatars, e.name));
    }
  } catch {
    /* 目录不存在等：忽略 */
  }
  try {
    const repoDir = api.path.join(base, "repo-avatars", id);
    if (await api.filesystem.exists(repoDir)) {
      for (const e of await api.filesystem.listDir(repoDir)) {
        await api.filesystem.remove(api.path.join(repoDir, e.name));
      }
      await api.filesystem.remove(repoDir);
    }
  } catch {
    /* 忽略 */
  }
}

/**
 * 清扫：只保留 `validAuthorIds` 里的作者缓存（作者头像 + 仓库头像目录）。
 * 刷新目录 / 删源后调用——「用户删掉的作者，缓存跟着删」。
 */
export async function sweepAvatarCache(validAuthorIds: Iterable<string>): Promise<void> {
  const api = ld();
  const base = api ? await dataDir(api) : null;
  if (!api || !base) return;
  const valid = new Set([...validAuthorIds].map((id) => safeId(id).toLowerCase()));
  try {
    const avatars = api.path.join(base, "avatars");
    for (const e of await api.filesystem.listDir(avatars)) {
      const id = e.name.slice(0, e.name.lastIndexOf(".")).toLowerCase();
      if (!valid.has(id)) await api.filesystem.remove(api.path.join(avatars, e.name));
    }
  } catch {
    /* 忽略 */
  }
  try {
    const repoRoot = api.path.join(base, "repo-avatars");
    for (const e of await api.filesystem.listDir(repoRoot)) {
      if (!e.isDirectory) continue;
      if (!valid.has(e.name.toLowerCase())) {
        for (const f of await api.filesystem.listDir(api.path.join(repoRoot, e.name))) {
          await api.filesystem.remove(api.path.join(repoRoot, e.name, f.name));
        }
        await api.filesystem.remove(api.path.join(repoRoot, e.name));
      }
    }
  } catch {
    /* 忽略 */
  }
}

/** 测试用：清内存缓存（不碰磁盘） */
export function __resetAvatarCacheForTest(): void {
  memo.clear();
  failed.clear();
}
