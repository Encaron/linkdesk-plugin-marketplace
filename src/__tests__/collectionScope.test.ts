/**
 * collectionScope —— 官方首页策展位只吃官方目录（09 §三·补3）。
 * 钉：作者源合集（official 缺省/false）不进官方首页；作者店仍从全量目录引用。
 */

import { describe, it, expect } from "vitest";
import { officialCollections } from "../services/marketCatalog";

const c = (id: string, official?: boolean) => ({
  id,
  title: id,
  items: [],
  ...(official !== undefined ? { official } : {}),
});

describe("officialCollections", () => {
  it("只保留 official === true 的合集", () => {
    expect(officialCollections([c("official", true), c("author"), c("author-false", false)])).toEqual([
      c("official", true),
    ]);
  });
});
