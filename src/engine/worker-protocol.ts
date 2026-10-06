import type { EngineSetMemberInput } from './request.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * メインスレッドとengineのWorkerの間で交わすメッセージ（構造化複製で運べる値だけ）。
 *
 * 関数を含むAnalyzerの定義は送らず、`definitionId`だけを送る。Worker側が同じidの定義を
 * 自分で持つ（`worker-handler.ts`の`EngineWorkerRegistry`）。解析設定`options`と解決済み
 * 入力は値だけで出来ているので、そのまま複製できる。
 */
export type EngineWorkerRequest =
  | { readonly id: number; readonly kind: 'trace'; readonly input: ResolvedInput }
  | {
      readonly id: number;
      readonly kind: 'extraction';
      readonly input: ResolvedInput;
      readonly definitionId: string;
      readonly options: unknown;
    }
  | {
      readonly id: number;
      readonly kind: 'set-extraction';
      readonly members: readonly EngineSetMemberInput[];
      readonly definitionId: string;
      readonly options: unknown;
    };

export type EngineWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  /**
   * 例外は複製できるとは限らないので、メッセージ文とstackの文字列だけを運ぶ
   * （画面の「詳細」に出す原文が、Workerの中の呼び出し位置を指すように）。
   */
  | { readonly id: number; readonly ok: false; readonly message: string; readonly stack?: string };
