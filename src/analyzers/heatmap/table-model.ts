import type { PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import type { KeyDetail } from '#interpretation/key-detail.ts';
import type { BigramVector } from '../bigram-vectors.ts';
import type { FigureTableModel } from '../figure-table.ts';
import { heatmapCaptionOf } from '../heatmap-figure.ts';
import { drawnFlowVectors } from '../heatmap-flow.ts';
import { heatmapKeysInReadingOrder, type HeatmapDrawnKey } from '../heatmap-keys.ts';
import { keyName, shareText } from '../key-detail-view.ts';

/**
 * ヒートマップの値の表。図1枚につき、押下数の表と、2打鍵の線の表を作る。
 * 行の見出しは、図のキーのツールチップと同じ名前（刻印と物理キーの名前）。
 */

/** 表に出す割合が決まらない時（全押下が0）の文字。 */
const NO_SHARE_TEXT = '—';

/** 表が読む、図に渡しているものと同じ値。 */
interface HeatmapTableSource {
  /** 図の見出しの前半。省くと「打鍵頻度」だけ */
  readonly title?: string | undefined;
  /** 図に描くキー（`heatmapDrawnKeys`） */
  readonly drawnKeys: readonly HeatmapDrawnKey[];
  /** キーid → 刻印 */
  readonly legends: ReadonlyMap<string, string>;
  readonly standard: PhysicalKeyboardStandard | undefined;
}

/**
 * 押下数の表。行は図に描くキー全部（押下が0のキーと、配列が使わず枠だけで描くキーも含む）で、
 * 物理配列の上の段から、段の中は左から並べる。押下数は図のツールチップと同じ値（`detailOf`）、
 * 割合は全押下（`totalPresses`）に対するもの。配列が使わないキーは、図と同じく刻印を持たず押下は0。
 */
export function heatmapTableModel({
  title,
  drawnKeys,
  legends,
  standard,
  detailOf,
  totalPresses,
}: HeatmapTableSource & {
  readonly detailOf: (keyId: string) => KeyDetail | undefined;
  readonly totalPresses: number;
}): FigureTableModel {
  return {
    caption: heatmapCaptionOf(title),
    rowHeader: 'キー',
    columns: ['押下数', '全押下に対する割合'],
    rows: heatmapKeysInReadingOrder(drawnKeys).map(({ key, unused }) => {
      const presses = unused ? 0 : (detailOf(key.id)?.presses ?? 0);
      return {
        key: key.id,
        header: keyName(key.id, unused ? undefined : legends.get(key.id), standard),
        cells: [String(presses), shareText(presses, totalPresses) || NO_SHARE_TEXT],
      };
    }),
  };
}

/**
 * 2打鍵の線の表。行は図に描く線（前のキー→後のキー）で、列は線の太さの元になっている回数。
 * 図に描く線と同じ集合・同じ順（回数の多い順）。端のキーが図に描かれない組は、図と同じく含めない。
 */
export function heatmapFlowTableModel({
  title,
  drawnKeys,
  legends,
  standard,
  vectors,
  sourceLabel,
}: HeatmapTableSource & {
  readonly vectors: readonly BigramVector[];
  /** 線の組の種類の名前（`HEATMAP_FLOW_SOURCE_LABELS`） */
  readonly sourceLabel: string;
}): FigureTableModel {
  const drawnIds = new Set(drawnKeys.filter((item) => !item.unused).map((item) => item.key.id));
  const endpoint = (keyIds: readonly string[]) => keyIds.map((id) => keyName(id, legends.get(id), standard)).join('＋');
  return {
    caption: `${heatmapCaptionOf(title)}の2打鍵の線（${sourceLabel}）`,
    rowHeader: '前のキー → 後のキー',
    columns: ['回数'],
    rows: drawnFlowVectors(vectors, drawnIds).map((vector) => ({
      key: vector.id,
      header: `${endpoint(vector.fromKeyIds)} → ${endpoint(vector.toKeyIds)}`,
      cells: [String(vector.weight)],
    })),
  };
}
