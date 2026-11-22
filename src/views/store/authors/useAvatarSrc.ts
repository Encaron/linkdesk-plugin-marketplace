/**
 * useAvatarSrc —— 作者身份的**唯一取源口**（2026-11-23 用户实机：作者卡有照片，来源行/坞胶囊却还是
 * 首字母；光环颜色又是按 authorId 哈希出来的蓝色，换头像也不变——三套来源，不归一）。
 *
 * 现在三处（作者卡 / 作者页来源行 / 作者坞胶囊）都走这里，拿到的是**同一份身份**：
 *   - `src`：远端 URL 先出，命中本地缓存后换 Blob URL（services/avatarCache.ts）；
 *   - `hue`：从**头像图**里取的主色（无图/取不到时调用方回落品牌色或 id 色相）；
 *   - `onError`：同一 src 只失败一次，调用方回落首字母。
 */

import { useEffect, useState } from "react";
import { resolveAvatar, resolveRepoAvatar } from "../../../services/avatarCache";

export interface AvatarSrc {
  /** 可直接给 <img src> 的地址（Blob 或远端）；null = 画首字母 */
  src: string | null;
  /** 图片主色（#rrggbb）——光环/底纹/边框跟它走 */
  hue?: string;
  onError: () => void;
}

export function useAvatarSrc(authorId: string, avatar: string | undefined): AvatarSrc {
  const [src, setSrc] = useState<string | null>(avatar ?? null);
  const [hue, setHue] = useState<string | undefined>(undefined);
  const [broken, setBroken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!avatar) {
      setSrc(null);
      setHue(undefined);
      return;
    }
    setSrc(avatar);
    setHue(undefined);
    void resolveAvatar(authorId, avatar).then((resolved) => {
      if (!alive) return;
      setSrc(resolved.src);
      setHue(resolved.hue);
    });
    return () => {
      alive = false;
    };
  }, [authorId, avatar]);

  const visible = src && broken !== src ? src : null;
  return { src: visible, hue: visible ? hue : undefined, onError: () => setBroken(src ?? null) };
}

/** 仓库头像（`repos[].image`）——与作者头像同一套取源/缓存，目录另起 `repo-avatars/<authorId>/`。 */
export function useRepoAvatarSrc(authorId: string, repoId: string, image: string | undefined): AvatarSrc {
  const [src, setSrc] = useState<string | null>(image ?? null);
  const [hue, setHue] = useState<string | undefined>(undefined);
  const [broken, setBroken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!image) {
      setSrc(null);
      setHue(undefined);
      return;
    }
    setSrc(image);
    setHue(undefined);
    void resolveRepoAvatar(authorId, repoId, image).then((resolved) => {
      if (!alive) return;
      setSrc(resolved.src);
      setHue(resolved.hue);
    });
    return () => {
      alive = false;
    };
  }, [authorId, repoId, image]);

  const visible = src && broken !== src ? src : null;
  return { src: visible, hue: visible ? hue : undefined, onError: () => setBroken(src ?? null) };
}
