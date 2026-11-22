/**
 * avatarCache —— 作者头像 + 主色的本地缓存（2026-11-23 用户实机：颜色不能再按 authorId 哈希，
 * 换头像后光环仍旧是蓝色；同一个作者的头像/颜色/名字必须同源）。
 *
 * 存储：`{pluginDataDir}/avatars/<authorId>.<真实扩展名>`
 *   - `pluginDataDir` = 壳按插件给的数据目录（`window.linkdesk.env.get("marketplace")`）；
 *     目录一旦存在，插件详情页右侧会自动出现「数据位置」。
 *   - 扩展名跟响应 Content-Type 走（GitHub 头像实际是 image/jpeg）。
 *   - ⛔ 不写插件安装目录（升级会整个替换）。
 *
 * 主色：图片落盘/读回后，缩到 24×24 取「加权平均色」（权重＝饱和度，跳过过暗/过亮/半透明像素），
 *   再把饱和度拉回 1.35 倍——这样光环/底纹/边框取的是**图里的颜色**，灰扑扑的图也不会脏。
 *
 * 策略（用户拍板）：
 *   - 7 天 TTL，自动更新；⛔ 不挂刷新按钮/刷新动作；成功失败都不提示；
 *   - 失败本次登录不再试（进程内记 failed），过期时先用旧图；下次启动再试；
 *   - ⛔ 不走 `api.github.com`（REST 匿名额度），头像走 `github.com/<owner>.png` 静态 CDN。
 */

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResolvedAvatar {
  /** 可直接给 <img src>：Blob URL（本地缓存）或远端 URL（降级） */
  src: string;
  /** 图片主色（#rrggbb）。取不到（降级/灰图/无图）时不带 */
  hue?: string;
}

/** 同一 authorId+url 的结果复用（作者坞/作者页/多个卡共享一份） */
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
      const weight = 0.25 + sat; // 鲜艳像素权重大 ⇒ 不会让白底/黑底主导
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
 * 解析一个作者的头像与主色。
 * - 非 http(s)（`linkdesk://` 包内资源等）原样返回、无主色；
 * - 有缓存 ⇒ Blob URL + 主色；无/过期 ⇒ 下载落盘后 Blob URL + 主色；失败 ⇒ 旧图或原 URL。
 */
export async function resolveAvatar(authorId: string, url: string): Promise<ResolvedAvatar> {
  if (!/^https?:\/\//i.test(url)) return { src: url };
  const key = `${authorId}|${url}`;
  const hit = memo.get(key);
  if (hit) return hit;
  if (failed.has(key)) return { src: url };

  const api = ld();
  const dir = api ? await avatarsDir(api) : null;
  if (!api || !dir) return { src: url };
  const id = safeId(authorId);

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

/** 测试用：清内存缓存（不碰磁盘） */
export function __resetAvatarCacheForTest(): void {
  memo.clear();
  failed.clear();
}
