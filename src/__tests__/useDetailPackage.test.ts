/**
 * useDetailPackage 的远端媒体基址纯函数单测——未装态 README 相对图修复（2026-09-30 用户报障：
 * 未装时详情页 README 图片不显，装了才显）。远端 readmeUrl 剥最后一段 = 同目录 https 基址，
 * 相对图解析成同目录直链照显；非 https / 裸 origin → 无基址（维持诚实不显）。
 * fixture 全虚构（硬约束 21）：example.com / demo-* 字面量。
 */

import { describe, it, expect } from "vitest";
import { remoteReadmeAssetBase } from "../views/detail/DetailView/useDetailPackage";

describe("remoteReadmeAssetBase", () => {
  it("raw.githubusercontent README → 同目录基址（相对图落到分支目录）", () => {
    expect(remoteReadmeAssetBase("https://raw.githubusercontent.com/demo-author/demo-repo/main/README.md")).toBe(
      "https://raw.githubusercontent.com/demo-author/demo-repo/main/",
    );
  });

  it("更深路径的裸文件 URL 同样剥最后一段", () => {
    expect(remoteReadmeAssetBase("https://example.com/docs/plugins/demo/README.md")).toBe(
      "https://example.com/docs/plugins/demo/",
    );
  });

  it("非 https（http）→ undefined（相对图不解析，结果进不了协议白名单）", () => {
    expect(remoteReadmeAssetBase("http://example.com/demo/README.md")).toBeUndefined();
  });

  it("裸 origin 无目录段 → undefined", () => {
    expect(remoteReadmeAssetBase("https://example.com")).toBeUndefined();
  });

  it("空值 → undefined", () => {
    expect(remoteReadmeAssetBase(null)).toBeUndefined();
    expect(remoteReadmeAssetBase(undefined)).toBeUndefined();
    expect(remoteReadmeAssetBase("")).toBeUndefined();
  });
});
