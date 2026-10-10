import { defineOptions } from '#analyzers/options.ts';

/**
 * 入力方法Analyzerの解析設定。設定できる項目は無い。
 * 表示は配列の定義だけから決まり、テキストにも依らない。
 */
export const inputMethodOptions = defineOptions({});

export type InputMethodOptions = typeof inputMethodOptions.defaultOptions;

export const DEFAULT_INPUT_METHOD_OPTIONS: InputMethodOptions = inputMethodOptions.defaultOptions;
