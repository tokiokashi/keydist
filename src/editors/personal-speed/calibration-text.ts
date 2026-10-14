import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import type { Finger } from '#input/shapes/geometry.ts';
import {
  CALIBRATION_OVERHEAD_MS_MAX,
  CALIBRATION_OVERHEAD_MS_MIN,
  OVERHEAD_KINDS,
  type OverheadKind,
} from '#interpretation/timing/calibration.ts';
import {
  CALIBRATION_FALLBACK_FINGER_FIELD,
  CALIBRATION_SAME_HAND_FIELD,
  type ApplyCalibrationFieldResult,
} from '#interpretation/timing/calibration-form.ts';
import {
  SENTENCE_MIN_SAMPLES,
  type ApplySentenceResult,
  type SentenceMeasurement,
  type SentenceSaveStatus,
} from '#interpretation/timing/sentence-measurement.ts';
import type { SentenceUnmeasurable } from '#interpretation/timing/sentence-session.ts';
import {
  remainingCalibrationIntervals,
  type CalibrationItem,
  type CalibrationRun,
  type CalibrationTask,
} from '#interpretation/timing/calibration-session.ts';

/** 個人速度の画面に出す文言。 */

export const ACTIONS_UNIT = 'アクション/秒';
export const SPEED_UNIT = 'u/秒';
export const OVERHEAD_UNIT = 'ミリ秒';

/**
 * 文章を打つ測定で示す文。1本ずつ覚えて、2回目以降は続きを思い出す間を挟まずに打てるよう、
 * よく使われる日本語の短い文や句（かな8〜12文字、文節で2〜3個）にしてある。
 * 本数は、確かめる配列のそれぞれで、Arpeggio・Chain・その他のどれもが全文の1回分で10打以上になるよう決めてある。
 * 数える打鍵が10に満たない種類は保存しない。
 */
export const MEASUREMENT_SENTENCES: readonly string[] = [
  'こんしゅうのどようびに',
  'えいがをみにいく',
  'まいにちすこしずつ',
  'にほんごをべんきょうする',
  'あしたのかいぎの',
  'しりょうをじゅんびした',
  'せんせいがおしえてくれた',
  'ことをわすれない',
  'かぞくでふゆやすみに',
  'りょこうにいきたい',
  'このほんはとても',
  'おもしろくてやめられない',
  'あたらしいくつを',
  'かってもらってうれしい',
  'なつやすみにはうみへ',
  'あそびにいきたい',
];

/** 打鍵の上乗せの種類の名前。 */
export const OVERHEAD_KIND_LABEL: Readonly<Record<OverheadKind, string>> = {
  arpeggio: 'Arpeggio',
  chain: 'Chain',
  other: 'その他',
  repeat: '続け打ち',
  sfb: '同指連続',
};

/** 構造の種類の欄の識別子の接頭辞。 */
const OVERHEAD_FIELD_PREFIX = 'overhead:';

function fingerLabel(finger: string): string {
  return FINGER_LABEL[finger as Finger] ?? finger;
}

/** `LM:LI`や`LM>LI`の指の組を、指の名前の組にする。 */
function pairLabel(pair: string, separator: ':' | '>'): string {
  const [first = '', second = ''] = pair.split(separator);
  return separator === ':' ? `${fingerLabel(first)}と${fingerLabel(second)}` : `${fingerLabel(first)}から${fingerLabel(second)}`;
}

export function calibrationItemLabel(item: CalibrationItem): string {
  switch (item.kind) {
    case 'actions': return '通常の打鍵速度';
    case 'same-key': return '同じキーを続けて打つ速さ';
    case 'direction': return item.direction === 'L→R' ? '左手から右手' : '右手から左手';
    case 'finger': return fingerLabel(item.finger);
    case 'same-hand-pair': return pairLabel(item.pair, ':');
    case 'directed-pair': return pairLabel(item.pair, '>');
  }
}

/** 欄の識別子（`calibrationItemId`か代表値の欄）に対応する名前。 */
export function calibrationFieldLabel(fieldId: string): string {
  if (fieldId === CALIBRATION_SAME_HAND_FIELD) return '同手・別指の代表の速度';
  if (fieldId === CALIBRATION_FALLBACK_FINGER_FIELD) return '測定できなかった指の移動速度';
  const [kind, ...rest] = fieldId.split(':');
  const name = rest.join(':');
  switch (kind) {
    case 'actions': return calibrationItemLabel({ kind: 'actions' });
    case 'same-key': return calibrationItemLabel({ kind: 'same-key', hand: 'L' });
    case 'direction': return `異手 ${calibrationItemLabel({ kind: 'direction', direction: name === 'L→R' ? 'L→R' : 'R→L' })}`;
    case 'overhead': return `打鍵の上乗せ ${OVERHEAD_KIND_LABEL[name as OverheadKind] ?? name}`;
    case 'finger': return `${fingerLabel(name)}の移動速度`;
    case 'same-hand-pair': return `同手・別指 ${pairLabel(name, ':')}`;
    case 'directed-pair': return `同手・別指 ${pairLabel(name, '>')}`;
    default: return fieldId;
  }
}

/**
 * 見出しの下に並べる行の名前。見出しで分かる語（異手・同手・別指・打鍵の上乗せ・移動速度）は外す。
 * 行の外で読む名前（入力欄の読み上げ・保存できない理由）は`calibrationFieldLabel`。
 */
export function calibrationFieldRowLabel(fieldId: string): string {
  const [kind, ...rest] = fieldId.split(':');
  const name = rest.join(':');
  switch (kind) {
    case 'direction': return calibrationItemLabel({ kind: 'direction', direction: name === 'L→R' ? 'L→R' : 'R→L' });
    case 'overhead': return OVERHEAD_KIND_LABEL[name as OverheadKind] ?? name;
    case 'finger': return fingerLabel(name);
    case 'same-hand-pair': return pairLabel(name, ':');
    case 'directed-pair': return pairLabel(name, '>');
    default: return calibrationFieldLabel(fieldId);
  }
}

/** 欄の値の単位。指の移動速度は物理キーの距離（u）で、他は1秒あたりの打鍵数。 */
export function calibrationFieldUnit(fieldId: string): string {
  if (fieldId.startsWith(OVERHEAD_FIELD_PREFIX)) return OVERHEAD_UNIT;
  return fieldId === CALIBRATION_FALLBACK_FINGER_FIELD || fieldId.startsWith('finger:') ? SPEED_UNIT : ACTIONS_UNIT;
}

/** 保存値を編集した欄の値を保存できなかった理由。 */
export function calibrationFormProblemText(problem: Extract<ApplyCalibrationFieldResult, { ok: false }>): string {
  const label = calibrationFieldLabel(problem.fieldId);
  return problem.problem === 'empty'
    ? `${label}を入力してください。`
    : `${label}は${problem.min}から${problem.max}までの数値で入力してください。`;
}

/** 測る項目の案内。キーは配列の刻印の名前で出す。 */
export function calibrationInstruction(task: CalibrationTask, keyLabel: (keyId: string) => string): string {
  const first = `「${keyLabel(task.keys[0])}」`;
  const second = `「${keyLabel(task.keys[1])}」`;
  const subject = calibrationItemLabel(task.item);
  switch (task.item.kind) {
    case 'actions':
      return `${first}と${second}を、普段の速さで交互に打ってください。`;
    case 'same-key':
      return `${subject}: ${first}を、普段の速さで続けて打ってください。`;
    case 'finger':
      return `${subject}: ${first}と${second}を交互に打ってください。`;
    case 'same-hand-pair':
      return `${subject}: ${first}と${second}を、普段の速さで交互に打ってください。`;
    case 'direction':
    case 'directed-pair':
      return `${subject}: ${first}→${second}の2打を、つなげて素早く繰り返してください。戻りの打鍵は数えず、速さも問いません。`;
  }
}

/** 測定の進み具合。複数項目なら何番目かも出す。 */
export function calibrationProgressText(run: CalibrationRun): string {
  const remaining = `あと${remainingCalibrationIntervals(run)}回`;
  return run.tasks.length > 1 ? `${run.index + 1} / ${run.tasks.length}、${remaining}` : remaining;
}

export function wrongKeyText(keyLabel: string): string {
  return `今は「${keyLabel}」を押す番です。`;
}

export function savedMessage(
  scope: 'normal' | 'directional' | 'item',
  item?: CalibrationItem,
  clearedOverheads: readonly OverheadKind[] = [],
  replacedOverheads: readonly OverheadKind[] = [],
): string {
  const notice = `${clearedOverheads.length > 0 ? '文章を打つ速さの打鍵の上乗せが消えました。' : ''}${replacedOverheads.length > 0 ? '続け打ちの打鍵の上乗せは置き換えました。' : ''}`;
  if (scope === 'normal') return `通常の速度、同じキーを続けて打つ速さ、指の移動速度を測って保存しました。${notice}`;
  if (scope === 'directional') return `方向別の速度を測って保存しました。${notice}`;
  return item === undefined ? `保存しました。${notice}` : `${calibrationItemLabel(item)}を測り直して保存しました。${notice}`;
}

/**
 * 測定で打鍵の上乗せが消えた時、置き換わった時に、文章を打つ速さの欄へ出す知らせ。
 * 消えたものがあれば、文章を打つ速さの測り直しを促す。
 */
export function clearedOverheadsText(
  clearedOverheads: readonly OverheadKind[],
  replacedOverheads: readonly OverheadKind[] = [],
): string {
  const cleared = clearedOverheads.length === 0
    ? ''
    : `打鍵の上乗せ（${clearedOverheads.map((kind) => OVERHEAD_KIND_LABEL[kind]).join('・')}）は、他の値が変わったため消しました。文章を打つ速さをもう一度測ってください。`;
  const replaced = replacedOverheads.length === 0
    ? ''
    : `打鍵の上乗せ（${replacedOverheads.map((kind) => OVERHEAD_KIND_LABEL[kind]).join('・')}）は、基準の時間が変わったため、再生の時間が変わらない値に置き換えました。`;
  return `${replaced}${cleared}`;
}

export const MEASUREMENT_OUT_OF_RANGE_TEXT = '測った値が保存できる範囲を外れていたため、保存していません。もう一度測ってください。';

/** 文章を打つ測定の進み具合。何本目の何回目か。 */
export function sentenceProgressText(sentence: number, sentences: number, round: number, rounds: number): string {
  return `${sentence + 1}本目 / 全${sentences}本、${round + 1}回目 / 全${rounds}回`;
}

/** 1回目は文を覚える回で、数えないことを示す文。 */
export const SENTENCE_LEARNING_ROUND_TEXT = '1回目は文を覚える回です。この回は数えません。';

/** 文章を打つ測定を始められない理由。 */
export function sentenceUnmeasurableText(reason: SentenceUnmeasurable): string {
  return reason === 'empty'
    ? 'この配列では、示す文を打つ打鍵の列を作れません。別の配列を選んでください。'
    : 'この配列で示す文を打つには、親指キー・Space・修飾キーなど、1文字のキー以外が要るため、文章を打つ測定はできません。別の配列を選んでください。';
}

function countsText(measurement: SentenceMeasurement): string {
  return OVERHEAD_KINDS
    .map((kind) => `${OVERHEAD_KIND_LABEL[kind]} ${measurement.counts[kind]}打`)
    .join('、');
}

/**
 * 下限に届かず保存しなかった種類がある時に、知らせの文へ添える文。
 * どの種類が届くかは配列と綴りで変わるので、配列の名前は挙げない。
 */
export const SENTENCE_OTHER_LAYOUT_NOTE =
  '手に馴染んだ別の配列で測ると、求まる種類が増えることがあります。'
  + 'ただし、再生する配列と違う配列で測ると、構造の種類の分かれ方が違う配列で測った値になります。'
  + '測り直して保存すると、全ての種類が置き換わり、下限に届かなかった種類の値は無くなります。';

/** 文章を打つ測定を保存した時の知らせ。種類ごとに、保存した値と数えた打鍵の数を示す。 */
export function sentenceSavedMessage(measurement: SentenceMeasurement): string {
  const parts = OVERHEAD_KINDS.map((kind) => {
    const value = measurement.overheadMs[kind];
    const count = measurement.counts[kind];
    return value === undefined
      ? `${OVERHEAD_KIND_LABEL[kind]}は数えた打鍵が${count}打で${SENTENCE_MIN_SAMPLES}打に満たないため、保存していません`
      : `${OVERHEAD_KIND_LABEL[kind]} ${value.toFixed(1)}ミリ秒（${count}打）`;
  });
  const text = `文章を打つ速さを測って保存しました。打鍵の上乗せ: ${parts.join('、')}。`;
  const missing = OVERHEAD_KINDS.some((kind) => measurement.overheadMs[kind] === undefined);
  return missing ? `${text}${SENTENCE_OTHER_LAYOUT_NOTE}` : text;
}

/** 文章を打つ測定を保存できなかった時の文。 */
export function sentenceFailureText(result: Exclude<ApplySentenceResult, { ok: true }>): string {
  switch (result.reason) {
    case 'changed':
      return '測定の途中で個人速度が変わったため、保存していません。もう一度測ってください。';
    case 'no-saved-value':
      return '個人速度が保存されていないため、文章を打つ測定は保存できません。';
    case 'too-few':
      return `数えた打鍵が少なく、保存していません。もう一度測ってください（${countsText(result.measurement)}）。${SENTENCE_OTHER_LAYOUT_NOTE}`;
    case 'out-of-range':
      return `測った打鍵の上乗せが保存できる範囲（${CALIBRATION_OVERHEAD_MS_MIN}から${CALIBRATION_OVERHEAD_MS_MAX}ミリ秒）を外れていたため、保存していません。もう一度測ってください。`;
  }
}

/** 測り終えた時の表の見出し。 */
export const SENTENCE_TABLE_COLUMNS = {
  kind: '種類',
  count: '打鍵の数',
  base: '基準の時間の四分位平均（ミリ秒）',
  interval: '打った間隔の四分位平均（ミリ秒）',
  difference: '打鍵の上乗せ（ミリ秒）',
  saved: '保存',
} as const;

/** 測り終えた時の表に添える説明。 */
export const SENTENCE_TABLE_NOTES: readonly string[] = [
  '打鍵の上乗せは、打鍵ごとの差（打った間隔から基準の時間を引いた値）の四分位平均（小さい方と大きい方から4分の1ずつ除いた残りの平均）で、負の値もそのまま保存します。'
  + '打った間隔の四分位平均から基準の時間の四分位平均を引いた値とは、一致しないことがあります。',
  '基準の時間は1打の時間です。同指連続では、1打の時間と指が動く時間の長い方です。続け打ちの1打の時間は、同じキーを続けて打つ速さから求めます。',
];

/** 表の行の名前。同指連続と続け打ちは、基準の時間が分かる形にする。 */
export function sentenceTableKindLabel(kind: OverheadKind): string {
  switch (kind) {
    case 'repeat': return `${OVERHEAD_KIND_LABEL[kind]}（同じキーを続けて打つ時間が基準）`;
    case 'sfb': return `${OVERHEAD_KIND_LABEL[kind]}（1打の時間と指が動く時間の長い方が基準）`;
    default: return OVERHEAD_KIND_LABEL[kind];
  }
}

/** 表の四分位平均の表示。数えた打鍵が無い行は「なし」。 */
export function sentenceTableValueText(value: number | undefined): string {
  return value === undefined ? 'なし' : value.toFixed(1);
}

/** 差の種類の行で、保存したかを示す文。 */
export function sentenceTableSavedText(status: SentenceSaveStatus): string {
  switch (status) {
    case 'saved': return '保存した';
    case 'below-minimum': return `保存していない（${SENTENCE_MIN_SAMPLES}打に満たず、値が揺れやすい）`;
    case 'out-of-range': return '保存していない（範囲を外れた種類があるため）';
  }
}

/** 打った内容から測定の値を求められなかった時の文。 */
export const SENTENCE_UNMEASURED_TEXT = '打った内容から測定の値を求められなかったため、保存していません。もう一度測ってください。';

/**
 * 個人速度の画面の各測定の説明。何を測るか・どこに使うかの2文を持つ。
 * 打ち方は`MEASUREMENT_HOW_TO`、測ると保存値がどうなるかは`measurementEffectText`が持つ。
 * 計算の詳細は再生時間モデルの仕様書（`spec/playback-timing.md` §3.1.1・§3.2・§3.3・§6）が持つ。
 */
export const MEASUREMENT_DESCRIPTION = {
  normal: 'キーを打つ速さ、同じキーを続けて打つ速さ、同じ手の2本の指で打つ速さ、指ごとにキーの間を動く速さを測ります。'
    + '打鍵再生で、1打ごとの時間と、同じ指で別のキーを続けて打つ時に指が動く時間を決めます。',
  directional: '左手と右手の交互打ちと、同じ手の2本の指で打つ時の、打つ向きごとの速さを測ります。'
    + '打鍵再生で、測った向きの1打の時間を、向きを区別しない値の代わりに決めます。',
  sentence: '覚えた文を考えずに打つ時に、測った速さから求めた時間と、実際に打った間隔との差（打鍵の上乗せ）を、Arpeggio・Chain・その他・続け打ち・同指連続の5種類ごとに測ります。'
    + '打鍵再生で、1打ごとの時間に種類ごとの打鍵の上乗せを足します。',
} as const;

/** 測り方の箇条。説明文の後に、測り方の小見出しを付けて並べる。 */
export const MEASUREMENT_HOW_TO = {
  normal: [
    '指定されたキーを交互に打ってください。',
    '同じキーを続けて打ってください。',
  ],
  directional: [
    '→の2打を、つなげて素早く打ってください。',
  ],
  sentence: [
    '短い文を1本ずつ3回続けて打ってください。',
    '1回目は文を覚える回で数えないので、2回目からは考えずに打ってください。',
    '間違えたら、その打鍵を数えずに続けられます。',
    'ローマ字で打つ配列では、普段の綴りで打てます。',
    '手に馴染んだ配列で測ってください。',
    `打鍵が${SENTENCE_MIN_SAMPLES}打に届いた種類だけを保存するので、別の配列で測ると求まる種類が変わります。`,
    'キーボードがコンボを文字に変えて送る場合も測れます。',
  ],
} as const;

/**
 * 測ると保存値がどう変わるかを示す文。測るボタンの直後に置く。
 * 保存値を持たない時と、置き換わる値も消える値も無い時は`undefined`で、文を出さない。
 * `savedOverheads`は保存されている打鍵の上乗せの種類。
 */
export function measurementEffectText(
  group: 'normal' | 'directional' | 'sentence',
  saved: boolean,
  savedOverheads: readonly OverheadKind[],
): string | undefined {
  if (!saved) return undefined;
  switch (group) {
    case 'normal':
      if (savedOverheads.length === 0) return '測ると、方向別の値を除く保存値が置き換わります。';
      if (!savedOverheads.includes('repeat')) {
        return '測ると、方向別の値を除く保存値が置き換わり、文章を打つ速さの打鍵の上乗せは全て消えます。';
      }
      return savedOverheads.length === 1
        ? '測ると、方向別の値を除く保存値が置き換わり、続け打ちの打鍵の上乗せは再生の時間が変わらない値に置き換わります。'
        : '測ると、方向別の値を除く保存値が置き換わり、続け打ちの打鍵の上乗せは再生の時間が変わらない値に置き換わって、それ以外の打鍵の上乗せは消えます。';
    case 'directional': {
      // 同じ向きの測定が基準にする種類のうち、保存されているものだけを挙げる。続け打ちは基準にしないので消えない。
      const cleared = savedOverheads.filter((kind) => kind !== 'repeat');
      const kept = savedOverheads.includes('repeat') ? '（続け打ちは残ります）' : '';
      return cleared.length === 0
        ? '測ると、測った向きの値が置き換わります。'
        : `測ると、測った向きの値が置き換わり、打鍵の上乗せのうち${cleared.map((kind) => OVERHEAD_KIND_LABEL[kind]).join('・')}が消えます${kept}。`;
    }
    case 'sentence':
      return savedOverheads.length === 0
        ? undefined
        : '測り直して保存すると、前の打鍵の上乗せは全て置き換わります。';
  }
}

/** 行のボタンを持たない行が、どの測定で求まるかを示す文。 */
export const NORMAL_DERIVED_HINT = '通常の測定で求まります';
/** 選んだキーでは測れない行に出す文。 */
export const UNMEASURABLE_ROW_HINT = '選んだキーでは測れません';
/** 保存値を持たない時の、各測定の欄の文。 */
export const UNMEASURED_TEXT = {
  normal: '通常の速度と指の移動はまだ測っていません。',
  directional: '方向別の速度はまだ測っていません。',
  sentence: '打鍵の上乗せはまだ測っていません。',
} as const;
/** 通常の測定が保存値の前提になる測定のボタンが使えない理由。 */
export const NEED_NORMAL_FIRST_TEXT = '先に、通常の速度と指の移動を測って保存してください。';
/** 選んだキーで方向別の測定が組めない理由。 */
export const NO_DIRECTIONAL_TEXT = '選んだキーでは、方向別の速度を測れません。別の組を選んでください。';

export const PERSONAL_SPEED_PURPOSE =
  '打鍵再生の時間を、基準速度ではなく、測った打鍵と指の移動の速さで決めるために測ります。'
  + '測った値は保存され、打鍵再生の「個人速度」を「適用する」にしている間に使われます。測っていなければ基準速度で再生します。';
