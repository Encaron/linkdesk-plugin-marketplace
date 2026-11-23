/**
 * useDetailPackage——详情视图的「包内文件」层：README / CHANGELOG 读包 + 远端 README 兜底 + 截图画廊。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *
 * README 选择（2026-11-24）：先按应用语言从 `plugin.json readme.locales`（已装）或
 * 目录条目 `readmeLocales`（未装）选文件；缺失则回退 `readme.default` → `README.md` → 远端
 * `readmeUrl`。翻译选择是**宿主/目录数据**的事，本 hook 只按给出的路径读文件，不做翻译。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { readInstalledPackageFile } from "../../../services/packageFiles";
import { mediaOf, type MediaModel } from "../../store/cards/mediaModel";
import type { DetailIdentity } from "./useDetailIdentity";

/** 无目录条目时的空媒体模型（详情仍会渲染「加载中/未安装」空态，不画假图） */
const EMPTY_MEDIA: MediaModel = { kind: "generated", frames: [], video: null, issues: [] };

/** 远端 README 的相对媒体基址——readmeUrl（https 裸文件 URL）剥去最后一段 = 同目录基址。 */
export function remoteReadmeAssetBase(readmeUrl: string | null | undefined): string | undefined {
  if (!readmeUrl || !/^https:\/\//i.test(readmeUrl)) return undefined;
  const i = readmeUrl.lastIndexOf("/");
  return i > "https://".length ? readmeUrl.slice(0, i + 1) : undefined;
}

/** 语言选择：精确 → 主语言 → en → 声明顺序的第一份。 */
function pickLocalized(map: Record<string, string> | undefined, lang: string): string | undefined {
  if (!map) return undefined;
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  const exact = lower[lang.toLowerCase()];
  if (exact) return exact;
  const base = lang.split("-")[0].toLowerCase();
  if (lower[base]) return lower[base];
  if (lower.en) return lower.en;
  return Object.values(map)[0];
}

/** 包内文件的媒体基址：`linkdesk://<id>/<目录>/`；根文件 → `linkdesk://<id>/`。 */
function localReadmeAssetBase(pluginId: string, rel: string): string {
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
  return `linkdesk://${pluginId}/${dir}`;
}

export function useDetailPackage(id: DetailIdentity) {
  const { pluginId, installed, entry, enabledEntry } = id;
  const { i18n } = useTranslation() as { i18n?: { language?: string } };
  const lang = i18n?.language || "zh";
  const decl = (enabledEntry?.manifest as { readme?: { default?: string; locales?: Record<string, string> } } | undefined)?.readme;
  const chosenLocalPath = pickLocalized(decl?.locales, lang) ?? decl?.default ?? "README.md";

  const [pkgReadme, setPkgReadme] = useState<string | null | undefined>(undefined); // undefined=读取中
  const [pkgReadmePath, setPkgReadmePath] = useState("README.md");
  const [pkgChangelog, setPkgChangelog] = useState<string | null | undefined>(undefined);
  const [remoteReadme, setRemoteReadme] = useState<string | null | undefined>(null); // undefined=读取中 / null=无需/不可得

  useEffect(() => {
    let alive = true;
    setPkgReadme(undefined);
    setPkgChangelog(undefined);
    const id = pluginId ?? "";
    if (!id || !installed) {
      return () => {
        alive = false;
      };
    }
    const readReadme = async () => {
      const first = await readInstalledPackageFile(id, chosenLocalPath);
      if (first && first.trim()) return { text: first, path: chosenLocalPath };
      if (chosenLocalPath !== "README.md") {
        const fallback = await readInstalledPackageFile(id, "README.md");
        if (fallback && fallback.trim()) return { text: fallback, path: "README.md" };
      }
      return { text: first, path: chosenLocalPath };
    };
    void readReadme().then(({ text, path }) => {
      if (!alive) return;
      setPkgReadmePath(path);
      setPkgReadme(text);
    });
    void readInstalledPackageFile(id, "CHANGELOG.md").then((s) => {
      if (alive) setPkgChangelog(s);
    });
    return () => {
      alive = false;
    };
  }, [pluginId, installed, chosenLocalPath]);

  /* 远端 README：未装按目录 readmeLocales / readmeUrl；已装包内缺失时兜底 */
  const remoteReadmeUrl = (() => {
    const localized = pickLocalized(entry?.readmeLocales, lang);
    return localized ?? entry?.readmeUrl ?? null;
  })();
  useEffect(() => {
    let alive = true;
    const id = pluginId ?? "";
    const wantRemote = !!id && !!remoteReadmeUrl && (!installed || pkgReadme === null);
    if (!wantRemote) return;
    setRemoteReadme(undefined);
    void fetch(remoteReadmeUrl as string)
      .then(async (r) => (r.ok ? r.text() : null))
      .catch(() => null)
      .then((s) => {
        if (alive) setRemoteReadme(typeof s === "string" && s.trim() ? s : null);
      });
    return () => {
      alive = false;
    };
  }, [pluginId, installed, pkgReadme, remoteReadmeUrl]);

  const media = entry ? mediaOf(entry) : EMPTY_MEDIA;
  const localAssetBase = pluginId ? localReadmeAssetBase(pluginId, pkgReadmePath) : undefined;
  const remoteAssetBase = remoteReadmeAssetBase(remoteReadmeUrl);
  const readme: { mode: "loading" | "content" | "none"; content?: string; assetBase?: string } = (() => {
    if (installed) {
      if (pkgReadme === undefined) return { mode: "loading" };
      if (pkgReadme && pkgReadme.trim()) return { mode: "content", content: pkgReadme, assetBase: localAssetBase };
      if (remoteReadmeUrl) {
        if (remoteReadme === undefined) return { mode: "loading" };
        if (remoteReadme) return { mode: "content", content: remoteReadme, assetBase: remoteAssetBase };
      }
      return { mode: "none" };
    }
    if (remoteReadmeUrl) {
      if (remoteReadme === undefined) return { mode: "loading" };
      if (remoteReadme) return { mode: "content", content: remoteReadme, assetBase: remoteAssetBase };
    }
    return { mode: "none" };
  })();

  return { pkgChangelog, media, readme };
}
