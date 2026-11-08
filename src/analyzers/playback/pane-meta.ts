import type { TextLanguage } from '#input/text/language.ts';
import { kanaUnitOf } from '../unit-words.ts';

/**
 * 画面に出す名前と短い説明（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * `definition.tsx` を読み込まずに名前だけ読めるよう、ReactにもCSSにも依存させない。
 */
export const PLAYBACK_PANE_META = {
  name: '打鍵再生',
  description:
    '同じテキストを打つ様子を、配列図の上で1アクションずつ再生します。指の位置、これから押すキー、押したキーの履歴、入力の進み方を重ねて見られます。',
  /** 見出しのⓘから開く説明。解析設定や表示の設定で読み違えると、速度や距離の数値を誤る規則だけを置く。 */
  help: (language: TextLanguage) => ({
    notes: [],
    listLabel: '設定の説明',
    items: [
      { name: '平均の方式', description: 'SMAは直近のアクションの単純な平均、EWMAは古いアクションほど寄与を時間で減らす平均です。' },
      {
        name: '押下予定キー',
        description: `今の入力の残りを、先読みNで決まる${kanaUnitOf(language)}数先までの分だけ出します。先読みNは条件で変え、距離の計算にも使う値なので、変えると距離の数値も変わります。`,
      },
      {
        name: '入力の行にローマ字を表示',
        description: 'ローマ字の規則を持つ配列でだけ変わります。オンの間は、状態の行の「打鍵」と「予定」は出ません。',
      },
    ],
  }),
  /** 操作・状態の行と配列図が読める高さ [rem]（`analyzers/min-body-height.ts`）。 */
  minBodyHeightRem: 22,
} as const;
