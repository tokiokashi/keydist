/**
 * Setup（docs/architecture.md 用語表）。計算の単位 = 配列 × 物理配列 × ポリシー。
 *
 * ユーザーが保存するのは「配列・物理配列・Setup固有の上書き」の3つだけ。
 * このうち上書きは、この型ではなくカスケードの `setup` レベル（`CascadeOverrides.setup[id]`）
 * に置く。理由は overrides.ts の先頭コメントにまとめてある。そのため `Setup` 自身は
 * ポリシーの値もTraceも持たない。ポリシーの実効値はカスケードから、Traceは
 * Setup + テキストから求める。
 *
 * mode（en/ja）は持たない（docs/architecture.mdの「使わない語」）。Setupがどのテキストに
 * 使えるかは打ち方の導出が、テキストの言語と配列から判断する。
 * 配列の実体だけでは打ち方は決まらない。qwerty 等は英語の直接入力とローマ字の両方で
 * 同じ id を使い、`LAYOUT_BY_ID` はローマ字表付きの実体を返すため、`Layout.romajiTable` の
 * 有無は「ローマ字が選択肢になりうる」ことしか表さない。配列と打ち方の対応は現状の実装が
 * 暫定のもので、打ち方の導出の項目で作り直す前提なので、Setupには打ち方を持たせない。
 */
export interface Setup {
  readonly id: string;
  /**
   * 作成時に決めて固定する番号（1始まり）。名前が衝突した時の「Setup n」に使う。
   * 一覧の並び順から作ると、削除や並べ替えで同じSetupの番号が変わってしまう。
   * 番号は手持ちの最大＋1で付ける（`nextSetupNumber`）。他のSetupを削除・並べ替えても、
   * 画面上の番号は変わらない。最大の番号を消した直後に作ると、その番号が再び付く
   * （消した番号を覚えておく仕組みは持たない。保存・共有している参照が無いため）。
   */
  readonly number: number;
  readonly layoutId: string;
  readonly shapeId: string;
  /**
   * ユーザーが付けたラベル。名前は「配列名 + 物理配列名」から自動で付け、
   * 同名になる時だけユーザーがラベルを付ける。表示名の決め方は naming.ts。
   */
  readonly label?: string;
}

/**
 * Setupの新規idを払い出す関数。`input` は純粋層で `crypto.randomUUID` 等のブラウザ/Node APIを
 * 直接使わない（AGENTS.md「計算部はDOMに依存させない」）ため、呼び出し側
 * （将来のコマンド層・app）が注入する。ユニークさの保証は呼び出し側の責任とする
 * （このモジュールは払い出されたidをそのまま使うだけで、衝突検出はしない）。
 */
export type SetupIdGenerator = () => string;
