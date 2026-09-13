import { keyId, THUMB_KEY } from '../geometry.ts';
/** 1 ステップで同時に押すキーの集合。キーは QWERTY 刻印で指す（`space` `thumb-l` は親指キー） */
export type Step = string[];

/** 1 文字を打つための打鍵ステップ列。順次打鍵はステップを並べる */
export type Sequence = Step[];

export interface Layout {
  id: string;
  name: string;
  /** 文字 → 打鍵ステップ列 */
  map: Map<string, Sequence>;
  /**
   * map の見出しの最大文字数。1 より大きい場合、入力は最長一致で切り出す
   * （「きゃ」を「き」「ゃ」に分けない）
   */
  maxCharLength?: number;
  /** キー id → そのキーの刻印。表示用。ローマ字テーブルを合成しても引き継ぐ */
  legends: Map<string, string>;
}

/**
 * 4 行 × N 列のグリッドに文字を並べた配列を Sequence 形式へ変換する。
 * 単打のみの配列（QWERTY 等）はこの形で書ける。
 */
export function fromRows(
  id: string,
  name: string,
  rows: string[],
  thumbs: { LT?: string; RT?: string } = { RT: ' ' },
): Layout {
  const map = new Map<string, Sequence>();
  const legends = new Map<string, string>();
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === ' ') return;
      const id = keyId(r, c);
      map.set(ch, [[id]]);
      legends.set(id, ch);
    });
  });
  if (thumbs.LT) {
    map.set(thumbs.LT, [[THUMB_KEY.LT]]);
    legends.set(THUMB_KEY.LT, '親指');
  }
  if (thumbs.RT) {
    map.set(thumbs.RT, [[THUMB_KEY.RT]]);
    legends.set(THUMB_KEY.RT, '空白');
  }
  return { id, name, map, legends };
}

/**
 * ローマ字テーブルと英字配列を合成して、かな → 打鍵ステップ列の配列を作る。
 *
 * テーブルは全配列で共有する。テーブルを書き換えれば（`si` → `shi` など）
 * すべての英字配列に一斉に効くため、配列同士の差だけを見ることができる。
 *
 * 変換は最長一致で行う。「きゃ」のような複数文字の見出しを先に当てる。
 */
export function composeRomaji(
  id: string,
  name: string,
  table: Map<string, string>,
  base: Layout,
): Layout {
  const map = new Map<string, Sequence>();
  for (const [kana, roman] of table) {
    const sequence: Sequence = [];
    let ok = true;
    for (const ch of roman) {
      const s = base.map.get(ch);
      if (!s) {
        ok = false;
        break;
      }
      sequence.push(...s);
    }
    if (ok) map.set(kana, sequence);
  }
  // 刻印は英字配列のものをそのまま使う。合成で変わるのは打ち方であって配置ではない
  return { id, name, map, legends: base.legends, maxCharLength: maxKeyLength(table) };
}

const maxKeyLength = (table: Map<string, string>) =>
  Math.max(1, ...[...table.keys()].map((k) => k.length));
