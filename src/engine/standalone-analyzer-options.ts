/**
 * 単体ページの「Analyzerごとの最後に使った解析設定」（#544指示書「解析設定は資産として
 * 個人で保持する」）。Analyzer id → その解析設定という外部キーで引くrecord。
 *
 * 中身の値（各Analyzerの`Options`型。`analyzers/contract.ts`）はAnalyzerごとに違う形を
 * 持つが、`engine`はAnalyzerの契約（`analyzers/contract.ts`、unit無し）だけしかimportできず、
 * 個別のAnalyzer（`analyzers/bigram-flow/`等）の`Options`型・`decodeOptions`へは
 * 依存できない（依存の規則、`test/architecture-layers.test.ts`）。そのため、ここでは
 * 値を`unknown`のまま持つ。実際の型付き読み書き（各Analyzerの`definition.decodeOptions`を
 * 呼ぶところ）は、個別のAnalyzerを既にimportしている`hosts/standalone`が担う
 * （`engine/commands.ts`の`KeydistAssets`コメントにある「独立に読み書きできるものは
 * 新しいキーとして足す」の判断を、値の型もengineからは踏み込まない形へ広げたもの）。
 */
export type StandaloneAnalyzerOptionsState = Readonly<Record<string, unknown>>;

export function initialStandaloneAnalyzerOptions(): StandaloneAnalyzerOptionsState {
  return {};
}

/** 1 Analyzerぶんの設定を読む。保存が無ければ`undefined`（呼び出し側が既定値へ decode する）。 */
export function standaloneAnalyzerOptionsFor(
  state: StandaloneAnalyzerOptionsState,
  analyzerId: string,
): unknown {
  return Object.hasOwn(state, analyzerId) ? state[analyzerId] : undefined;
}

/**
 * 1 Analyzerぶんの設定を書き換える。値が変わらなければ同じ参照を返す
 * （`applyCommand`のObject.is判定に乗せるため。#544 §8-2）。
 *
 * 比較は`JSON.stringify`による構造比較にする: 各Analyzerの`Options`は
 * `decodeOptions(raw: unknown, ...)`でJSON由来の値からdecodeできる契約
 * （`analyzers/contract.ts`）なので、関数・Date・Mapのような非JSON値を持たない
 * プレーンなオブジェクトである前提が既にある。JSON化した文字列が一致すれば
 * 値として同一とみなしてよい（フィールドの列挙順は各Analyzerのoptions.tsが
 * 常に同じ順で組み立てる前提。実測でも`{...options, x: next}`という書き方は
 * 既存キーの順序を保つ）。
 *
 * `analyzerId`を`{...current, [analyzerId]: options}`という計算プロパティで書き込む形は、
 * `analyzerId`が仮に`"__proto__"`であっても安全（オブジェクトリテラルの計算プロパティは
 * `[[DefineOwnProperty]]`を使い、bracket代入の`[[Set]]`のような例外的setterを踏まない。
 * `input/settings/overrides.ts`冒頭コメント参照）。ここでの`analyzerId`はこのアプリ自身が
 * 登録したAnalyzerの`definition.id`（`hosts/standalone`が定数として渡す）であり、
 * 外部由来の任意文字列ではないため、そもそも予約名を警戒する必要も無い
 * （外部由来の値を検査するのはcodec側の役目。`standalone-analyzer-options-codec.ts`）。
 */
export function withStandaloneAnalyzerOptions(
  current: StandaloneAnalyzerOptionsState,
  analyzerId: string,
  options: unknown,
): StandaloneAnalyzerOptionsState {
  const existing = standaloneAnalyzerOptionsFor(current, analyzerId);
  if (existing !== undefined && JSON.stringify(existing) === JSON.stringify(options)) return current;
  return { ...current, [analyzerId]: options };
}
