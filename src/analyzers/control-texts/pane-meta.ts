import { CONTROL_CONDITIONS } from '#interpretation/control-comparison.ts';
import type { TextLanguage } from '#input/text/language.ts';
import { CONTROL_COLUMN_IDS } from '../comparison-column-values.ts';
import { comparisonColumnText, COMPARISON_UNIT_NOTE } from '../comparison-column-text.ts';
import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの`<title>`やサイドバーが名前だけを読むため）。
 */

/** 種の範囲の表記。例: 1〜20。 */
export const CONTROL_SEED_RANGE_TEXT = `${CONTROL_CONDITIONS.seedStart}〜${CONTROL_CONDITIONS.seedStart + CONTROL_CONDITIONS.seedCount - 1}`;

/** 行の名前。実文と、実文から作った対照テキストの2種類を取り違えないよう、対照であることを名前に含める。 */
export const CONTROL_ROW_LABEL = {
  actual: '実文',
  shuffled: '順序破壊（対照）',
  uniform: '一様ランダム（対照）',
} as const;

/** 表の上の条件の文。対照テキストの値が、評価に渡したテキストから作った対照テキストで測った値であることと、種の組を示す。 */
export const CONTROL_CONDITION_TEXT = `順序破壊と一様ランダムは、評価に渡したテキストから作った対照テキストで測った値です。種${CONTROL_SEED_RANGE_TEXT}の${CONTROL_CONDITIONS.seedCount}個の平均と母標準偏差で、乱数は${CONTROL_CONDITIONS.prng}です。`;

export const CONTROL_TEXTS_PANE_META = {
  name: '対照テキストとの比較',
  description:
    '評価に渡したテキストと、その並びを乱した対照テキストを、同じ配列・同じ条件で測った値を並べます。配列が、並びと頻度のどちらに合わせて組まれているかを読むための表です。',
  /**
   * 見出しのⓘから開く説明。対照テキストの作り方と、平均・標準偏差の定義、英語のテキストでの意味、列の説明を出す
   * （`docs/kana-chain-comparison.md`「対照テキストとの比較」の定義と対応する）。解析設定に依らない固定の文なので、Workspaceのペインの見出しからも開ける。
   */
  help: (language: TextLanguage) => {
    const text = comparisonColumnText(language);
    return {
      notes: [
        COMPARISON_UNIT_NOTE,
        '実文は、評価に渡したテキストをそのまま測った値です。',
        '順序破壊は、テキストをかなのまとまり（拗音と促音は割らない）に分け、まとまりの並びを入れ替えたテキストです。出てくるまとまりとその回数は実文と同じで、並びだけが変わります。',
        '一様ランダムは、実文に出てきたまとまりの種類を同じ確率で引いて、実文と同じ数だけ並べたテキストです。回数の偏りと並びの両方が実文と変わります。',
        `順序破壊と一様ランダムは、種${CONTROL_SEED_RANGE_TEXT}の${CONTROL_CONDITIONS.seedCount}個を同じ種の組で作ります。値は${CONTROL_CONDITIONS.seedCount}個の平均で、標準偏差は母標準偏差（分母は${CONTROL_CONDITIONS.seedCount}）です。乱数は${CONTROL_CONDITIONS.prng}です。同じテキストと条件からは、同じ値が出ます。`,
        '英語のテキストは、空白を含む1文字ずつを1つのまとまりとして扱います。語の並びではなく、文字の並びを乱した値です。',
        '実文と対照テキストの値の差で、配列の優劣は決まりません。',
      ],
      listLabel: '列の説明',
      items: CONTROL_COLUMN_IDS.map((id) => ({ name: text[id].label, description: text[id].description })),
    };
  },
  /** 列が多く横に並ぶので、他より広く取る。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;
