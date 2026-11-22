/**
 * Art 五态（批次 B1–B3/B5）——一个 stage 吃：多帧 / 生成式封面 / 封面视频 / 坏图。
 *
 * 钉住三件不可退的事：
 *   ① 卡内永远不出 `<video>`（视频只在 hero；controls 强制、⛔ autoplay/loop）；
 *   ② 生成式底纹永远垫在帧下（无图/坏图都有设计过的底，不留白块）；
 *   ③ 帧上限 3、第一帧常显、坏图只拆该帧。
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, fireEvent } from "@testing-library/react";
import type { CatalogEntry } from "../services/marketCatalog";
import { Art } from "../views/store/cards/cardParts";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k,
  }),
}));

const base = (patch: Partial<CatalogEntry>): CatalogEntry => ({
  id: "demo-plugin",
  name: "Demo Plugin",
  version: "1.0.0",
  category: "development",
  downloadUrl: "https://example.invalid/demo.linkdesk-plugin",
  ...patch,
});

const stills = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `https://example.invalid/shot-${i + 1}.png`);

describe("Art——多帧 / 生成式底纹", () => {
  it("5 张静帧 → data-frames=3、3 个 img、第一帧 is-on、lazy+不可拖", () => {
    const { container } = render(<Art entry={base({ screenshots: stills(5) })} variant="mega" />);
    const stage = container.querySelector(".marketplace-store-art")!;
    expect(stage.getAttribute("data-frames")).toBe("3");
    expect(stage.getAttribute("data-media")).toBe("image");
    const imgs = [...container.querySelectorAll<HTMLImageElement>(".marketplace-store-art-frame")];
    expect(imgs).toHaveLength(3);
    expect(imgs[0]!.className).toContain("is-on");
    expect(imgs[1]!.className).not.toContain("is-on");
    for (const img of imgs) {
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.getAttribute("draggable")).toBe("false");
    }
  });

  it("无图 → 生成式底纹（色场＋图标砖＋名字水印＋分类字）永远是主视觉", () => {
    const { container } = render(<Art entry={base({})} variant="mega" />);
    const stage = container.querySelector(".marketplace-store-art")!;
    expect(stage.getAttribute("data-media")).toBe("generated");
    expect(stage.getAttribute("data-frames")).toBe("0");
    expect(container.querySelector(".marketplace-store-art-gen")).not.toBeNull();
    expect(container.querySelector(".marketplace-store-art-genico")).not.toBeNull();
    expect(container.querySelector(".marketplace-store-art-watermark")?.textContent).toBe("Demo Plugin");
    expect(container.querySelector(".marketplace-store-art-tag")?.textContent).toContain("LinkDesk");
  });

  it("坏图只拆该帧（底纹露出，不白块不跳布局）", () => {
    const { container } = render(<Art entry={base({ screenshots: stills(2) })} variant="mega" />);
    const first = container.querySelector<HTMLImageElement>(".marketplace-store-art-frame")!;
    fireEvent.error(first);
    expect(first.isConnected).toBe(false);
    expect(container.querySelector(".marketplace-store-art-gen")).not.toBeNull();
    expect(container.querySelectorAll(".marketplace-store-art-frame")).toHaveLength(1);
  });
});

describe("Art——封面视频（B3）", () => {
  const videoEntry = base({
    screenshots: [
      { type: "video", url: "https://example.invalid/clip.mp4", poster: "https://example.invalid/poster.jpg" },
      "https://example.invalid/shot.png",
    ],
  });

  it("hero：输出 <video controls preload=metadata>，⛔ autoplay/loop，不叠静帧", () => {
    const { container } = render(<Art entry={videoEntry} variant="hero" />);
    const video = container.querySelector("video")!;
    expect(video).not.toBeNull();
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(video.hasAttribute("loop")).toBe(false);
    expect(video.getAttribute("poster")).toBe("https://example.invalid/poster.jpg");
    expect(container.querySelectorAll(".marketplace-store-art-frame")).toHaveLength(0);
    expect(container.querySelector(".marketplace-store-art-vbadge")?.textContent).toContain("作者视频");
  });

  it("卡内（mega）：不出 <video>，只给海报帧＋「含视频」", () => {
    const { container } = render(<Art entry={videoEntry} variant="mega" />);
    expect(container.querySelector("video")).toBeNull();
    const frames = [...container.querySelectorAll<HTMLImageElement>(".marketplace-store-art-frame")];
    expect(frames[0]!.getAttribute("src")).toBe("https://example.invalid/poster.jpg");
    expect(container.querySelector(".marketplace-store-art-vbadge")?.textContent).toContain("含视频");
    expect(container.querySelector(".marketplace-store-art")!.getAttribute("data-media")).toBe("video");
  });

  it("视频无海报：卡内回落到 cover/静帧，badge 仍在", () => {
    const entry = base({
      cover: "https://example.invalid/cover.png",
      screenshots: [{ type: "video", url: "https://example.invalid/clip.mp4" }, "https://example.invalid/shot.png"],
    });
    const { container } = render(<Art entry={entry} variant="mega" />);
    const first = container.querySelector<HTMLImageElement>(".marketplace-store-art-frame")!;
    expect(first.getAttribute("src")).toBe("https://example.invalid/cover.png");
    expect(container.querySelector(".marketplace-store-art-vbadge")).not.toBeNull();
  });
});

describe("Art——小卡不启用媒体（用户口径：只图标）", () => {
  const read = (f: string): string => readFileSync(join(process.cwd(), "src/views/store/cards", f), "utf8");
  it.each(["CardSmall.tsx", "CardRow.tsx", "RankRow.tsx"])("%s 不 import Art、不自读 screenshots/cover", (f) => {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(/\bArt\b/.test(src)).toBe(false);
    expect(/\bscreenshots\b/.test(src)).toBe(false);
    expect(/\.cover\b/.test(src)).toBe(false);
  });
});
