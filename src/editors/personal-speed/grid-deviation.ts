/**
 * 指×指の表のマスに付ける、同じ表の中央値からのずれ。
 * 表は「種類（組ごと・方向別）× 手」で1つ。比べる相手は同じ表の保存値を持つマスだけで、
 * 別の手や別の種類の表の値は使わない。
 */

export type DeviationKind = 'same-hand-pair' | 'directed-pair';

export interface CellDeviation {
  /** 中央値より遅いか速いか。 */
  readonly direction: 'slow' | 'fast';
  /** 色の濃さ。0より大きく1以下。 */
  readonly intensity: number;
}

/** 中央値を求めるのに要る、保存値を持つマスの数。これ未満の表には色を付けない。 */
export const DEVIATION_MIN_CELLS = 3;

/** 中央値との比がこの範囲に収まるマスには色を付けない。ずれがごく小さいマスまで遅い・速いと言わないため。 */
export const DEVIATION_DEAD_RATIO = 1.1;

/** 色が最も濃くなる、中央値との比（遅い側は逆数）。 */
export const DEVIATION_FULL_RATIO = 2;

function median(sorted: readonly number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** 欄の識別子から、表を分ける手（`L`か`R`）を取る。`same-hand-pair:LM:LI`・`directed-pair:LM>LI`の最初の指の頭文字。 */
function handOf(fieldId: string): string | undefined {
  const finger = fieldId.split(':')[1];
  return finger === undefined ? undefined : finger[0];
}

/**
 * 種類ごとの欄の保存値から、各マスの色の向きと濃さを求める。
 * 濃さは中央値との比の対数を、最も濃くなる比の対数で割った値（1で頭打ち）。
 * 返すのは色を付けるマスだけ。保存値が数として読めない欄は無いものとして扱う。
 */
export function gridDeviations(kind: DeviationKind, saved: Readonly<Record<string, string>>): ReadonlyMap<string, CellDeviation> {
  const byHand = new Map<string, { id: string; value: number }[]>();
  const prefix = `${kind}:`;
  for (const [id, text] of Object.entries(saved)) {
    if (!id.startsWith(prefix) || text.trim() === '') continue;
    const value = Number(text);
    const hand = handOf(id);
    if (hand === undefined || !Number.isFinite(value) || value <= 0) continue;
    const group = byHand.get(hand) ?? [];
    group.push({ id, value });
    byHand.set(hand, group);
  }
  const result = new Map<string, CellDeviation>();
  const dead = Math.log(DEVIATION_DEAD_RATIO);
  const full = Math.log(DEVIATION_FULL_RATIO);
  for (const cells of byHand.values()) {
    if (cells.length < DEVIATION_MIN_CELLS) continue;
    const center = median(cells.map((cell) => cell.value).sort((a, b) => a - b));
    for (const { id, value } of cells) {
      const deviation = Math.log(value / center);
      if (Math.abs(deviation) <= dead) continue;
      result.set(id, { direction: deviation < 0 ? 'slow' : 'fast', intensity: Math.min(1, Math.abs(deviation) / full) });
    }
  }
  return result;
}
