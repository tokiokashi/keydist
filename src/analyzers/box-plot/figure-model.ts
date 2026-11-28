import type { BoxFigureRow, BoxRowContext } from '../box-figure-model.ts';
import type { BoxPlotExtracted, BoxPlotOkRow } from './extract.ts';

export * from '../box-figure-model.ts';

/**
 * 箱ひげ図の表示モデル（画面に依存しない純粋な関数）。
 * 抽出の行を対象の順に並べ、目盛りと図の座標を決める。順位・並べ替え・特定の配列の強調・基準の線は持たない。
 * 座標の単位は画面のpxで、図は測った幅をそのままSVGの座標の幅にする（文字の大きさを幅で変えない）。
 */

export interface BoxDisplayRow extends BoxFigureRow {
  readonly row: BoxPlotOkRow;
}

export interface BoxExcludedRow extends BoxRowContext {
  readonly status: 'computing' | 'failed' | 'no-value' | 'no-segmentation';
  readonly message: string;
}

/** 文節の数の示し方。全配列で同じテキストと区切りなら1つ、違う配列があれば配列ごと。 */
export type SegmentCountNote =
  | { readonly kind: 'shared'; readonly count: number }
  | { readonly kind: 'per-row'; readonly entries: readonly (BoxRowContext & { readonly count: number })[] };

export interface BoxPlotModel {
  /** 箱を描く行。対象の順 */
  readonly rows: readonly BoxDisplayRow[];
  /** 箱を描けない行。対象の順 */
  readonly excluded: readonly BoxExcludedRow[];
  /** 評価に渡したテキストまたは区切りが基準の対象と違う配列。対象の順 */
  readonly differentText: readonly BoxRowContext[];
  /** テキストと区切りを比べる基準にした対象 */
  readonly reference: BoxRowContext | undefined;
  /** 文節の数。箱を描く行が無ければ `undefined` */
  readonly segmentCounts: SegmentCountNote | undefined;
}

export const NO_VALUE_MESSAGE = '値を出せる文節がありません';
export const NO_SEGMENTATION_MESSAGE = '文節の区切りがないので、値を出しません。';
export const COMPUTING_MESSAGE = '計算中…';

export function boxPlotModel(extracted: BoxPlotExtracted, order: readonly string[], rowContext: ReadonlyMap<string, BoxRowContext>): BoxPlotModel {
  const byKey = new Map(extracted.rows.map((row) => [row.targetKey, row] as const));
  const contextOf = (targetKey: string): BoxRowContext => ({
    targetKey,
    label: rowContext.get(targetKey)?.label ?? '—',
    fullName: rowContext.get(targetKey)?.fullName ?? '',
  });
  const rows: BoxDisplayRow[] = [];
  const excluded: BoxExcludedRow[] = [];
  const differentText: BoxRowContext[] = [];
  for (const targetKey of order) {
    const context = contextOf(targetKey);
    const row = byKey.get(targetKey);
    if (row === undefined) {
      // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、計算中と出す。
      excluded.push({ ...context, status: 'computing', message: COMPUTING_MESSAGE });
    } else if (row.kind === 'failed') {
      excluded.push({ ...context, status: 'failed', message: row.message });
    } else if (row.kind === 'no-segmentation') {
      excluded.push({ ...context, status: 'no-segmentation', message: NO_SEGMENTATION_MESSAGE });
    } else if (row.kind === 'no-value') {
      excluded.push({ ...context, status: 'no-value', message: NO_VALUE_MESSAGE });
    } else {
      rows.push({ ...context, row });
      if (!row.sameText) differentText.push(context);
    }
  }
  let segmentCounts: SegmentCountNote | undefined;
  if (rows.length > 0) {
    segmentCounts =
      differentText.length === 0
        ? { kind: 'shared', count: rows[0]!.row.box.count }
        : {
            kind: 'per-row',
            entries: rows.map((row) => ({ targetKey: row.targetKey, label: row.label, fullName: row.fullName, count: row.row.box.count })),
          };
  }
  const referenceKey = extracted.referenceTargetKey;
  return { rows, excluded, differentText, reference: referenceKey === undefined ? undefined : contextOf(referenceKey), segmentCounts };
}

/** ペインどうしで目盛りを揃えるキー（`docs/architecture.md`「ペインどうしで揃える目盛り」）。見る量は1つだけ。 */
export const BOX_PLOT_SCALE_KEY = 'box-plot:segment-per-char';
