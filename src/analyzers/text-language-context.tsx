import { createContext, useContext } from 'react';
import type { TextLanguage } from '#input/text/language.ts';

/**
 * ペインが映すテキストの言語。数える単位の呼び名（`unit-words.ts`）を画面の文言に出し分ける本体と解析設定が読む。
 * ホストがペインの外側で与える。与えられていない場所（部品単体の描画など）は日本語として読む。
 */
const TextLanguageContext = createContext<TextLanguage>('ja');

export const TextLanguageProvider = TextLanguageContext.Provider;

export function useTextLanguage(): TextLanguage {
  return useContext(TextLanguageContext);
}
