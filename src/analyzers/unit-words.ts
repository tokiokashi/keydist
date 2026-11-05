import type { TextLanguage } from '#input/text/language.ts';

/**
 * 数える単位の呼び名のうち、テキストの言語で変わるもの。
 * 日本語のテキストでは、入力かな数 `C`（仕様 §4.6・§11.4）の大半をかなが占めるので「かな」と呼ぶ。
 * 英語のテキストにはかなが無く、`C` は空白と句読点を含む字の数なので「字」と呼ぶ。
 * 画面の列名・軸名・単位の表記だけを出し分け、列のid・条件・保存形式は言語に依らない。
 */
export type KanaUnit = 'かな' | '字';

export function kanaUnitOf(language: TextLanguage): KanaUnit {
  return language === 'ja' ? 'かな' : '字';
}

/**
 * 入力かな数 `C` が何を数えた量かの説明。比較表の見出しのⓘに出す。
 * 日本語のテキストは前処理の後の字の数で、かなのほかにも数える字がある。英語のテキストは前処理をしないので、空白と句読点も含めてそのまま数える。
 */
export function inputUnitNoteOf(language: TextLanguage): string {
  const unit = kanaUnitOf(language);
  return language === 'ja'
    ? `${unit}数は、漢字を読みに直し、評価しない記号を取り除いた後のテキストの字の数です。大半はかなですが、「、」「。」「ー」・英数字・空白・改行なども数えます。`
    : `${unit}数は、テキストの字の数です。空白と句読点も数えます。`;
}
