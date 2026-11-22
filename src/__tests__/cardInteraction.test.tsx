/**
 * 卡片交互/可达性守卫（批次 A8；C 批新卡沿用同一组断言）。
 *
 * 钉住三件历史 bug 的防线：
 *   ① 点动作钮**不冒泡**到整卡（「点安装却跳详情」）；
 *   ② 卡可 Tab 到、Enter 开详情（键盘可完成主路径）；
 *   ③ 卡内不出 `<video>`（视频只在 hero/详情；⛔ autoplay 抢焦点）。
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { CatalogEntry } from "../services/marketCatalog";
import type { StoreCardContext, StoreCardHandlers } from "../views/store/cards/cardParts";
import { CardDuo } from "../views/store/cards/CardDuo";
import { CardGrid } from "../views/store/cards/CardGrid";
import { CardMega } from "../views/store/cards/CardMega";
import { CardWall } from "../views/store/cards/variants/CardWall";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? k.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(o[n] ?? "")) : k,
  }),
}));

const ENTRY: CatalogEntry = {
  id: "demo-plugin",
  name: "Demo Plugin",
  version: "1.0.0",
  description: "Demo description",
  author: { name: "Demo Author" },
  downloadUrl: "https://example.invalid/demo.linkdesk-plugin",
  screenshots: [
    { type: "video", url: "https://example.invalid/clip.mp4", poster: "https://example.invalid/poster.jpg" },
    "https://example.invalid/shot.png",
  ],
  cover: "https://example.invalid/cover.png",
};

const CTX: StoreCardContext = { state: "install", online: true, dl: 42 };
const handlers = (): StoreCardHandlers => ({ onOpen: vi.fn(), onAct: vi.fn() });

const CASES: Array<[string, (h: StoreCardHandlers) => ReactElement]> = [
  ["CardGrid", (h) => <CardGrid entry={ENTRY} ctx={CTX} handlers={h} />],
  ["CardMega", (h) => <CardMega entry={ENTRY} ctx={CTX} handlers={h} />],
  ["CardDuo", (h) => <CardDuo entry={ENTRY} ctx={CTX} handlers={h} tag="编辑精选" />],
  ["CardWall", (h) => <CardWall entry={ENTRY} ctx={CTX} handlers={h} />],
];

describe.each(CASES)("%s——动作不冒泡 / 键盘可达 / 卡内无 video", (_name, make) => {
  it("点「安装」→ onAct，不触发 onOpen（点安装不跳详情）", () => {
    const h = handlers();
    const { container } = render(make(h));
    fireEvent.click(screen.getByText("安装"));
    expect(h.onAct).toHaveBeenCalledWith(ENTRY, "install");
    expect(h.onOpen).not.toHaveBeenCalled();
    expect(container.querySelector("video")).toBeNull();
  });

  it("整卡 Enter → onOpen（键盘可完成主路径）", () => {
    const h = handlers();
    render(make(h));
    const card = screen.getByRole("button", { name: "Demo Plugin——查看详情" });
    expect(card.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(h.onOpen).toHaveBeenCalledWith(ENTRY);
  });
});
