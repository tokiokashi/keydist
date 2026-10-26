/**
 * 操作できるキーの読み上げの名前。キーの名前に、刻まれた出力（`legend`）と説明（`description`）を添える。
 * 刻まれた出力が無いキー（親指・Shiftなど）でも、説明は読み上げに入れる。
 */
export function keyAriaLabel(keyName: string, legend: string, description: string | undefined): string {
  const note = description === undefined ? '' : `。${description}`;
  if (legend === '') return description === undefined ? keyName : `${keyName}（${description}）`;
  return `${keyName}（${legend}${note}）`;
}
