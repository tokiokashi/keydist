import type { DecodeFailure } from './index.ts';

/**
 * 読み込みで要素を捨てた時の診断の文と、ファイルを読めなかった時の失敗の文。
 * 画面に出る内訳の文なので、同じ意味の文はここだけに書く。
 */

/** 配列で書かれているはずの値が配列でなかった。`subject`は捨てたものの名前（例: 「Setup」）。 */
export function droppedNotArray(subject: string): string {
  return `配列形式でないため${subject}を捨てました`;
}

/** objectで書かれているはずの値がobjectでなかった。 */
export function droppedNotObject(subject: string): string {
  return `object形式でないため${subject}を捨てました`;
}

/** 同じidが先にあったため、後の要素を捨てた。 */
export function droppedDuplicateId(id: string): string {
  return `id「${id}」が重複しているため捨てました`;
}

/** 予約された名前（`__proto__`等）のキーを捨てた。 */
export function droppedReservedKey(key: string): string {
  return `予約名のキー「${key}」を捨てました`;
}

/** ファイル全体を復元できなかった理由を、利用者向けの文と詳細に分ける。 */
export function describeFileDecodeFailure(reason: DecodeFailure): { readonly message: string; readonly detail: string } {
  if (reason.kind === 'future-version') {
    return {
      message: '新しい形式のファイルです。keydistを更新してから読み込んでください',
      detail: `version: ${reason.version} (対応: ${reason.currentVersion})`,
    };
  }
  return { message: 'ファイルの形式が正しくありません', detail: JSON.stringify(reason) };
}
