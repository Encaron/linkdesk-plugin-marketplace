/**
 * collectionLayout —— 合集 layout 唯一判定单测。
 * 钉：作者 section 覆盖 > 合集声明 > 缺省 strip；banner 原样返回（由渲染器跳过，Hero 槽消费）。
 */

import { describe, it, expect } from "vitest";
import { collectionLayoutOf } from "../views/store/collectionLayout";

describe("collectionLayoutOf", () => {
  it("section 覆盖 > 合集声明 > 缺省 strip", () => {
    expect(collectionLayoutOf({ layout: "grid" })).toBe("grid");
    expect(collectionLayoutOf({ layout: "grid" }, { layout: "mega" })).toBe("mega");
    expect(collectionLayoutOf({})).toBe("strip");
    expect(collectionLayoutOf({ layout: "duo" }, { layout: "small" })).toBe("small");
    expect(collectionLayoutOf({ layout: "banner" })).toBe("banner");
    expect(collectionLayoutOf({ layout: "split" })).toBe("split");
    expect(collectionLayoutOf({ layout: "wall" })).toBe("wall");
    expect(collectionLayoutOf({ layout: "grid" }, { layout: "wall" })).toBe("wall");
  });
});
