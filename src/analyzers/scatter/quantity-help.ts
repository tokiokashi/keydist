import type { TextLanguage } from '#input/text/language.ts';
import { COMPARISON_COLUMN_FORMAT, comparisonColumnText, COMPARISON_UNIT_NOTE, type ComparisonColumnId } from '../comparison-column-text.ts';
import type { ComparisonRowValues } from '../comparison-column-values.ts';
import { isHandShareColumn, type ScatterAxes, type ScatterContour } from './axes.ts';
import { axisName, axisTitle, axisUnit, SCATTER_KANA_SCRIPT } from './axis-names.ts';
import { SCATTER_KIND_ORDER, SCATTER_KIND_STYLES } from './kinds.ts';

/**
 * 散布図の「図の見方」のⓘの中身。点の色と形、軸と細い線の量の名前と説明、3つの量の関係、50%の線の説明を出す。
 * 図の下のキャプションの文もここで組み立てる。
 * 量の呼び名は軸の名前（`axis-names.ts`）に統一し、量の説明は比較表の列（`comparison-column-text.ts`）のものをそのまま使う。
 * Reactに依存させない（文の組み立てをunit testで検査するため）。
 */

/** 軸の名前に距離の単位uが出る列か。単位の宣言（`axis-names.ts`）で決める。 */
export function mentionsUnit(column: ComparisonColumnId): boolean {
  const unit = axisUnit(column);
  return unit === 'u' || unit === '1/u';
}

/** `InfoButton`の`help`に渡せる形（`ui/primitives/info-button.tsx`の`InfoHelp`と同じ。純粋なファイルからはUIをimportできない）。 */
export interface ScatterHelp {
  readonly notes: readonly string[];
  readonly listLabel: string;
  readonly items: readonly { readonly name: string; readonly description: string }[];
}

export interface ScatterQuantityHelp {
  /** ⓘの先頭の文。点の色と形。 */
  readonly description: string;
  readonly help: ScatterHelp;
}

/** 点の読み取りの文。点の名前・横軸・縦軸の値と、細い線を引く組だけ線の量の値を出す。線の量の列が値を持たない対象には出さない。 */
export function readoutText(
  row: { readonly label: string; readonly fullName: string; readonly x: number; readonly y: number; readonly values: ComparisonRowValues },
  axes: ScatterAxes,
  contour: ScatterContour | undefined,
  language: TextLanguage,
): string {
  const parts = [
    row.fullName || row.label,
    `${axisName(axes.x, language)} ${COMPARISON_COLUMN_FORMAT[axes.x](row.x)}`,
    `${axisName(axes.y, language)} ${COMPARISON_COLUMN_FORMAT[axes.y](row.y)}`,
  ];
  if (contour?.drawsLines === true) {
    const value = contour.readoutAt(row.x, row.y, row.values[contour.column]);
    if (value !== undefined) parts.push(`${axisName(contour.column, language)} ${COMPARISON_COLUMN_FORMAT[contour.column](value)}`);
  }
  return parts.join('　');
}

/** 図の下のキャプション。縦軸の量と横軸の量の関係。量の名前は軸の名前から単位を除いたもの。 */
export function scatterCaption(axes: ScatterAxes, language: TextLanguage): string {
  return `${axisName(axes.y, language)}と${axisName(axes.x, language)}の関係`;
}

/** 左右の手で全体を分ける割合の軸が、どの数を数えた割合か。 */
function handShareSubject(column: ComparisonColumnId): string {
  return column === 'rightHandPressShare' ? '押すキーの数' : '距離';
}

/**
 * 50%の線の説明。左右の手で全体を分ける割合の列（右手キー率・右手距離率）を軸に取った時だけ。
 * 両軸がその列の時は、50%の線で分かれる4つの区画の読み方と、2軸が同じキーを左右に分けて数えた値であることも書く。
 * 区画の説明は軸の割り当てに従う（左上と右下は、2軸を入れ替えると入れ替わる）。
 */
function centerLineNotes(axes: ScatterAxes, language: TextLanguage): string[] {
  const onX = isHandShareColumn(axes.x);
  const onY = isHandShareColumn(axes.y);
  if (!onX && !onY) return [];
  const where = onX && onY ? '横軸と縦軸の50%の位置' : onX ? '横軸の50%の位置' : '縦軸の50%の位置';
  const notes = [`${where}に線を引いています。右手と左手が半分ずつになる、左右が均等の位置です。50%が軸の範囲の外にある時は引きません。`];
  if (onX && onY) {
    const x = handShareSubject(axes.x);
    const y = handShareSubject(axes.y);
    notes.push(
      `50%の線で図が4つの区画に分かれます。右上は${x}も${y}も右手寄り、左下はどちらも左手寄り、左上は${x}は左手が多いのに${y}は右手が多く、右下は${x}は右手が多いのに${y}は左手が多い区画です。`,
      `${axisName('rightHandPressShare', language)}は押したキーの数のうち右手の割合、${axisName('rightHandDistanceShare', language)}は移動距離のうち右手のキーの分の割合で、どちらも同じキーを右手と左手に分けて数えた値から作っています。`,
    );
  }
  return notes;
}

/**
 * 同じ手の続きの割合と同指率を軸に取った時の説明。2列を結ぶ恒等式は無いので線は引かないが、
 * 数え方と分母が違う別の量であることを書く。軸の順は問わない。
 */
function handFingerRateNotes(axes: ScatterAxes, language: TextLanguage): string[] {
  const columns = [axes.x, axes.y];
  if (!columns.includes('sameHandContinuationRate') || !columns.includes('sameFingerRate')) return [];
  return [
    `${axisName('sameHandContinuationRate', language)}と${axisName('sameFingerRate', language)}は、どちらも各アクションをどの手、どの指が打つかから作る割合です。数え方と分母が違い、2つを結ぶ関係式はありません。`,
  ];
}

/** 対数の目盛りで描いている時の説明。目盛りの数字の置き方と、細い線の読み方。 */
const LOG_SCALE_NOTE =
  '横軸と縦軸は対数の目盛りです。目盛りの間隔は値の差でなく比に比例し、2軸の積か比が一定の細い線は平行な直線になります。細い線の値の選び方は通常の目盛りと同じなので、線の間隔は等しくなりません。';

export function scatterQuantityHelp(
  axes: ScatterAxes,
  contour: ScatterContour | undefined,
  language: TextLanguage,
  logScale = false,
): ScatterQuantityHelp {
  // 列名は比較表で列を探す目印なので、比較表の見出しと同じ書き方で引く。説明は散布図の単位の語の書き方で読む
  const tableText = comparisonColumnText(language);
  const text = comparisonColumnText(language, SCATTER_KANA_SCRIPT);
  const description = `${SCATTER_KIND_ORDER.map((kind) => `${SCATTER_KIND_STYLES[kind].colorName}の${SCATTER_KIND_STYLES[kind].shapeName}は${SCATTER_KIND_STYLES[kind].label}`).join('、')}です。`;
  const quantities: { readonly role: string; readonly column: ComparisonColumnId }[] = [
    { role: '横軸', column: axes.x },
    { role: '縦軸', column: axes.y },
  ];
  const notes: string[] = [];
  if (contour !== undefined) {
    const conversion = contour.conversion === undefined ? '' : `${contour.conversion}です。`;
    if (contour.drawsLines) {
      quantities.push({ role: '細い線', column: contour.column });
      notes.push(
        `細い線は、${axisName(contour.column, language)}が同じになる位置を結んでいます。3つの量の関係は、${contour.relation}です。${conversion}線の上に値を書き、量の名前は凡例に示しています。`,
      );
    } else {
      notes.push(`${axisName(contour.column, language)}を含む3つの量の関係は、${contour.relation}です。${conversion}`);
    }
  }
  if (logScale) notes.push(LOG_SCALE_NOTE);
  notes.push(...handFingerRateNotes(axes, language));
  notes.push(...centerLineNotes(axes, language));
  // 線を引かない組も、関係の文に線の量の名前が出るので、その量の単位を説明する
  const mentioned = quantities.map(({ column }) => column);
  if (contour !== undefined && !contour.drawsLines) mentioned.push(contour.column);
  if (mentioned.some((column) => mentionsUnit(column))) notes.push(COMPARISON_UNIT_NOTE);
  return {
    description,
    help: {
      notes,
      listLabel: '図の量',
      // 軸の名前から比較表の列を探せるよう、説明の先頭に比較表の列名を添える
      items: quantities.map(({ role, column }) => ({
        name: `${role}　${axisTitle(column, language)}`,
        description: `比較表の列名は「${tableText[column].label}」。${text[column].description}`,
      })),
    },
  };
}
