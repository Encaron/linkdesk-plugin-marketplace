/**
 * fmtSize 单测——详情页信息区与安装确认卡共用的「字节 → 可读单位」。
 * 判据只钉契约（单位与舍入），⛔ 不钉实现细节。
 */
import { describe, expect, it } from "vitest";
import { fmtSize } from "../services/installConfirmPayload";

describe("fmtSize", () => {
  it("B 档：<1024 原样字节", () => {
    expect(fmtSize(0)).toBe("0 B");
    expect(fmtSize(1023)).toBe("1023 B");
  });

  it("KB 档：<10KB 保一位小数，≥10KB 取整", () => {
    expect(fmtSize(1024)).toBe("1.0 KB");
    expect(fmtSize(1536)).toBe("1.5 KB");
    expect(fmtSize(10 * 1024)).toBe("10 KB");
  });

  it("MB 档：保一位小数（含 1MB 边界）", () => {
    expect(fmtSize(1024 * 1024)).toBe("1.0 MB");
    expect(fmtSize(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});
