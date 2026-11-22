/**
 * useAvatarSrc —— 作者头像的**唯一取源口**（2026-11-23 用户实机：作者卡有照片，来源行/坞胶囊却还是
 * 首字母 ⇒ 三处各画各的，违反归一化）。
 *
 * 现在三处（作者卡 / 作者页来源行 / 作者坞胶囊）都走这里：
 *   - 远端 URL 先出，`resolveAvatar` 命中本地缓存后换 Blob URL（见 services/avatarCache.ts）；
 *   - 加载失败 ⇒ 返回 null，调用方画首字母（色块仍由调用方自己的 hueBG 提供）；
 *   - 同一 src 只失败一次（不反复重试同一个坏图）。
 */

import { useEffect, useState } from "react";
import { resolveAvatar } from "../../../services/avatarCache";

export interface AvatarSrc {
  /** 可直接给 <img src> 的地址（Blob 或远端）；null = 画首字母 */
  src: string | null;
  onError: () => void;
}

export function useAvatarSrc(authorId: string, avatar: string | undefined): AvatarSrc {
  const [src, setSrc] = useState<string | null>(avatar ?? null);
  const [broken, setBroken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!avatar) {
      setSrc(null);
      return;
    }
    setSrc(avatar);
    void resolveAvatar(authorId, avatar).then((resolved) => {
      if (alive) setSrc(resolved);
    });
    return () => {
      alive = false;
    };
  }, [authorId, avatar]);

  const visible = src && broken !== src ? src : null;
  return { src: visible, onError: () => setBroken(src ?? null) };
}
