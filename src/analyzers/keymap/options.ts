import { defineOptions } from '#analyzers/options.ts';

/**
 * キーマップAnalyzerの解析設定。設定できる項目は無い。
 * 表示は配列の定義だけから決まり、テキストにも依らない。
 */
export const keymapOptions = defineOptions({});

export type KeymapOptions = typeof keymapOptions.defaultOptions;

export const DEFAULT_KEYMAP_OPTIONS: KeymapOptions = keymapOptions.defaultOptions;
