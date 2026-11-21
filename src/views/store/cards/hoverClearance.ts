/**
 * hoverClearance — 顶行卡片展开面避让吸顶条（纯函数，可单测）。
 *
 * 症状：卡片 hover 时展开面居中放大，向上会长进吸顶工具条的模糊面里，
 * 标题（如「编辑器」）顶部被盖住。
 * 修法：只有「展开面上沿会越过吸顶区底边」时才把整张展开面下移，够用即停；
 * 不动卡片占位、不推挤布局，只改展开面的 translateY。
 */

/** 展开面比卡片多出来的高度里，上下各占一半；留 8px 呼吸。 */
export const HOVER_GAP = 8;
/** 下移上限：避免卡片被吸顶条压住太多时展开面飞得离卡太远。 */
export const HOVER_MAX_SHIFT = 80;

/**
 * @param cardTop         卡片占位顶边（视口坐标）
 * @param cardHeight      卡片占位高度
 * @param expandedHeight  展开后的面高度（含头部）
 * @param clearanceBottom 卡片上方所有吸顶条的底边（视口坐标）
 */
export function hoverShift(
  cardTop: number,
  cardHeight: number,
  expandedHeight: number,
  clearanceBottom: number,
): number {
  const desiredTop = cardTop + cardHeight / 2 - expandedHeight / 2;
  const shift = clearanceBottom + HOVER_GAP - desiredTop;
  return Math.min(HOVER_MAX_SHIFT, Math.max(0, shift));
}
