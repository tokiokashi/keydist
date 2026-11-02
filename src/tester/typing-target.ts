import type { Layout } from '#input/layouts/types.ts';
import { applyBracketAliases } from '#input/text/bracket-alias.ts';
import { normalizeEvaluationHeading } from '#input/text/char-alias.ts';
import { romajiTypingCorrectness } from './live-romaji.ts';

/**
 * 練習テキストを打った時に画面へ出る文字列。
 * 配列が『』を自分の出力として持たない時は、評価と同じく「」の綴りで打つので、照合にはこの文字列を使う。
 * 全角形の記号の別名は、打った文字列との比較と逆引きの側で、期待と配列の出力の両方に当てる。
 */
export function expectedTextFor(layout: Pick<Layout, 'canonicalInputs' | 'romajiTable'>, practiceText: string): string {
  return applyBracketAliases(practiceText, layout);
}

export interface TypingTargetPresentation {
  readonly typed: readonly { readonly char: string; readonly correct: boolean }[];
  /** まだ打っていない部分。表示は元のテキストのまま。 */
  readonly remaining: readonly string[];
  /** 打った文字列が期待と完全に一致したか。 */
  readonly complete: boolean;
}

/** 打った文字列を、練習テキストの期待に照らした表示用の状態にする。 */
export function typingTargetPresentation(
  layout: Pick<Layout, 'canonicalInputs' | 'romajiTable'>,
  practiceText: string,
  typedText: string,
): TypingTargetPresentation {
  const expectedText = expectedTextFor(layout, practiceText);
  const target = Array.from(practiceText);
  const expected = Array.from(expectedText);
  const typed = Array.from(typedText);
  const romajiCorrectness = layout.romajiTable === undefined ? undefined : romajiTypingCorrectness(typedText, expectedText, layout.romajiTable);

  return {
    typed: typed.map((char, index) => ({
      char,
      correct:
        romajiCorrectness?.[index] ?? (expected[index] !== undefined && normalizeEvaluationHeading(expected[index]) === normalizeEvaluationHeading(char)),
    })),
    remaining: target.slice(typed.length),
    complete: practiceText.length > 0 && normalizeEvaluationHeading(typedText) === normalizeEvaluationHeading(expectedText),
  };
}
