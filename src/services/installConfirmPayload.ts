/**
 * installConfirmPayload —— 只剩一个纯展示函数（2026-11-25 清账）。
 *
 * 历史：E6#71c 这里是「市场自造安装确认载荷」的构造器（`installConfirmPayload()`），
 * P1 壳托管后壳出 `plan`、D8′ 后市场吃壳的 `PluginConfirmViewPayload` ⇒ 自造载荷那套整块删除
 * （⛔ 第二推导点：来源/版本/哈希只能来自壳的计划）。
 *
 * 留下 `fmtSize`：详情页信息区与确认卡共用同一份「字节 → KB/MB」。
 * 作者显示名的唯一实现在 `catalogText.authorLabel`（本文件那份重复已删）。
 */

/** 字节可读化——KB/MB 通用单位零 i18n（诚实：来自目录 size，未装 = 包大小） */
export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 1024 * 10 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
