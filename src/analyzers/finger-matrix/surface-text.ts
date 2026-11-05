import type { TextLanguage } from '#input/text/language.ts';
import { kanaUnitOf } from '../unit-words.ts';
import type { FingerMatrixSurfaceId } from './options.ts';

/**
 * 面（見る量）の名前・単位・説明。面の選択肢（`definition.tsx`）と、見出しのⓘから開く説明（`pane-meta.ts`）の
 * 両方が読む。`pane-meta.ts`がReactにもCSSにもvalibotにも依存させないため、`options.ts`の定義からは分けて置く
 * （routeの`<title>`やサイドバーが名前を読むだけで、解析設定の定義が初期読み込みに入らないようにする）。
 * 説明は内部の語を使わず、READMEの「何を測るか」の言い方に合わせる。
 */
export interface FingerMatrixSurfaceText {
  /** 面の選択肢と表の見出しに出す名前。 */
  readonly label: string;
  /** 表の見出しに添える単位。 */
  readonly unit: string;
  /** ⓘの説明に、面の名前と組で出す文。 */
  readonly description: string;
}

function buildSurfaceText(language: TextLanguage): Readonly<Record<FingerMatrixSurfaceId, FingerMatrixSurfaceText>> {
  const k = kanaUnitOf(language);
  return {
    presses: {
      label: 'キー数',
      unit: `キー/${k}`,
      description: `指ごとに押したキーの数を、入力1${k}あたりで出します。同時押しで1本の指が複数のキーを押した時は、押したキーの数だけ数えます。`,
    },
    distance: {
      label: '移動距離',
      unit: `u/${k}`,
      description: `指ごとの総移動距離を、入力1${k}あたりで出します。`,
    },
    pairMean: {
      label: '指間距離の平均',
      unit: 'u',
      description:
        '同じ手で隣り合う2本の指の距離が、ホームに置いた時の間隔よりどれだけ開いたかの平均です。親指は含みません。ホームより近いと負になります。',
    },
    pairStdDev: {
      label: '指間距離の標準偏差',
      unit: 'u',
      description: '同じ手で隣り合う2本の指の距離が、ホームに置いた時の間隔からどれだけばらついたかです。親指は含みません。',
    },
    sfbCount: {
      label: '同指連続の回数',
      unit: '回',
      description: '同じ指が、直前とは別のキーを続けて押した回数です。同じキーの連打は数えません。',
    },
    sfbRate: {
      label: '同指連続の比率',
      unit: '%',
      description:
        'その指で押した回数のうち、同指連続だった割合です。分母は「その指で押した回数」で、同時押しで1本の指が複数のキーを押しても1回と数えます。そのため、キー数の面の分母（押したキーの数）とは違う数です。',
    },
    sfbShare: {
      label: '同指連続の割合',
      unit: '%',
      description: '全体の同指連続のうち、その指が占める割合です。',
    },
  };
}

const SURFACE_TEXT_BY_LANGUAGE: Readonly<Record<TextLanguage, Readonly<Record<FingerMatrixSurfaceId, FingerMatrixSurfaceText>>>> = {
  ja: buildSurfaceText('ja'),
  en: buildSurfaceText('en'),
};

/** テキストの言語に合わせた面の名前・単位・説明。 */
export function fingerMatrixSurfaceText(language: TextLanguage): Readonly<Record<FingerMatrixSurfaceId, FingerMatrixSurfaceText>> {
  return SURFACE_TEXT_BY_LANGUAGE[language];
}
