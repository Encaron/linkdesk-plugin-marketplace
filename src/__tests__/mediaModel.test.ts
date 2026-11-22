/**
 * mediaModel 单测（批次 A1）——选帧规则是卡片/详情/hero 的共同地基：
 * 这里钉住「海报→cover→静帧、去重、上限 3、坏 URL 只降级」五条，防止各卡型各写一份。
 */

import { describe, expect, it } from "vitest";
import { MEDIA_MAX_FRAMES, frameCountOf, isHttpsUrl, mediaOf } from "../views/store/cards/mediaModel";

const A = "https://cdn.example.invalid/a.png";
const B = "https://cdn.example.invalid/b.png";
const C = "https://cdn.example.invalid/c.png";
const D = "https://cdn.example.invalid/d.png";
const E = "https://cdn.example.invalid/e.png";
const POSTER = "https://cdn.example.invalid/poster.jpg";
const VIDEO = { type: "video" as const, url: "https://cdn.example.invalid/clip.mp4", poster: POSTER };

describe("mediaOf——选帧（唯一入口）", () => {
  it("仅视频：kind=video，海报当封面帧", () => {
    const m = mediaOf({ screenshots: [VIDEO] });
    expect(m.kind).toBe("video");
    expect(m.video).toEqual({ url: VIDEO.url, poster: POSTER });
    expect(m.frames).toEqual([POSTER]);
    expect(frameCountOf(m)).toBe(1);
    expect(m.issues).toEqual([]);
  });

  it("视频无海报：kind=video，封面帧回落到 cover → 静帧", () => {
    const m = mediaOf({ screenshots: [{ type: "video", url: VIDEO.url }, A], cover: B });
    expect(m.kind).toBe("video");
    expect(m.frames).toEqual([B, A]);
    const bare = mediaOf({ screenshots: [{ type: "video", url: VIDEO.url }] });
    expect(bare.kind).toBe("video");
    expect(bare.frames).toEqual([]);
  });

  it("只有 cover：kind=image，cover 即封面帧", () => {
    const m = mediaOf({ cover: A });
    expect(m.kind).toBe("image");
    expect(m.frames).toEqual([A]);
  });

  it("5 张静帧 → 上限 3 帧（MEDIA_MAX_FRAMES）", () => {
    const m = mediaOf({ screenshots: [A, B, C, D, E] });
    expect(MEDIA_MAX_FRAMES).toBe(3);
    expect(m.frames).toEqual([A, B, C]);
    expect(m.kind).toBe("image");
  });

  it("全空：kind=generated（生成式封面，不是空白）", () => {
    expect(mediaOf({}).kind).toBe("generated");
    expect(mediaOf({ screenshots: [] }).kind).toBe("generated");
    expect(mediaOf({ screenshots: [] }).frames).toEqual([]);
  });

  it("去重：视频海报 = cover = 首张静帧 只留一帧", () => {
    const m = mediaOf({ screenshots: [VIDEO, POSTER, A], cover: POSTER });
    expect(m.frames).toEqual([POSTER, A]);
  });

  it("相对 URL：不参与渲染，记 relative-url（未装用户必 404）", () => {
    const m = mediaOf({ screenshots: ["resources/shot-1.png", A], cover: "cover.png" });
    expect(m.frames).toEqual([A]);
    expect(m.issues).toEqual([
      { code: "relative-url", field: "screenshots[0]", value: "resources/shot-1.png" },
      { code: "relative-url", field: "cover", value: "cover.png" },
    ]);
  });

  it("http 明文：记 insecure-url，不参与渲染（绝对 URL 也必须是 https）", () => {
    expect(isHttpsUrl("http://cdn.example.invalid/a.png")).toBe(false);
    const m = mediaOf({ screenshots: ["http://cdn.example.invalid/a.png"] });
    expect(m.kind).toBe("generated");
    expect(m.issues[0]).toMatchObject({ code: "insecure-url", field: "screenshots[0]" });
  });

  it("坏视频对象/非视频对象：跳过，不崩", () => {
    const m = mediaOf({
      screenshots: [
        { type: "image", url: A } as unknown as string,
        null as unknown as string,
        { type: "video", url: "relative.mp4" },
        B,
      ],
    });
    expect(m.video).toBeNull();
    expect(m.frames).toEqual([B]);
    expect(m.issues.map((i) => i.field)).toEqual(["screenshots[2].url"]);
  });
});
