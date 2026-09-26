/**
 * E6#157 视图冒烟样板②——CatalogRow 探索目录行（「渲染不炸 ＋ 关键交互」样板，06④ 收窄版拍板）。
 *
 * 替身面：react-i18next 假 t（同 useInstallAction.test.ts 形状）；图标走 pickIdentityArt 缺省
 * → 默认彩色块（零远程图、零壳依赖，jsdom 可离线渲染）。作者数据（名/作者/来源）不走 t()，
 * 按原文展示——目录条目标题/作者/来源仓库名是作者数据（i18n 只翻壳文案）。
 * fixture 全虚构（硬约束 21）。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CatalogRow from "../views/sidebar/ExploreView/CatalogRow";
import type { CatalogEntry } from "../services/marketCatalog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const ENTRY: CatalogEntry = {
  id: "demo-alpha", // 虚构（硬约束 21）
  name: "Demo Alpha",
  version: "1.0.0",
  description: "演示用目录条目（虚构）",
  author: { name: "owner-two" },
  size: 2048,
  sourceName: "owner-two/catalog-b",
};

afterEach(() => cleanup());

describe("CatalogRow 冒烟（E6#157 视图样板）", () => {
  it("渲染不炸：行带名字/版本/来源标，未装态恰一个安装动作按钮", () => {
    const onOpenDetail = vi.fn();
    const onInstall = vi.fn();
    render(
      <CatalogRow entry={ENTRY} status="install" online onOpenDetail={onOpenDetail} onInstall={onInstall} />,
    );
    expect(screen.getByText("Demo Alpha")).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
    expect(screen.getByText("owner-two/catalog-b")).toBeTruthy();
    expect(screen.getByRole("button", { name: "安装" })).toBeTruthy();
  });

  it("关键交互：点行 → onOpenDetail(id, name)；点安装按钮 → onInstall(entry)", () => {
    const onOpenDetail = vi.fn();
    const onInstall = vi.fn();
    render(
      <CatalogRow entry={ENTRY} status="install" online onOpenDetail={onOpenDetail} onInstall={onInstall} />,
    );
    fireEvent.click(screen.getByText("Demo Alpha")); // 行内点击冒泡到行容器
    expect(onOpenDetail).toHaveBeenCalledWith("demo-alpha", "Demo Alpha");
    fireEvent.click(screen.getByRole("button", { name: "安装" }));
    expect(onInstall).toHaveBeenCalledWith(ENTRY);
  });
});
