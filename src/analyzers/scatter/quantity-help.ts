import type { TextLanguage } from '#input/text/language.ts';
import { comparisonColumnText, COMPARISON_UNIT_NOTE, type ComparisonColumnId } from '../comparison-column-text.ts';
import { isHandShareColumn, type ScatterAxes, type ScatterContour } from './axes.ts';
import { SCATTER_KIND_ORDER, SCATTER_KIND_STYLES } from './kinds.ts';

/**
 * 散布図の「図の見方」のⓘの中身。点の色と形、軸と細い線の量の名前と説明、3つの量の関係、50%の線の説明を出す。
 * 図の下のキャプションの文もここで組み立てる。
 * 量の名前と説明は比較表の列（`comparison-column-text.ts`）のものをそのまま使い、ここでは書き直さない。
 * Reactに依存させない（文の組み立てをunit testで検査するため）。
 */

/** 名前か説明に距離の単位uが出る列か。 */
export function mentionsUnit(column: ComparisonColumnId, language: TextLanguage): boolean {
  const { label, description } = comparisonColumnText(language)[column];
  return /(^|[^A-Za-z])u($|[^A-Za-z])/u.test(`${label}\n${description}`);
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

/** 図の下のキャプション。縦軸の量と横軸の量の関係。軸の量の名前は比較表の列と同じ。 */
export function scatterCaption(axes: ScatterAxes, language: TextLanguage): string {
  const text = comparisonColumnText(language);
  return `${text[axes.y].label}と${text[axes.x].label}の関係`;
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
  const text = comparisonColumnText(language);
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
      `${text.rightHandPressShare.label}は押したキーの数のうち右手の割合、${text.rightHandDistanceShare.label}は移動距離のうち右手のキーの分の割合で、どちらも同じキーを右手と左手に分けて数えた値から作っています。`,
    );
  }
  return notes;
}

export function scatterQuantityHelp(axes: ScatterAxes, contour: ScatterContour | undefined, language: TextLanguage): ScatterQuantityHelp {
  const text = comparisonColumnText(language);
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
        `細い線は、${text[contour.column].label}が同じになる位置を結んでいます。3つの量の関係は、${contour.relation}です。${conversion}線の上に値を書き、量の名前は凡例に示しています。`,
      );
    } else {
      notes.push(`${text[contour.column].label}を含む3つの量の関係は、${contour.relation}です。${conversion}`);
    }
  }
  notes.push(...centerLineNotes(axes, language));
  // 線を引かない組も、関係の文に線の量の名前が出るので、その量の単位を説明する
  const mentioned = quantities.map(({ column }) => column);
  if (contour !== undefined && !contour.drawsLines) mentioned.push(contour.column);
  if (mentioned.some((column) => mentionsUnit(column, language))) notes.push(COMPARISON_UNIT_NOTE);
  return {
    description,
    help: {
      notes,
      listLabel: '図の量',
      items: quantities.map(({ role, column }) => ({
        name: `${role}　${text[column].label}`,
        description: text[column].description,
      })),
    },
  };
}
