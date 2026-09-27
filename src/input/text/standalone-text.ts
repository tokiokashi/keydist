import { detectTextLanguageSelection, resolveTextLanguage, type TextLanguage, type TextLanguageSelection } from './language.ts';
import { sampleText } from './samples.ts';

/**
 * 単体ページ全体で共有する「最後に使ったテキスト」（#544 §5「単体ページは全体で1つの
 * 『最後に使ったテキスト』を使う」）。テキスト本体と、その言語判定（自動判定 + 手動上書き）を
 * 1つの資産としてまとめる（`engine/commands.ts` の `KeydistAssets` に third asset として足す）。
 *
 * `input` 層はテキストの言語判定（`language.ts`）だけを知っていればよく、Setupやengineには
 * 触れない純粋な値なので、Setup資産（`SetupLibrary`）とは別の資産にする
 * （`engine/commands.ts` の `KeydistAssets` コメント「独立に読み書きできるものは新しいキーとして
 * 足す」の判断をそのまま踏襲する）。
 */
export interface StandaloneTextState {
  readonly text: string;
  readonly language: TextLanguageSelection;
}

/**
 * 初期値。サンプルの現代文かな入力を既定にする（AGENTS.md「先回りして足さない」の裏返しで、
 * 空文字列を初期値にすると単体ページを開いた瞬間に「テキストが空」というAnalyzerが
 * 扱いにくい状態から始まってしまうため、既存のサンプルテキストをそのまま使う）。
 */
export function initialStandaloneText(): StandaloneTextState {
  const text = sampleText('ja', 'modern');
  return { text, language: detectTextLanguageSelection(text) };
}

/**
 * テキストを差し替える。言語は新しいテキストに対して再判定し、手動上書きは引き継がない
 * （上書きは「このテキストは英語/日本語として扱ってほしい」という指定であり、
 * テキストそのものが変われば指定の対象が失われるため。#544 §5「自由入力は自動判定し、
 * 手動で直せる」の「直す」は同じテキストに対する操作という前提で読む）。
 */
export function withStandaloneText(current: StandaloneTextState, text: string): StandaloneTextState {
  if (text === current.text) return current;
  return { text, language: detectTextLanguageSelection(text) };
}

/** 言語判定の手動上書きを設定・解除する。`undefined`で自動判定へ戻す。 */
export function withStandaloneLanguageOverride(
  current: StandaloneTextState,
  override: TextLanguage | undefined,
): StandaloneTextState {
  if (current.language.override === override) return current;
  const language: TextLanguageSelection = override === undefined
    ? { detected: current.language.detected }
    : { detected: current.language.detected, override };
  return { ...current, language };
}

/** 実際に使う言語（`resolveTextLanguage`のショートハンド）。 */
export function standaloneTextLanguage(state: StandaloneTextState): TextLanguage {
  return resolveTextLanguage(state.language);
}
