import { ALL_FINGERS, dist, type Finger, type Geometry, type Key, type Point } from './geometry.ts';
import type { Layout, Sequence } from './layouts/index.ts';
import { kanaToRomaji } from './romaji/kunrei.ts';

export interface Options {
  /** 窓幅 N（打鍵単位）。この打鍵数までは指を残したとみなす */
  windowSize: number;
  /**
   * 同指連続（g=0）で打鍵先がその指のホームキー自身のとき、移動を加算するか。
   * false にすると距離 0 として扱う。
   */
  sfbHomeCost: boolean;
}

export const DEFAULT_OPTIONS: Options = {
  windowSize: 3,
  sfbHomeCost: true,
};

/** 1 ステップの中の 1 指分の押下 */
export interface Press {
  finger: Finger;
  /** この指が同時に押すキー。1 本の指でキーの間を押す場合は複数になる */
  keys: Key[];
  /** 指の目標位置。キーが複数なら重心（§4.2） */
  target: Point;
  /** 前回この指を使ってから挟まったステップ数 */
  gap: number;
  /** この押下で計上された移動距離 [u] */
  distance: number;
  /**
   * 同指連続（same finger bigram）。
   * 同じ指で**異なる位置**を続けて打った場合のみ真。
   * 同じキーの連打や、押しっぱなしの修飾キー（センターシフト等）は含まない。
   */
  sfb: boolean;
}

/**
 * 1 ステップ。同時押しは 1 ステップに複数の押下を持つ。
 * 順次打鍵（前置・後置シフト等）はステップが分かれる。
 */
export interface Stroke {
  /** ステップの通し番号 */
  index: number;
  char: string;
  presses: Press[];
  /** ステップ内の押下距離の合計 [u] */
  distance: number;
  /** 押下直後の全指位置 */
  positions: Record<Finger, Point>;
}

export interface Trace {
  strokes: Stroke[];
  /** 配列に無く打鍵できなかった文字数 */
  skipped: number;
  /**
   * 入力文字数（ローマ字展開・コンボ結合の前、原文の文字数）。
   * 打鍵数（ステップ数）は配列で変わるが、これは変わらないので
   * 「1 文字あたり」の分母に使える（仕様 §11.4）。
   */
  inputChars: number;
  /** 配列定義の不備。同一ステップ内で同じ指が複数のキーを要求された場合など */
  errors: string[];
}

/**
 * 仕様 §9。テキストを打鍵ステップ列へ展開し、各押下の移動距離を求める。
 *
 * g = 0        → d_stay               （同指連続。戻る時間がない）
 * 1 ≤ g ≤ N    → min(d_stay, d_home)  （残す選択肢が比較に入る）
 * g > N        → d_home               （復帰済み）
 *
 * ホームへの復帰移動そのものは計上しない（§7 R2）。
 * 同時押しステップは 1 ステップとして数え、距離は各指の単純和を採る。
 */
export function evaluate(
  text: string,
  layout: Layout,
  geometry: Geometry,
  options: Options = DEFAULT_OPTIONS,
): Trace {
  const prev = {} as Record<Finger, Point>;
  const last = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) {
    prev[finger] = geometry.homes[finger];
    last[finger] = Number.NEGATIVE_INFINITY;
  }

  const strokes: Stroke[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let index = 0;

  // ローマ字配列はかなテキストを展開してから打つ。かな配列はそのまま打つ
  const source = layout.romajiTable ? kanaToRomaji(text, layout.romajiTable) : text;
  // 見出しが複数文字ありうる配列（コンボや拗音）は最長一致で切り出す
  const chars = [...source.toLowerCase()];
  const maxLen = Math.max(1, layout.maxCharLength ?? 1);

  for (let cursor = 0; cursor < chars.length; ) {
    let sequence: Sequence | undefined;
    let char = chars[cursor];
    let consumed = 1;

    for (let len = Math.min(maxLen, chars.length - cursor); len >= 1; len--) {
      const candidate = chars.slice(cursor, cursor + len).join('');
      const found = layout.map.get(candidate);
      if (found) {
        sequence = found;
        char = candidate;
        consumed = len;
        break;
      }
    }

    if (!sequence) {
      skipped++;
      cursor++;
      continue;
    }
    cursor += consumed;

    for (const step of sequence) {
      const byFinger = new Map<Finger, Key[]>();

      for (const id of step) {
        const key = geometry.keys.get(id);
        if (!key) {
          record(errors, seen, `キー ${id} が形状に存在しない（文字「${char}」）`);
          continue;
        }
        // 1 本の指が複数キーを担当する場合はまとめる。指はキーの間を押す
        const group = byFinger.get(key.finger);
        if (group) group.push(key);
        else byFinger.set(key.finger, [key]);
      }

      const presses: Press[] = [...byFinger].map(([finger, keys]) => {
        const target = centroid(keys);
        const gap = index - last[finger] - 1;
        const at = prev[finger];
        return {
          finger,
          keys,
          target,
          gap,
          distance: 0,
          sfb: gap === 0 && (at.x !== target.x || at.y !== target.y),
        };
      });

      if (presses.length === 0) continue;

      let total = 0;
      for (const press of presses) {
        press.distance = pressCost(press, prev, geometry, options);
        total += press.distance;
      }
      // 位置の更新はステップ内の距離を出し切ってから行う
      for (const press of presses) {
        prev[press.finger] = press.target;
        last[press.finger] = index;
      }

      // 指同士の姿勢は、対象キーを押した直後の状態として記録する
      const positions = snapshot(prev, last, index, geometry, options.windowSize);
      strokes.push({ index, char, presses, distance: total, positions });
      index++;
    }
  }

  return { strokes, skipped, inputChars: [...text].length, errors };
}

function pressCost(
  press: Press,
  prev: Record<Finger, Point>,
  geometry: Geometry,
  options: Options,
): number {
  const { finger, target, gap } = press;
  const home = geometry.homes[finger];
  const dStay = dist(prev[finger], target);
  const dHome = dist(home, target);

  if (gap === 0) {
    const onHome = target.x === home.x && target.y === home.y;
    return !options.sfbHomeCost && onHome ? 0 : dStay;
  }
  if (gap <= options.windowSize) return Math.min(dStay, dHome);
  return dHome;
}

/** 複数キーを 1 本の指で押す場合の目標位置。キーの重心を採る */
function centroid(keys: Key[]): Point {
  if (keys.length === 1) return { x: keys[0].x, y: keys[0].y };
  const n = keys.length;
  return {
    x: keys.reduce((a, k) => a + k.x, 0) / n,
    y: keys.reduce((a, k) => a + k.y, 0) / n,
  };
}

function record(errors: string[], seen: Set<string>, message: string) {
  if (seen.has(message)) return;
  seen.add(message);
  errors.push(message);
}

/**
 * 仕様 §10。ステップ i の時点での全指位置。
 * 経過が N 以下なら前回押したキー、超えていればホーム。
 */
function snapshot(
  prev: Record<Finger, Point>,
  last: Record<Finger, number>,
  index: number,
  geometry: Geometry,
  windowSize: number,
): Record<Finger, Point> {
  const out = {} as Record<Finger, Point>;
  for (const finger of ALL_FINGERS) {
    const elapsed = index - last[finger] - 1;
    out[finger] = elapsed <= windowSize ? prev[finger] : geometry.homes[finger];
  }
  return out;
}
