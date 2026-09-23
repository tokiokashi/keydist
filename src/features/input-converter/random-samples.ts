import { SAMPLE_TEXT_JA } from '../../sample-text-ja.ts';

const PHRASE_MIN_LENGTH = 5;
const PHRASE_MAX_LENGTH = 15;

/**
 * SAMPLE_TEXT_JA はかなだけで書かれているため、Intl.Segmenter の word 境界は
 * 「しごと」→「し / ごと」のように一般的な語境界と一致しない場合がある。
 * 単語ボタンは、元サンプルに実際に含まれる日常語を短い固定リストで持つ。
 */
export const COMMON_WORD_SAMPLES_JA = [
  'あさ',
  'まど',
  'ひかり',
  'へや',
  'きょう',
  'よてい',
  'かばん',
  'しごと',
  'がくしゅう',
  'もくひょう',
  'じゅんばん',
  'もんだい',
  'そうだん',
  'みかた',
  'ひるやすみ',
  'おちゃ',
  'こうえん',
  'こども',
  'しゃしん',
  'ほん',
  'はっけん',
  'みち',
  'みせ',
  'ほうほう',
  'じょうほう',
  'いけん',
  'しりょう',
  'しつもん',
  'こたえ',
  'でんわ',
  'めっせーじ',
  'あいて',
  'ようてん',
  'ことば',
  'へんしん',
  'どうぐ',
  'じかん',
  'じょうけん',
  'しっぱい',
  'せいこう',
  'きろく',
  'やすみ',
  'まち',
  'にわ',
  'そら',
  'かぜ',
  'こころ',
  'ちえ',
  'りゆう',
  'こうどう',
  'くらし',
] as const;

export interface JapaneseInputSamplePools {
  readonly words: readonly string[];
  readonly phrases: readonly string[];
}

const codePointLength = (value: string): number => [...value].length;

export function buildJapaneseInputSamplePools(text: string): JapaneseInputSamplePools {
  const normalized = text.replace(/\s+/gu, '');
  const words = COMMON_WORD_SAMPLES_JA.filter((word) => normalized.includes(word));

  // 「文章」は長文を機械的に途中で切らず、元テキストの句読点・改行境界だけを使う。
  // 5〜15文字に収まる節だけでも既定サンプルから十分な候補数を得られる。
  const phrases = [...new Set(
    text
      .split(/[。！？!?、，,\n]+/u)
      .map((phrase) => phrase.replace(/\s+/gu, '').trim())
      .filter((phrase) => {
        const length = codePointLength(phrase);
        return length >= PHRASE_MIN_LENGTH && length <= PHRASE_MAX_LENGTH;
      }),
  )];

  return { words, phrases };
}

export function pickRandomSample(
  samples: readonly string[],
  current = '',
  random: () => number = Math.random,
): string {
  if (samples.length === 0) return '';
  const candidates = samples.length > 1
    ? samples.filter((sample) => sample !== current)
    : [...samples];
  const index = Math.min(
    candidates.length - 1,
    Math.floor(Math.max(0, random()) * candidates.length),
  );
  return candidates[index] ?? '';
}

export const JAPANESE_INPUT_SAMPLE_POOLS =
  buildJapaneseInputSamplePools(SAMPLE_TEXT_JA);
