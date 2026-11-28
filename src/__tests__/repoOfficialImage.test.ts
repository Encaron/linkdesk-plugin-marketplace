/**
 * repoOfficialImage —— 官方仓头像的**内联判据**（2026-11-28 404 修复）。
 *
 * 这张图曾是发布链上的隐形缺口：只被代码按 `linkdesk://` 字符串引用 ⇒ SDK build 随包白名单
 * 够不着 ⇒ zip 里没有 ⇒ 每台安装版 404。修法 = `?raw` 构建期内联成 data URL。
 * 本测试钉住三件事（⛔ 删任何一条都会让 404 复活且无人知道）：
 *   ① 是 data URL（不再是 linkdesk:// 包内路径——包内文件已证明会被白名单丢掉）；
 *   ② 解码后是完整 svg 文档（`<svg` 开头、`</svg>` 收尾——贴 resources/ 真源）；
 *   ③ encodeURIComponent 已做（不含裸 `#`/引号——data URL 里未编码的 # 会截断 URL）。
 */
import { describe, it, expect } from "vitest";
import { repoOfficialImage } from "../services/repoOfficialImage";

describe("repoOfficialImage（官方仓头像内联）", () => {
  it("① 是 data URL，且不是 linkdesk:// 包内路径", () => {
    expect(repoOfficialImage.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(repoOfficialImage.includes("linkdesk://")).toBe(false);
  });

  it("② 解码后是完整 svg 文档（与 resources/ 真源同源）", () => {
    const svg = decodeURIComponent(repoOfficialImage.slice("data:image/svg+xml;utf8,".length));
    expect(svg.trimStart().startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("③ URL 特殊字符已编码（# 与引号不裸奔）", () => {
    expect(repoOfficialImage).not.toMatch(/utf8,[^%]*#/);
    expect(repoOfficialImage).not.toContain('"');
  });
});
