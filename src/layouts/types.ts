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
  /** キー id → そのキーの刻印。表示用 */
  legends: Map<string, string>;
  /**
   * かなテキストをローマ字へ展開してから打つ配列はテーブルを持つ。
   * かな配列は持たない。同じかなテキストを両者に食わせて比較できる。
   */
  romajiTable?: Map<string, string>;
  /**
   * map のうちコンボとして追加した見出し。ローマ字化で失われるかなの
   * 境界を使った命中判定と、コンボの命中件数の集計に使う。
   */
  comboHeadings?: ReadonlySet<string>;
}

const maxKeyLength = (keys: Iterable<string>) => Math.max(1, ...[...keys].map((k) => k.length));

/**
 * 4 行 × N 列のグリッドに文字を並べた配列。
 * 単打のみの配列（QWERTY・大西など）はこの形で書ける。
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
      // 同じ文字が複数のキーに載る配列もある。打鍵には先に書いた方を使い、
      // 後の方は刻印だけ残す（どちらを使うか決めないと、静かに片方が死ぬ）
      if (!map.has(ch)) map.set(ch, [[id]]);
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

/** かな → 打鍵ステップ列を直接書いた配列（薙刀式など） */
export function fromKana(id: string, name: string, def: Record<string, string[][]>): Layout {
  const map = new Map<string, Sequence>(Object.entries(def));
  // 単打で出るかなをそのキーの刻印にする
  const legends = new Map<string, string>();
  for (const [kana, sequence] of map) {
    if (sequence.length !== 1 || sequence[0].length !== 1) continue;
    const key = sequence[0][0];
    if (!legends.has(key)) legends.set(key, kana);
  }
  legends.set(THUMB_KEY.RT, '空白');
  legends.set(THUMB_KEY.LT, '親指');
  return { id, name, map, legends, maxCharLength: maxKeyLength(map.keys()) };
}

/** ローマ字テーブルを付ける。評価時にかなテキストがローマ字へ展開される */
export function withRomaji(layout: Layout, table: Map<string, string>): Layout {
  return { ...layout, romajiTable: table };
}

/**
 * コンボを足す。入力は「その文字を出すキー」で指定する。
 * 物理位置ではなく文字で指すので、同じ定義を別の英字配列にも適用できる。
 */
export function withCombos(
  id: string,
  name: string,
  layout: Layout,
  combos: [output: string, inputs: string[]][],
): Layout {
  const map = new Map(layout.map);
  const comboHeadings = new Set(layout.comboHeadings);
  for (const [output, inputs] of combos) {
    const keys = inputs.map((ch) => layout.map.get(ch)?.[0]?.[0]);
    if (keys.some((k) => k === undefined)) continue;
    map.set(output, [keys as string[]]);
    comboHeadings.add(output);
  }
  return { ...layout, id, name, map, maxCharLength: maxKeyLength(map.keys()), comboHeadings };
}
