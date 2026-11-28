/**
 * 表による解析と並べる、今の解析（評価に渡すテキストを頭から打鍵して集計する解析）の値の形。
 * 抽出（`ngram-table/current-extract.ts`）が作り、ホスト（`hosts/shared/panes/SetAnalyzerPane.tsx`）が状態にして本体へ渡す。
 * 定義は `spec/distance-model.md` §13.10。
 */

/** 今の解析で測れた、配列・Setup1件の値。 */
export interface CurrentAnalysisOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  /** 総移動距離 [u] */
  readonly totalDistance: number;
  /** 入力1かなあたりの移動距離 [u/かな]。入力かな数が0なら`undefined` */
  readonly perChar: number | undefined;
  /** 入力かな数 */
  readonly chars: number;
  /** 打てなかった文字の数 */
  readonly skipped: number;
  /** かなで数える先読み`N`（この行の値を測った条件） */
  readonly lookahead: number;
}

/** 今の解析の対象に解決できなかった行。表による解析の値は、この行があっても出す。 */
export interface CurrentAnalysisFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  /** 今の解析が対象を解決できなかった理由。比較表と同じ文 */
  readonly message: string;
}

export type CurrentAnalysisRow = CurrentAnalysisOkRow | CurrentAnalysisFailedRow;

export interface CurrentAnalysisExtracted {
  readonly rows: readonly CurrentAnalysisRow[];
}

/**
 * 本体へ渡す、今の解析の値の状態。表の元が選んだテキストでない時は、本体へ渡さない。
 * `loading`は計算を依頼してから値が届くまで、`failed`は計算そのものが失敗した時（対象ごとの失敗は`ready`の行に載る）。
 */
export type CurrentAnalysisState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly extracted: CurrentAnalysisExtracted };
