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
  type ParseCalibrationFormResult,
} from '#interpretation/timing/calibration-form.ts';
import { SENTENCE_MIN_SAMPLES, type ApplySentenceResult, type SentenceMeasurement } from '#interpretation/timing/sentence-measurement.ts';
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
 * 文章を打つ測定で示す文。1本ずつ覚えて繰り返し打てるよう、よく使われる短い文（かな15〜25文字）にしてある。
 * 本数は、確かめる配列のそれぞれで、Arpeggio・Chain・その他のどれもが全文の1回分で10打以上になるよう決めてある。
 * 数える打鍵が10に満たない種類は保存しない。
 */
export const MEASUREMENT_SENTENCES: readonly string[] = [
  'こんしゅうのどようびにえいがをみにいく',
  'まいにちすこしずつにほんごをべんきょうする',
  'あしたのかいぎのしりょうをじゅんびした',
  'せんせいがおしえてくれたことをわすれない',
  'かぞくでふゆやすみにりょこうにいく',
  'このほんはとてもおもしろくてやめられない',
  'あたらしいくつをかってもらってうれしい',
  'なつやすみにはうみへあそびにいきたい',
];

/** 連打との差の種類の名前。 */
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
    case 'overhead': return `連打との差 ${OVERHEAD_KIND_LABEL[name as OverheadKind] ?? name}`;
    case 'finger': return `${fingerLabel(name)}の移動速度`;
    case 'same-hand-pair': return `同手・別指 ${pairLabel(name, ':')}`;
    case 'directed-pair': return `同手・別指 ${pairLabel(name, '>')}`;
    default: return fieldId;
  }
}

/** 欄の値の単位。指の移動速度は物理キーの距離（u）で、他は1秒あたりの打鍵数。 */
export function calibrationFieldUnit(fieldId: string): string {
  if (fieldId.startsWith(OVERHEAD_FIELD_PREFIX)) return OVERHEAD_UNIT;
  return fieldId === CALIBRATION_FALLBACK_FINGER_FIELD || fieldId.startsWith('finger:') ? SPEED_UNIT : ACTIONS_UNIT;
}

/** 保存値を編集した欄の値を保存できなかった理由。 */
export function calibrationFormProblemText(problem: Extract<ParseCalibrationFormResult, { ok: false }>): string {
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
      return `${subject}: ${first}→${second}の順で、普段の速さで繰り返してください。戻りの打鍵は数えません。`;
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
): string {
  const notice = clearedOverheads.length > 0
    ? ` 文章を打つ時の連打との差（${clearedOverheads.map((kind) => OVERHEAD_KIND_LABEL[kind]).join('・')}）は、他の値が変わったため消しました。文章を打つ速さをもう一度測ってください。`
    : '';
  if (scope === 'normal') return `通常の速度、同じキーを続けて打つ速さ、指の移動速度を測って保存しました。${notice}`;
  if (scope === 'directional') return `方向別の速度を測って保存しました。${notice}`;
  return item === undefined ? `保存しました。${notice}` : `${calibrationItemLabel(item)}を測り直して保存しました。${notice}`;
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

/** 文章を打つ測定を保存した時の知らせ。種類ごとに、保存した値と数えた打鍵の数を示す。 */
export function sentenceSavedMessage(measurement: SentenceMeasurement): string {
  const parts = OVERHEAD_KINDS.map((kind) => {
    const value = measurement.overheadMs[kind];
    const count = measurement.counts[kind];
    return value === undefined
      ? `${OVERHEAD_KIND_LABEL[kind]}は数えた打鍵が${count}打で${SENTENCE_MIN_SAMPLES}打に満たないため、保存していません`
      : `${OVERHEAD_KIND_LABEL[kind]} ${value.toFixed(1)}ミリ秒（${count}打）`;
  });
  return `文章を打つ速さを測って保存しました。連打との差: ${parts.join('、')}。`;
}

/** 文章を打つ測定を保存できなかった時の文。 */
export function sentenceFailureText(result: Exclude<ApplySentenceResult, { ok: true }>): string {
  switch (result.reason) {
    case 'changed':
      return '測定の途中で個人速度が変わったため、保存していません。もう一度測ってください。';
    case 'no-saved-value':
      return '個人速度が保存されていないため、文章を打つ測定は保存できません。';
    case 'too-few':
      return `数えた打鍵が少なく、保存していません。もう一度測ってください（${countsText(result.measurement)}）。`;
    case 'out-of-range':
      return `測った連打との差が保存できる範囲（${CALIBRATION_OVERHEAD_MS_MIN}から${CALIBRATION_OVERHEAD_MS_MAX}ミリ秒）を外れていたため、保存していません。もう一度測ってください。`;
  }
}

/** 打った内容から測定の値を求められなかった時の文。 */
export const SENTENCE_UNMEASURED_TEXT = '打った内容から測定の値を求められなかったため、保存していません。もう一度測ってください。';

/** 個人速度の画面の各測定の説明。何を測るか、打鍵再生のどこに使われるか、測らなかった時に何が代わるか。 */
export const MEASUREMENT_DESCRIPTION = {
  normal: '左右の人差し指の連打と、同じキーを1本の指で続けて打つ速さ、同じ手の2本の指を交互に打つ速さ、各指がホームから動く速さを測ります。'
    + '打鍵再生では、同指連続を含まない打鍵の時間と、同じキーを続けて打つ時間、同指連続で指が動く時間に使います。「全指の移動時間で律速」の設定でも、指の移動速度を使います。'
    + '測っていない指の移動速度には、測れた指の代表値が使われます。同じキーを続けて打つ速さを測っていなければ、通常の打鍵速度が使われます。',
  directional: '左手から右手、右手から左手の向きごとの連打の速さと、同じ手の2本の指を向きごとに交互に打つ速さを測ります。'
    + '打鍵再生では、同指連続を含まない打鍵の時間を、直前の打鍵との指の組み合わせと向きで決めるのに使います。'
    + '測っていない向きには、通常の速度や同手・別指の代表の速度が使われます。',
  sentence: '示す短い文を1本ずつ3回続けて打って、文章を打つ時の連打との差を、Arpeggio・Chain・その他・続け打ち・同指連続の5種類ごとに測ります。'
    + '続け打ちは同じ指で同じキーを続けて打つ打鍵、同指連続は同じ指で違う位置を続けて打つ打鍵です。'
    + '1回目は文を覚える回で、数えません。2回目以降の打鍵だけを数えるので、覚えた文を考えずに打ってください。'
    + '句読点を打つ打鍵と直後の打鍵は、文の区切りで止まる間を含みうるので数えません。'
    + '間違えたら、その打鍵だけを数えずに続けられます。'
    + 'ローマ字で打つ配列では、普段の綴り（shi・chi・tsu、子音の前のnの1打など）で打てます。'
    + '連打との差は、打鍵の間隔から基準の時間を引いた差の中央値で求めるので、長い間はほとんど入りません。'
    + '基準の時間は、続け打ちでは同じキーを続けて打つ速さ（測っていなければ通常の打鍵速度）、同指連続では連打の時間と指が動く時間の遅い方、それ以外では連打の時間です。'
    + '連打の時間は、この画面の通常の速度・方向別の速度の測定（同じ手の2本の指を交互に打つ速さを含む）で測る打鍵の速さで決まります。'
    + '打鍵の数は、文ごとに2回目と3回目のうち数えた打鍵が多い方の数を、全文で足した数です。'
    + '打鍵再生では、同指連続の値は連打の時間と指が動く時間の遅い方に、続け打ちと他の種類の値は連打の時間に足します。'
    + '測っていない構造の種類には「その他」の連打との差が使われます。続け打ちと同指連続を測っていない時は、その打鍵が属する構造の種類の値が使われます。'
    + '同じキーを続けて打つ速さを測ってあり、続け打ちの差が無い時は、続け打ちに連打との差を足しません。'
    + '測っていなければ連打との差はありません。'
    + '打ちやすい形の違いが再生に出るよう、手に馴染んだ配列で測ってください。'
    + 'キーボードがコンボを文字に変えて送る場合も測れます。',
} as const;

export const PERSONAL_SPEED_PURPOSE =
  '打鍵再生の時間を、基準速度ではなく、測った打鍵と指の移動の速さで決めるために測ります。'
  + '測った値は保存され、打鍵再生の「個人速度」を「適用する」にしている間に使われます。測っていなければ基準速度で再生します。';
