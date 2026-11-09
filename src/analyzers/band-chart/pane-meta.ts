import type { TextLanguage } from '#input/text/language.ts';
import type { BandQuantityId } from '#interpretation/band-quantities.ts';
import { WIDE_RECOMMENDED_WIDTH_REM } from '../recommended-width.ts';
import { kanaUnitOf } from '../unit-words.ts';
import { VISIBLE_TEXT_NOTE } from '../visible-text.ts';
import { BAND_QUANTITIES, BAND_QUANTITY_LIST, bandCaption } from './quantities.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * Reactにもcssにも依存させない（routeの `<title>` やサイドバーが名前だけを読むため）。
 */

/** 見出しのⓘに出す、量ごとの「何の割合か」。 */
function quantityDescription(id: BandQuantityId, unit: string): string {
  switch (id) {
    case 'distance':
      return `${unit}の数のうち、1${unit}換算の移動距離が各区分に入る${unit}の割合です。`;
    case 'action':
      return `${unit}の数のうち、その${unit}を含む打鍵のまとまりの打ち方が各区分に入る${unit}の割合です。`;
    case 'presses':
      return `${unit}の数のうち、その${unit}を含む打鍵のまとまりの押下数が各区分に入る${unit}の割合です。`;
    case 'hand':
      return `${unit}の数のうち、その${unit}を含む打鍵のまとまりで使う手が各区分に入る${unit}の割合です。`;
    case 'row':
      return '押下の数のうち、押したキーの段が各区分に入る押下の割合です。';
    case 'fingerPresses':
      return '押下の数のうち、各指の押下の割合です。';
    case 'fingerDistance':
      return '移動距離の合計のうち、各指の移動距離の割合です。';
  }
}

/** 区分ごとの説明。 */
function bandDescription(id: BandQuantityId, name: string, unit: string): string {
  switch (id) {
    case 'distance':
      return `1${unit}換算の移動距離が${name}の${unit}の割合です。`;
    case 'action':
      return `${unit}を打つ打ち方が「${name}」の${unit}の割合です。`;
    case 'presses':
      return `${unit}を打つ押下数が${name}の${unit}の割合です。`;
    case 'hand':
      return `${unit}を打つ打鍵のまとまりの手が「${name}」の${unit}の割合です。`;
    case 'row':
      return name === '親指' ? '親指が押した押下の割合です。' : `${name}のキーを押した押下の割合です。`;
    case 'fingerPresses':
      return `${name}の押下の割合です。`;
    case 'fingerDistance':
      return `${name}の移動距離が、移動距離の合計に占める割合です。`;
  }
}

/** かなを標本にする量の、標本と分母と打鍵のまとまりの説明。 */
function kanaSampleNote(unit: string): string {
  return `標本は評価に渡したテキストの1${unit}で、割合の分母は数えた${unit}の数です。1${unit}の値は、その${unit}を含む打鍵のまとまりの値です。打鍵のまとまりは、ステップが覆う${unit}の範囲が重なるものを1つにまとめたもので、ローマ字入力の「きょ」をkyoと打つ時は2${unit}と3つのステップが1つになります。まとまりが覆う${unit}は、どれも同じ区分に入ります。確定の打鍵も、実際に押すキーなので数えます。`;
}

/** 押下を標本にする量の、標本と分母の説明。 */
const PRESS_SAMPLE_NOTE =
  '標本は押下1つで、割合の分母は数えた押下の数です。同時に押したキーも、1本の指でキーの間を押す時も、キーの数だけ押下を数えます。確定の打鍵も、実際に押すキーなので数えます。';

/** 標本と分母、区分の決め方の説明（量ごと）。 */
function definitionNotes(id: BandQuantityId, unit: string): readonly string[] {
  switch (id) {
    case 'distance':
      return [
        kanaSampleNote(unit),
        `区分は、打鍵のまとまりの移動距離の和を、まとまりが覆う${unit}の数で割った1${unit}換算の移動距離 [u] で決めます。境目は0.5u、1.5u、2.5uで、1キー分の距離が1uなので、その半分の刻みです。どの物理配列でも同じ値を使い、境目ちょうどの距離は上の区分に入ります。`,
      ];
    case 'action':
      return [
        kanaSampleNote(unit),
        '打ち方は、打鍵のまとまりのステップが1つで押下が1つなら単打、ステップが1つで押下が2つ以上なら同時押し、ステップが2つなら2アクション、3つ以上なら3アクション以上です。',
      ];
    case 'presses':
      return [
        kanaSampleNote(unit),
        '押下数は、打鍵のまとまりで押すキーの数です。同時に押したキーも、1本の指でキーの間を押す時も、キーの数だけ数えます。',
      ];
    case 'hand':
      return [
        kanaSampleNote(unit),
        '手は、打鍵のまとまりの押下の指が左右のどちらの手かで決めます。親指は、その親指の手に数えます。押下が左手なら左手、右手なら右手です。両方の手の押下がある時は、1つのステップの中に左右の押下があれば両手同時、どのステップも片手の押下だけなら両手順次です。前置シフトのように押下が複数のステップに分かれる時も、まとまり全体の押下の手で決めます。',
      ];
    case 'row':
      return [PRESS_SAMPLE_NOTE, '段は、親指が押したキーを「親指」に、それ以外のキーを物理配列の段（数字段・上段・中段・下段）に分けます。'];
    case 'fingerPresses':
      return [PRESS_SAMPLE_NOTE, '指は、左小指から右小指の順に並べます。'];
    case 'fingerDistance':
      return [
        '標本は押下の移動距離 [u] で、割合の分母は数えた移動距離の合計です。各押下の移動距離を指ごとに足します。指ごとの比較の移動距離を、配列の中の割合にした量です。',
        '親指キーが片手に1つの物理配列では、親指が親指キーだけを打つ間の移動距離が0になります。確定の打鍵の移動距離も数えます。',
      ];
  }
}

/** 凡例の説明。 */
const LEGEND_NOTE = '凡例は、表示中の配列に出てくる区分だけを並べます。';

/** 帯の中の数の説明。 */
const SEGMENT_TEXT_NOTE = '帯の中の数は整数に丸めた割合で、区分の幅が狭く入らない時は書きません。';

function colorNote(id: BandQuantityId): string {
  switch (id) {
    case 'distance':
    case 'action':
    case 'presses':
      return `帯の色は1色の濃淡で、値の大きい区分ほど強い色にしています（ライトでは濃く、ダークでは明るくなります）。${SEGMENT_TEXT_NOTE}`;
    case 'row':
      return `数字段から下段までは1色の濃淡で、親指だけ別の色です。${SEGMENT_TEXT_NOTE}`;
    case 'hand':
      return `左手は緑、右手は紫、両手の2区分は橙の濃淡で分けています。${SEGMENT_TEXT_NOTE}`;
    case 'fingerPresses':
    case 'fingerDistance':
      return `左手の指は緑、右手の指は紫の濃淡で、手の中では親指から小指へ濃淡が変わります。${SEGMENT_TEXT_NOTE}`;
  }
}

/** 見出しのⓘに出す説明の形（`#ui/primitives/info-button.tsx` の `InfoHelp` と同じ。この純粋なファイルは `ui/` を読まない）。 */
export interface BandChartHelp {
  readonly notes: readonly string[];
  readonly listLabel: string;
  readonly items: readonly { readonly name: string; readonly description: string }[];
}

/** 見出しのⓘから開く、選んだ量の説明（図の見方）。 */
export function bandChartHelp(id: BandQuantityId, language: TextLanguage): BandChartHelp {
  const unit = kanaUnitOf(language);
  const quantity = BAND_QUANTITIES[id];
  const skippedNote = `打てない文字を覆う打鍵のまとまりは、${unit}も、そのステップの押下と移動距離も数えません。打てない文字は距離が0で、数えると最も小さい区分の割合が大きく見えるためです。ローマ字入力で一部の英字だけ打てた${unit}も、数えません。打てない文字は、配列ごとに文字と回数を図の下の表に出します。${VISIBLE_TEXT_NOTE}`;
  return {
    notes: [`量は、${bandCaption(id, language)}です。`, ...definitionNotes(id, unit), skippedNote, colorNote(id), LEGEND_NOTE],
    listLabel: '区分',
    items: quantity.labels.map((name) => ({ name, description: bandDescription(id, name, unit) })),
  };
}

export const BAND_CHART_PANE_META = {
  name: '帯グラフ',
  description: '選んだ配列やSetupで同じテキストを打った時の、選んだ量の区分ごとの割合を、配列ごとの1本の帯で並べます。',
  /** 見出しのⓘから開く説明。量によらない固定の文だけを置く。選んだ量の標本と区分は、図の見方（`bandChartHelp`）に出す。 */
  help: (language: TextLanguage) => {
    const unit = kanaUnitOf(language);
    return {
      notes: [
        '全体を100%にした区分の割合を、配列ごとに1本の帯で並べます。帯に出す量は7つあり、標本・分母・区分は量ごとに違います。',
        '行の順は対象の順で、値で並べ替えません。特定の配列を色や太さで目立たせません。',
      ],
      listLabel: '量',
      items: BAND_QUANTITY_LIST.map((quantity) => ({ name: quantity.name, description: quantityDescription(quantity.id, unit) })),
    } satisfies BandChartHelp;
  },
  /** 名前と帯が横に並ぶ幅。 */
  recommendedWidthRem: WIDE_RECOMMENDED_WIDTH_REM,
} as const;
