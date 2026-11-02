import type { DecodeFailure } from './index.ts';

/**
 * 読み込みで要素を捨てた時の診断の文と、ファイルを読めなかった時の失敗の文。
 * 画面に出る内訳の文なので、同じ意味の文はここだけに書く。
 */

/** 配列で書かれているはずの値が配列でなかった。`subject`は捨てたものの名前（例: 「Setup」）。 */
export function droppedNotArray(subject: string): string {
  return `配列形式でないため${subject}を捨てました`;
}

/** 組になった欄を持つ値のはずが、そうでなかった。 */
export function droppedNotObject(subject: string): string {
  return `形式が正しくないため${subject}を捨てました`;
}

/** 同じidが先にあったため、後の要素を捨てた。 */
export function droppedDuplicateId(id: string): string {
  return `id「${id}」が重複しているため捨てました`;
}

/** 予約された名前（`__proto__`等）のキーを捨てた。 */
export function droppedReservedKey(key: string): string {
  return `予約名のキー「${key}」を捨てました`;
}

const FILE_SHAPE_MESSAGE = 'ファイルの形式が正しくありません';

/** ファイルの最上位が組の形式でなかった時の詳細。封筒を読む側（`format`を見る前の検査）も同じ文を使う。 */
export const FILE_ROOT_SHAPE_DETAIL = 'ファイルの最上位の形式が正しくありません';

/** 条件ファイル・自作の資産のファイルの印（`format`欄）が無かった時の詳細。読み込みの分類で同じ判定を持つ経路が共有する。 */
export const FORMAT_FIELD_MISSING_DETAIL = '「format」欄がありません';

/**
 * ファイル全体を復元できなかった理由を、利用者向けの文と詳細に分ける。
 * 詳細は理由の種類ごとに日本語で書き、内部の値は出さない。
 */
export function describeFileDecodeFailure(reason: DecodeFailure): { readonly message: string; readonly detail: string } {
  switch (reason.kind) {
    case 'future-version':
      return {
        message: '新しい形式のファイルです。keydistを更新してから読み込んでください',
        detail: `ファイルの版は${reason.version}です。このkeydistが読めるのは${reason.currentVersion}版までです`,
      };
    case 'not-an-object':
      return { message: FILE_SHAPE_MESSAGE, detail: FILE_ROOT_SHAPE_DETAIL };
    case 'missing-version':
      return { message: FILE_SHAPE_MESSAGE, detail: '「version」欄がありません' };
    case 'invalid-version':
      return { message: FILE_SHAPE_MESSAGE, detail: '「version」欄が0以上の整数ではありません' };
    case 'unmigratable-version':
      return { message: FILE_SHAPE_MESSAGE, detail: `${reason.version}版のファイルは読み込めません` };
    case 'invalid-shape':
      return { message: FILE_SHAPE_MESSAGE, detail: reason.message };
  }
}

/**
 * `JSON.parse`が投げた例外を、画面に出す日本語の文にする。例外の文はブラウザごとに違う英語なので、そのまま出さず、
 * そこから読み取れる位置だけを使って伝える。例外の文は不正なトークンの前後のファイルの内容を引用するので、位置は文の末尾の決まった形（V8の`at position N (line L column C)`・旧形式の`in JSON at position N`・Firefoxの`at line L column C of the JSON data`）にだけ一致させる。引用の中の文字列は位置と見なさない。読み取れなければ位置は伝えない。
 */
export function describeJsonSyntaxError(error: unknown, text: string): string {
  const syntax = 'JSONの書式が正しくありません';
  if (!(error instanceof Error)) return syntax;
  const firefox = /at line (\d+) column (\d+) of the JSON data$/.exec(error.message);
  if (firefox !== null) return `${firefox[1]}行目の${firefox[2]}文字目付近で${syntax}`;
  const v8 = /at position (\d+)(?: \(line (\d+) column (\d+)\))?$/.exec(error.message);
  if (v8 === null) return syntax;
  if (v8[2] !== undefined) return `${v8[2]}行目の${v8[3]}文字目付近で${syntax}`;
  const position = v8;
  const before = text.slice(0, Math.min(Number(position[1]), text.length)).split('\n');
  return `${before.length}行目の${before[before.length - 1].length + 1}文字目付近で${syntax}`;
}
