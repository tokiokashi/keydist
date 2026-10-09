import { keyPatternsContaining, type KeyPatternMatch } from '#input/layouts/key-pattern-picker.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import { physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';
import { NO_ROLE, type KeyDetail, type KeyDetails, type KeyOriginCount } from '#interpretation/key-detail.ts';

/**
 * キーの詳細（`interpretation/key-detail.ts`）を画面に出す文字列と並びにする、純粋な変換。
 *
 * ヒートマップとBigram Flowのキーのツールチップ、キーを選んだ時の小窓が同じ関数を使い、
 * 同じキーについて同じ値と件数を同じ言い方で出す。回数は集計の値をそのまま使い、
 * ここで求めるのは並べ替えと割合だけ。
 */

/** ツールチップに出す、前の文字の上位の数。要点だけを読ませ、全件は小窓で読ませる。 */
export const TOOLTIP_PREVIOUS_CHAR_LIMIT = 3;

/**
 * キーの名前。内部のキーidは出さず、物理キーの名前で出す。
 *
 * 刻印が物理キーの名前と違う時だけ刻印を先に出し、物理キーの名前をカッコで添える。
 * 刻印が無い時や、大文字と小文字の違いを除いて物理キーの名前と同じ時は、物理キーの名前だけにする
 * （物理キーの名前は文字キーを大文字にするので、刻印の `q` と名前の `Q` は同じとみなす）。
 * `a / b` のように複数の刻印を結合したものは、全部が物理キーの名前と同じ時だけ同じとみなす。
 */
export function keyName(keyId: string, legend: string | undefined, standard?: PhysicalKeyboardStandard): string {
  const name = physicalKeyDisplayLabel(keyId, standard);
  const text = legend?.trim() ?? '';
  const sameAsName = text === ''
    || text.split(' / ').every((part) => part.trim().toLowerCase() === name.toLowerCase());
  return sameAsName ? name : `${text}（${name}）`;
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  output: '出力',
  trigger: 'トリガー',
  'held-trigger': '押したままのトリガー',
};

/** 押し方（役の組。`roleSetId` の値）の表示名。 */
export function roleSetLabel(roleSet: string): string {
  if (roleSet === NO_ROLE) return 'その他';
  return roleSet.split('+').map((role) => ROLE_LABELS[role] ?? role).join('・');
}

/** 回数の降順、同じ回数は並びが決まるようキーの昇順。 */
export function rankedCounts<K extends string | number>(counts: ReadonlyMap<K, number>): Array<[K, number]> {
  return [...counts].sort(([keyA, countA], [keyB, countB]) => countB - countA || (keyA < keyB ? -1 : keyA > keyB ? 1 : 0));
}

/** 割合の表示（元の回数と一緒に出す）。母数が0なら空。 */
export function shareText(count: number, total: number): string {
  return total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '';
}

/**
 * ツールチップの文字列。1行目はキーの名前と押下数、続けて押し方の内訳と前の文字の上位を、回数を添えて出す。
 * 押下が無い時は1行目だけ。前の文字の上位に入らなかった分は「ほか◯打」にまとめる。先頭の入力単位（前の文字が無い押下）は小窓で読ませる。
 */
export function keyDetailTooltip(name: string, detail: KeyDetail | undefined): string {
  const presses = detail?.presses ?? 0;
  const lines = [`${name}: ${presses}打`];
  if (detail === undefined || presses === 0) return lines.join('\n');
  lines.push(`押し方: ${rankedCounts(detail.roles).map(([role, count]) => `${roleSetLabel(role)} ${count}打`).join('・')}`);
  const previous = rankedCounts(detail.previousChars);
  if (previous.length > 0) {
    const top = previous.slice(0, TOOLTIP_PREVIOUS_CHAR_LIMIT).map(([char, count]) => `${char} ${count}打`);
    const rest = previous.slice(TOOLTIP_PREVIOUS_CHAR_LIMIT).reduce((sum, [, count]) => sum + count, 0);
    lines.push(`前の文字: ${[...top, ...(rest > 0 ? [`ほか ${rest}打`] : [])].join('・')}`);
  }
  return lines.join('\n');
}

/** 移動の起点の表示行。 */
export interface OriginRow {
  /** 位置が物理キーに当たればそのキーの名前、当たらなければ位置 */
  readonly label: string;
  readonly fromPrevious: number;
  readonly fromHome: number;
  readonly total: number;
}

/** 移動の起点を、回数の多い順に並べる。位置が物理キーに当たらない時は座標（単位はキー幅）で示す。 */
export function originRows(origins: readonly KeyOriginCount[], standard?: PhysicalKeyboardStandard): OriginRow[] {
  return origins
    .map((origin): OriginRow => ({
      label: origin.keyIds.length > 0
        ? origin.keyIds.map((id) => physicalKeyDisplayLabel(id, standard)).join(' / ')
        : `キーのない位置（${origin.x}, ${origin.y}）`,
      fromPrevious: origin.fromPrevious,
      fromHome: origin.fromHome,
      total: origin.fromPrevious + origin.fromHome,
    }))
    .sort((a, b) => b.total - a.total || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/** 距離の分布を、距離の短い順に並べる。 */
export function distanceRows(distances: ReadonlyMap<number, number>): Array<{ distance: number; count: number }> {
  return [...distances].map(([distance, count]) => ({ distance, count })).sort((a, b) => a.distance - b.distance);
}

/** 面ごとの内訳の1行。 */
export interface FaceRow {
  readonly faceId: string;
  readonly label: string;
  readonly detail: KeyDetail;
}

/**
 * キーが押された面を、Traceに現れた順に並べる。押されていない面は含めない。
 * 面の名前は `labelOf` で引く（配列が宣言したレイヤーの名前とコンボの名前）。
 */
export function faceRows(details: KeyDetails, keyId: string, labelOf: (faceId: string) => string): FaceRow[] {
  const rows: FaceRow[] = [];
  for (const [faceId, face] of details.faces) {
    const detail = face.get(keyId);
    if (detail !== undefined && detail.presses > 0) rows.push({ faceId, label: labelOf(faceId), detail });
  }
  return rows;
}

/** 入力パターン1つ（どの打鍵でどの出力になるか）。 */
export interface PatternRow {
  /** 打鍵に使う物理キーの名前（キーの順は配列の定義のまま） */
  readonly keyNames: readonly string[];
  readonly output: string;
  /** コンボのグループ名 */
  readonly group: string | undefined;
  /** 押す順が決まっているか */
  readonly ordered: boolean;
}

/** トリガーのガイド1つ。 */
export interface TriggerGuide {
  /** トリガーに使う物理キーの名前 */
  readonly keyNames: readonly string[];
  /** 押したまま打つトリガーか */
  readonly held: boolean;
}

/** 面（レイヤー・コンボ）ごとの入力パターン。 */
export interface PatternGroup {
  readonly faceId: string;
  readonly label: string;
  readonly triggers: readonly TriggerGuide[];
  /** 選んだキー自身が、この面のトリガーに使われるか */
  readonly selfTrigger: boolean;
  readonly rows: readonly PatternRow[];
}

const keySignature = (keys: readonly string[]): string => [...keys].sort().join('\u0000');

/**
 * 選んだ物理キーを含む入力パターンを、面ごとに分けて返す。
 * 面の並びは配列の定義でそのキーが最初に現れる順、面の中は打鍵数の少ない順（同じなら出力の順）。
 * 入力パターンとトリガーは配列の定義から出し、Traceの集計には依らない。コンボの面にはトリガーを付けない。
 */
export function keyPatternGroups(
  layout: Layout,
  keyId: string,
  labelOf: (faceId: string) => string,
  standard?: PhysicalKeyboardStandard,
): PatternGroup[] {
  const byFace = new Map<string, KeyPatternMatch[]>();
  for (const match of keyPatternsContaining(layout, keyId)) {
    const list = byFace.get(match.aggregationGroupId);
    if (list) list.push(match);
    else byFace.set(match.aggregationGroupId, [match]);
  }
  const names = (keys: readonly string[]) => keys.map((key) => physicalKeyDisplayLabel(key, standard));
  return [...byFace].map(([faceId, matches]): PatternGroup => {
    // コンボは押したキーの組そのものが入力で、切り替えるトリガーを持たない
    const isCombo = layout.layerDefinitions?.find((definition) => definition.id === faceId)?.kind === 'combo';
    const triggers = new Map<string, TriggerGuide>();
    for (const match of isCombo ? [] : matches) {
      const held = new Set(match.holdKeyVariants.map(keySignature));
      for (const keys of match.triggerKeyVariants) {
        const signature = keySignature(keys);
        const existing = triggers.get(signature);
        triggers.set(signature, { keyNames: names(keys), held: held.has(signature) || existing?.held === true });
      }
    }
    return {
      faceId,
      label: labelOf(faceId),
      triggers: [...triggers.values()],
      selfTrigger: !isCombo && matches.some((match) => match.triggerKeyVariants.some((keys) => keys.includes(keyId))),
      rows: [...matches]
        .sort((a, b) => a.keys.length - b.keys.length || (a.output < b.output ? -1 : a.output > b.output ? 1 : 0))
        .map((match): PatternRow => ({
          keyNames: names(match.keys),
          output: match.output,
          group: match.group,
          ordered: match.orderRequirements !== undefined,
        })),
    };
  });
}
