import { resolveKeyId } from '#input/shapes/geometry.ts';
import { keySequencePaths, matchKeySequences } from '#input/layouts/key-pattern-picker.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Stroke } from '#trace/generate.ts';

/**
 * 順次打鍵（1キーずつ順に打つ入力）の途中・最後のステップで、配列図に出す続きの表。
 * 字が決まるキーと続きがあるキーの区別は、キーマップの「キーを選んで出る文字を調べる図」に合わせる。
 */

export interface PlaybackSequenceTable {
  /** 選択の出力（字や熟語）。どのステップでも、これを大きく出す */
  readonly output: string;
  /** 続けて押すと出る字が決まるキー → その字（複数ある時は「 / 」でつなぐ） */
  readonly outputs: ReadonlyMap<string, string>;
  /** 続けて押せるキー（字が決まるキーも含む） */
  readonly continuations: ReadonlySet<string>;
}

function strokeKey(stroke: Stroke): string | undefined {
  const ids = [...new Set(stroke.presses.flatMap((press) => press.keys.map((key) => resolveKeyId(key.id))))];
  return stroke.triggerKeys.length === 0 && ids.length === 1 ? ids[0] : undefined;
}

/**
 * 今のステップが順次打鍵の選択のk打目（全n打、n≥2）なら、その表を返す。そうでなければundefined。
 * k<nの時は選択の1〜k打目を押した後の表、k=nの時は1〜n−1打目を押した後の表にする。
 * 1〜k打目の並びそのもので決まる字は表に出さない。同時押しの照合は混ぜない。
 */
export function playbackSequenceTable(layout: Layout, strokes: readonly Stroke[], cursor: number): PlaybackSequenceTable | undefined {
  const index = Math.min(cursor, strokes.length) - 1;
  const stroke = strokes[index];
  if (stroke === undefined || stroke.commit === true) return undefined;
  const sameSelection = (other: Stroke | undefined) => other !== undefined && other.selectionIndex === stroke.selectionIndex && other.commit !== true;
  let start = index;
  while (sameSelection(strokes[start - 1])) start--;
  let end = index + 1;
  while (sameSelection(strokes[end])) end++;
  const keys = strokes.slice(start, end).map(strokeKey);
  if (keys.length < 2 || keys.some((key) => key === undefined)) return undefined;
  const typed = keys as string[];
  // 打った並びが順次打鍵の経路そのものである選択だけを対象にする
  const isSequence = keySequencePaths(layout).some(
    (path) => path.output === stroke.char && path.keys.length === typed.length && path.keys.every((key, at) => key === typed[at]),
  );
  if (!isSequence) return undefined;
  const pressed = Math.min(index - start + 1, typed.length - 1);
  const match = matchKeySequences(layout, typed.slice(0, pressed));
  return {
    output: stroke.char,
    outputs: new Map([...match.candidates].map(([key, list]) => [key, [...new Set(list)].join(' / ')] as const)),
    continuations: match.continuations,
  };
}
