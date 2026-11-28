import type { Layout } from '#input/layouts/types.ts';
import type { EngineSetMemberInput } from './request.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * メッセージの中の配列。表から作った配列（`input/layouts/table-identity.ts`）は数十MBあるので、配列そのものは送らない。
 * 最初の依頼は元の表（`table`。数百KB）を送り、Workerが同じ関数で配列を作って識別子ごとに持つ。2度目からは識別子だけを送る（`ref`）。
 * 識別子を持たない配列は、毎回そのまま送る（`layout`）。
 */
export type WireLayout =
  | { readonly layout: Layout }
  | { readonly table: { readonly layoutId: string; readonly identity: string; readonly source: unknown } }
  | { readonly ref: string };

/** メッセージの中の解決済み入力。`layout`だけを`WireLayout`に置き換えた形。 */
export type WireResolvedInput = Omit<ResolvedInput, 'layout'> & { readonly wireLayout: WireLayout };

/** メッセージの中の集合のメンバー。解決に成功したメンバーの入力だけが`WireResolvedInput`になる。 */
export interface WireSetMember {
  readonly target: EngineSetMemberInput['target'];
  readonly resolution: { readonly ok: true; readonly input: WireResolvedInput } | Extract<EngineSetMemberInput['resolution'], { ok: false }>;
}

/**
 * メインスレッドとengineのWorkerの間で交わすメッセージ（構造化複製で運べる値だけ）。
 *
 * 関数を含むAnalyzerの定義は送らず、`definitionId`だけを送る。Worker側が同じidの定義を
 * 自分で持つ（`worker-handler.ts`の`EngineWorkerRegistry`）。解析設定`options`と解決済み
 * 入力は値だけで出来ているので、そのまま複製できる。
 */
export type EngineWorkerRequest =
  | { readonly id: number; readonly kind: 'trace-summary'; readonly input: WireResolvedInput }
  | {
      readonly id: number;
      readonly kind: 'extraction';
      readonly input: WireResolvedInput;
      readonly definitionId: string;
      readonly options: unknown;
    }
  | {
      readonly id: number;
      readonly kind: 'set-extraction';
      readonly members: readonly WireSetMember[];
      readonly definitionId: string;
      readonly options: unknown;
    }
  | {
      /** 集合の抽出のうち、メンバー1件の`step`番目の段だけを求めて覚える（`SetAnalyzerWarmup`）。値は返さない。 */
      readonly id: number;
      readonly kind: 'set-warmup';
      readonly member: WireSetMember;
      readonly definitionId: string;
      readonly step: number;
    };

export type EngineWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  /**
   * 例外は複製できるとは限らないので、メッセージ文とstackの文字列だけを運ぶ
   * （画面の「詳細」に出す原文が、Workerの中の呼び出し位置を指すように）。
   */
  | { readonly id: number; readonly ok: false; readonly message: string; readonly stack?: string };
