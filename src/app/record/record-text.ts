import type { RecordUnmeasurable } from '#engine/keystroke-record.ts';
import type { KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';

/** 画面に出す文言。内部の語（id・キー名・型名）は出さない。 */

export const RECORD_PAGE_NAME = '打鍵の記録';

export const RECORD_PAGE_DESCRIPTION = '評価に渡したテキストの範囲を打って、打鍵の間隔を記録します。記録はこのブラウザに保存します。';

/** 範囲を打てない理由。 */
export function unmeasurableText(reason: RecordUnmeasurable | 'no-range'): string {
  switch (reason) {
    case 'layout-errors':
      return 'この配列は定義に不備があり、打鍵の列を作れません。別の配列を選んでください。';
    case 'skipped':
      return 'この範囲に、選んだ配列で打てない文字があります。別の範囲か別の配列を選んでください。';
    case 'empty':
      return 'この範囲に、打つ文字がありません。別の範囲を選んでください。';
    case 'split-selection':
      return 'この範囲の境目で1回の入力が2つの範囲にまたがるため、この範囲は打てません。別の範囲を選んでください。';
    case 'uncapturable-key':
      return 'この範囲を打つには、修飾キーなど、記録で受け付けないキーが要ります。別の配列を選んでください。';
    case 'no-range':
      return '範囲を選んでください。';
  }
}

/** 打ち終えた記録を保存できない時の文。規則と違う綴りで打った時に起きるので、規則の綴りで打つことを案内する。 */
export function failureText(): string {
  return 'この範囲の記録を保存できませんでした。ローマ字規則のとおりの綴りで打ち直してください。';
}

export const COMPUTING_TEXT = '打鍵の列を作っています…';
export const PREPARING_TEXT = '範囲を準備しています…';
export const FINISHING_TEXT = '記録を作っています…';
export const START_LABEL = '記録を始める';
export const CANCEL_LABEL = '中止';
export const SAVE_LABEL = '保存する';
export const DISCARD_LABEL = '破棄する';
export const EXPORT_LABEL = '書き出す';
export const IMPORT_LABEL = '読み込む';
export const SAVED_NOTICE = '記録を保存しました';
export const EMPTY_LIST_TEXT = '保存した記録はありません';
export const IMPORT_TOO_LARGE_TEXT = 'ファイルが大きすぎて読み込めません';
export const IMPORT_UNREADABLE_TEXT = 'ファイルを読めませんでした';
export const COMPUTE_FAILED_TEXT = '記録の準備中にエラーが発生しました。条件を変えて試してください';

export function rangeLabel(index: number, start: number, end: number): string {
  return `${index + 1}　${rangeText(start, end)}`;
}

export function rangeText(start: number, end: number): string {
  return `${start + 1}〜${end}字目`;
}

export function remainingText(remaining: number): string {
  return `あと${remaining}打`;
}

export function pendingText(strokes: number, seconds: number, wrong: number): string {
  const wrongText = wrong === 0 ? '' : `。違うキーを押したのは${wrong}打です`;
  return `${strokes}打、${seconds.toFixed(1)}秒で打ち終えました${wrongText}`;
}

export function importedText(added: number, skipped: number, dropped: number): string {
  const parts = [`${added}件を読み込みました`];
  if (skipped > 0) parts.push(`${skipped}件は同じ記録が既にあるため読み込んでいません`);
  if (dropped > 0) parts.push(`${dropped}件は読めない形のため捨てました`);
  return `${parts.join('。')}。`;
}

/** 一覧の1行の日時。ローカルの日時で出す。 */
export function recordedAtText(record: KeystrokeRecord): string {
  const date = new Date(record.recordedAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
