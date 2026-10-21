import { Parser, jaModel } from 'budoux';

/**
 * 文節の分割器（BudouX、日本語のモデル）。ブラウザで動き、辞書やWorkerを持たない。
 * このモジュールは、文節の区切りを使う設定のペインが求めるまで読み込まない（`app/standalone/bunsetsu-source.ts`）。
 */

const parser = new Parser(jaModel);

/** テキストを文節の断片に分ける。連結すると原文に戻る。 */
export function splitBunsetsu(text: string): string[] {
  return parser.parse(text);
}
