/**
 * avatarCache —— 作者头像的本地缓存（2026-11-23 用户口径）。
 *
 * 为什么不直接吃浏览器 HTTP 缓存：GitHub 头像 CDN 只给 5 分钟缓存，反复开作者坞/作者页会反复请求。
 * 用户要求：**下载一次存本地、能看清存在哪、7 天自动更新一次**；⛔ 不挂刷新按钮、⛔ 不挂目录刷新动作。
 *
 * 存储：`{pluginDataDir}/avatars/<authorId>.<真实扩展名>`
 *   - `pluginDataDir` = 壳按插件给的数据目录（`window.linkdesk.env.get("marketplace")`）；
 *     目录一旦存在，插件详情页右侧会自动出现「数据位置」，点开就是这些文件。
 *   - 扩展名跟**响应 Content-Type** 走（GitHub 头像实际是 image/jpeg），不写死 .png——
 *     文件夹里点开是哪张就是哪张，⛔ 不出现「.png 里装 JPEG」。
 *   - ⛔ 不写插件安装目录（升级会整个替换）；⛔ 不写壳的全局缓存（那是别人的域）。
 *
 * 策略：
 *   - 命中且 mtime 在 TTL（7 天）内 ⇒ 读文件 → Blob URL（零网络）；
 *   - 未命中/过期 ⇒ GET 头像直链（GitHub 回 `Access-Control-Allow-Origin: *`，可取字节）→ 按真实类型落盘 → Blob URL；
 *   - 任一环节失败（无 fs/env、断网、被墙、404）⇒ 本次登录不再重试（进程内记 failed）；
 *     过期但有旧文件时先用旧图；下次启动进程重启自然重试。
 *
 * ⛔ 不走 `api.github.com`（匿名 60 次/时、国内常被墙，且这里是 REST 配额）——
 *     `github.com/<owner>.png` 是**静态图片 CDN**，不消耗 API 额度。
 */

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 同一 authorId+url 的 Blob URL 复用（作者坞/作者页/多个卡共享一份） */
const blobCache = new Map<string, string>();
/** 本进程内拉取失败过的 key —— 本次登录不再重试（下次启动进程重启，自然重试） */
const failed = new Set<string>();

type Ld = typeof window.linkdesk;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

function ld(): Ld | undefined {
  return window.linkdesk;
}

function safeId(authorId: string): string {
  const safe = authorId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return safe || "author";
}

function mimeForFileName(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "image/png";
}

/** 取（必要时创建）插件数据目录下的 avatars 子目录；不可用返回 null */
async function avatarsDir(api: Ld): Promise<string | null> {
  if (!api?.env?.get || !api.filesystem || !api.path?.join) return null;
  try {
    const env = await api.env.get("marketplace");
    const base = env?.pluginDataDir;
    if (!base) return null;
    const dir = api.path.join(base, "avatars");
    if (!(await api.filesystem.exists(dir))) await api.filesystem.createDir(dir);
    return dir;
  } catch {
    return null;
  }
}

interface CacheHit {
  full: string;
  name: string;
  modifiedAt: number;
}

/** 按作者 id 找已缓存文件（扩展名由真实类型决定，按 `<id>.` 前缀匹配） */
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

/**
 * 解析一个作者的最终头像 src。
 * - 非 http(s)（`linkdesk://` 包内资源等）原样返回；
 * - 有缓存 ⇒ Blob URL；无/过期 ⇒ 下载落盘后 Blob URL；失败 ⇒ 旧图或原 URL。
 */
export async function resolveAvatar(authorId: string, url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return url;
  const key = `${authorId}|${url}`;
  const hit = blobCache.get(key);
  if (hit) return hit;
  /** 本进程内失败过：本次登录不再试（下次启动进程重启，自然重试） */
  if (failed.has(key)) return url;

  const api = ld();
  const dir = api ? await avatarsDir(api) : null;
  if (!api || !dir) return url;
  const id = safeId(authorId);

  const serveFile = async (cached: CacheHit): Promise<string | null> => {
    try {
      const bytes = await api.filesystem.readBinaryFile(cached.full);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeForFileName(cached.name) }));
      blobCache.set(key, blobUrl);
      return blobUrl;
    } catch {
      return null;
    }
  };

  const cached = await findCached(api, dir, id);
  if (cached && cached.modifiedAt > 0 && Date.now() - cached.modifiedAt < TTL_MS) {
    const ready = await serveFile(cached);
    if (ready) return ready;
  }

  try {
    const res = await fetch(url, { referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = (res.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase();
    const ext = EXT_BY_MIME[mime] ?? ".png";
    const full = api.path.join(dir, `${id}${ext}`);
    await api.filesystem.writeBinaryFile(full, buf);
    // 清掉同作者的其它扩展名旧文件（类型变了：jpg ↔ png）
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
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
    const prev = blobCache.get(key);
    if (prev) URL.revokeObjectURL(prev);
    blobCache.set(key, blobUrl);
    return blobUrl;
  } catch {
    failed.add(key);
    // 过期但有旧文件：先用旧图（比空着好）；完全没有 ⇒ 回落远端 URL（<img> 再失败 → 首字母）
    const stale = cached ? await serveFile(cached) : null;
    return stale ?? url;
  }
}

/** 测试用：清内存缓存（不碰磁盘） */
export function __resetAvatarCacheForTest(): void {
  blobCache.clear();
  failed.clear();
}
