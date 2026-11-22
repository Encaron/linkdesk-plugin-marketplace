/**
 * avatarCache —— 作者头像的本地缓存（2026-11-23 用户口径）。
 *
 * 为什么要有它：作者坞/作者页每次重渲染都拿远端头像 URL，GitHub 头像 CDN 只给 5 分钟缓存
 * ⇒ 反复开面板就会反复请求。用户要求：**下载一次存本地，看清存在哪，刷新时才重拉**。
 *
 * 存储：`{pluginDataDir}/avatars/<authorId>.png`
 *   - `pluginDataDir` 是壳按插件给的数据目录（`window.linkdesk.env.get("marketplace")`）；
 *     目录一旦存在，插件详情页右侧会自动出现「数据位置」，点开就是这些文件。
 *   - ⛔ 不写插件安装目录（升级会整个替换）；⛔ 不写壳的全局缓存（那是别人的域）。
 *
 * 策略：
 *   - 命中且 mtime 在 TTL（7 天）内 ⇒ 读文件 → Blob URL（零网络）；
 *   - 未命中/过期 ⇒ GET 头像直链（GitHub 回 `Access-Control-Allow-Origin: *`，可取字节）→ 落盘 → Blob URL；
 *   - 任一环节失败（无 fs/env、断网、被墙、404）⇒ 本次登录不再重试（进程内记 failed），
 *     过期但有旧文件时先用旧图；下次启动进程重启自然重试。
 *   - ⛔ 不挂刷新按钮、不挂目录刷新动作——用户明确：头像不值得专门一个刷新入口，7 天自动一次即可。
 *
 * ⛔ 不走 `api.github.com`（匿名 60 次/时、国内常被墙）——只要一张静态图。
 */

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 同一 authorId+url 的 Blob URL 复用（作者坞/作者页/多个卡共享一份） */
const blobCache = new Map<string, string>();
/** 本进程内拉取失败过的 key —— 本次登录不再重试（下次启动进程重启，自然重试） */
const failed = new Set<string>();

type Ld = typeof window.linkdesk;

function ld(): Ld | undefined {
  return window.linkdesk;
}

function fileNameOf(authorId: string): string {
  const safe = authorId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return `${safe || "author"}.png`;
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

async function freshEnough(api: Ld, dir: string, file: string): Promise<boolean> {
  try {
    const list = await api.filesystem.listDir(dir);
    const entry = list.find((e) => e.name === file);
    return !!entry?.modifiedAt && Date.now() - entry.modifiedAt < TTL_MS;
  } catch {
    return false;
  }
}

/**
 * 解析一个作者的最终头像 src。
 * - 非 http(s)（`linkdesk://` 包内资源等）原样返回；
 * - 有缓存 ⇒ Blob URL；无 ⇒ 下载落盘后 Blob URL；失败 ⇒ 原 URL。
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
  const file = fileNameOf(authorId);
  const full = api.path.join(dir, file);

  const serveFile = async (): Promise<string | null> => {
    try {
      const bytes = await api.filesystem.readBinaryFile(full);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      blobCache.set(key, blobUrl);
      return blobUrl;
    } catch {
      return null;
    }
  };

  if (await freshEnough(api, dir, file)) {
    const cached = await serveFile();
    if (cached) return cached;
  }

  try {
    const res = await fetch(url, { referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    await api.filesystem.writeBinaryFile(full, buf);
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: "image/png" }));
    const prev = blobCache.get(key);
    if (prev) URL.revokeObjectURL(prev);
    blobCache.set(key, blobUrl);
    return blobUrl;
  } catch {
    failed.add(key);
    // 过期但有旧文件：先用旧图（比空着好）；完全没有 ⇒ 回落远端 URL（<img> 再失败 → 首字母）
    const stale = await serveFile();
    return stale ?? url;
  }
}

/** 测试用：清内存缓存（不碰磁盘） */
export function __resetAvatarCacheForTest(): void {
  blobCache.clear();
  failed.clear();
}
