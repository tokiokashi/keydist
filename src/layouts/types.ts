import { keyId, QWERTY_LEGEND, THUMB_KEY } from '../geometry.ts';
import { groupFacesIntoLayers } from '../layers.ts';

/** 1 ステップで同時に押すキーの集合。キーは QWERTY 刻印で指す（`thumb-r` `thumb-l` は親指キー）。`space` も入力互換で受け付ける */
export type Step = string[];

/** 1 文字を打つための打鍵ステップ列。順次打鍵はステップを並べる */
export type Sequence = Step[];

/** 面の発火方式。trigger と入力キーを同時に押すか、前後に分けるかを表す。 */
export type FaceMode = 'prefix' | 'suffix' | 'simultaneous';

/**
 * 面の 1 行。文字列なら 1 文字ずつ、配列ならセルごとの文字列として読む。
 * 配列形式は「きゃ」のような複数文字の見出しを 1 セルに置くために使う。
 */
export type FaceRow = string | readonly string[];

/** trigger で発火するキー面。rows は QWERTY 刻印の 4 行に対応する。 */
export interface Face {
  trigger: readonly string[];
  mode: FaceMode;
  rows: readonly FaceRow[];
  /** 同じ値を持つ単一キー面は 1 層へ畳む。省略時はその面が単独で 1 層 */
  layer?: string;
  /** 面の種別。省略時は layer。trigger が 2 キー以上の面は常に combo */
  role?: 'layer' | 'modifier';
}

/** コンボを発火できる入力の条件。条件を省略したコンボは常に最長一致する。 */
export interface ComboCondition {
  /** 拗音のローマ字塊の内部だけで発火する */
  youonOnly?: boolean;
}

/** コンボの出力、入力キー、発火条件。 */
export type ComboDefinition = [
  output: string,
  inputs: string[],
  condition?: ComboCondition,
];

export interface Layout {
  id: string;
  name: string;
  /** 文字 → 打鍵ステップ列 */
  map: Map<string, Sequence>;
  /** 面から作った配列だけが持つ、表示用の元面。自作配列などは省略する */
  faces?: readonly Face[];
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
   * map のうちコンボとして追加した見出しと、その発火条件。ローマ字化で
   * 失われるかなの境界を使った命中判定と、コンボの命中件数の集計に使う。
   */
  comboConditions?: ReadonlyMap<string, ComboCondition>;
}

const maxKeyLength = (keys: Iterable<string>) => Math.max(1, ...[...keys].map((k) => k.length));

const QWERTY_KEYS = new Set([...QWERTY_LEGEND.join('')]);

/** QWERTY 刻印のキー id で面を作る。未知のキーは空欄にせず定義ミスとして弾く。 */
export function faceFromEntries(
  trigger: readonly string[],
  mode: FaceMode,
  entries: Record<string, string>,
): Face {
  const invalidKeys = Object.keys(entries).filter((key) => !QWERTY_KEYS.has(key));
  if (invalidKeys.length > 0) throw new Error(`面に未知のキーがある: ${invalidKeys.join(', ')}`);
  return {
    trigger,
    mode,
    rows: QWERTY_LEGEND.map((row) => [...row].map((key) => entries[key] ?? '')),
  };
}

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
  // 親指の刻印は、親指キーを文字入力へ追加しないかな配列でも表示する。
  legends.set(THUMB_KEY.LT, '親指');
  legends.set(THUMB_KEY.RT, '空白');
  if (thumbs.LT) {
    map.set(thumbs.LT, [[THUMB_KEY.LT]]);
  }
  if (thumbs.RT) {
    map.set(thumbs.RT, [[THUMB_KEY.RT]]);
  }
  return { id, name, map, legends };
}

/** 面の集合を、評価器が使うかな → 打鍵ステップ列へ展開する。 */
export function fromFaces(
  id: string,
  name: string,
  faces: readonly Face[],
  thumbs: { LT?: string; RT?: string } = {},
): Layout {
  // 定義時に層の宣言を検証し、表示時まで不正な組み合わせを遅延させない。
  groupFacesIntoLayers(faces);
  const map = new Map<string, Sequence>();
  const legends = new Map<string, string>();

  for (const face of faces) {
    const trigger = [...new Set(face.trigger)];
    face.rows.forEach((row, r) => {
      const cells = typeof row === 'string' ? [...row] : [...row];
      cells.forEach((output, c) => {
        if (output === '' || output === ' ') return;
        if (map.has(output)) {
          throw new Error(`面の出力「${output}」が重複している`);
        }

        const key = keyId(r, c);
        map.set(output, expandFace(trigger, face.mode, key));
        // 刻印は単打面の 1 文字だけを表示する。シフト面の出力で上書きしない。
        if (trigger.length === 0 && [...output].length === 1) legends.set(key, output);
      });
    });
  }

  // 親指の刻印は、親指キーを文字入力へ追加しないかな配列でも表示する。
  legends.set(THUMB_KEY.LT, '親指');
  legends.set(THUMB_KEY.RT, '空白');
  if (thumbs.LT) map.set(thumbs.LT, [[THUMB_KEY.LT]]);
  if (thumbs.RT) map.set(thumbs.RT, [[THUMB_KEY.RT]]);
  return { id, name, map, legends, faces: [...faces], maxCharLength: maxKeyLength(map.keys()) };
}

function expandFace(trigger: string[], mode: FaceMode, key: string): Sequence {
  if (trigger.length === 0) return [[key]];
  if (mode === 'simultaneous') return [[...trigger, key]];
  if (mode === 'prefix') return [[...trigger], [key]];
  return [[key], [...trigger]];
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
  combos: ComboDefinition[],
): Layout {
  const map = new Map(layout.map);
  const comboConditions = new Map(layout.comboConditions);
  for (const [output, inputs, condition] of combos) {
    const keys = inputs.map((ch) => layout.map.get(ch)?.[0]?.[0]);
    if (keys.some((k) => k === undefined)) continue;
    map.set(output, [keys as string[]]);
    comboConditions.set(output, condition ?? {});
  }
  return {
    ...layout,
    id,
    name,
    map,
    maxCharLength: maxKeyLength(map.keys()),
    comboConditions,
  };
}
