import type { ComponentType } from 'react';

/**
 * Analyzerがペインに渡すもの（docs/architecture.md「Analyzerがペインに渡すもの」）。
 *
 * 各Analyzerの`definition.tsx`がこの形のオブジェクトを1つexportし、ホスト（`hosts/`）と
 * 名前を出す場所（ペインの見出し・個別画面のh1・routeの`<title>`）はここから読む。
 * 名前を各所に直書きすると、名前を変えた時にサイドバーと見出しで食い違うため。
 *
 * `contract.ts`（純粋）に置かないのは、componentの型がReactに依存するから。engineは
 * `definition`（純粋な部分）しか知らない（docs/architecture.md「依存の規則」）。
 *
 * 本体（`Body`）のpropsはAnalyzerごとに違う（単一対象はTraceとレイアウト、集合は
 * 行ごとの表示名と色）ので型引数で受ける。解析設定（`Settings`）は全Analyzerで同じ形に揃え、
 * 小窓に置くホストの処理をAnalyzerごとに分けずに済むようにする。
 */
export interface AnalyzerSettingsProps<Options> {
  readonly options: Options;
  readonly onOptionsChange: (next: Options) => void;
}

/** 対象の選択に差し込む項目に渡す、集合のメンバー1つぶん。表示名はホストが集合に対して計算したもの。 */
export interface AnalyzerTargetCandidate {
  readonly key: string;
  readonly label: string;
  readonly fullName: string;
}

export interface AnalyzerTargetItemProps<Value> {
  readonly value: Value;
  readonly candidates: readonly AnalyzerTargetCandidate[];
  readonly onChange: (next: Value) => void;
}

export interface AnalyzerPaneParts<Definition, Options, BodyProps, TargetItemValue = never> {
  /** engineが扱う純粋な部分（`contract.ts`の`defineSingleAnalyzer`/`defineSetAnalyzer`の結果）。 */
  readonly definition: Definition;
  /** 画面に出すAnalyzer名。 */
  readonly name: string;
  /** 何を描くかを1〜2文で。見出しのⓘで出す。操作の説明や経緯は書かない。 */
  readonly description: string;
  readonly Body: ComponentType<BodyProps>;
  readonly Settings: ComponentType<AnalyzerSettingsProps<Options>>;
  /** 解析設定の各項目の「既定値へ戻す」と、解析設定のヘッダーの「すべて初期値に戻す」（Workspaceは⋯の「解析設定を初期値に戻す」）の戻す先。 */
  readonly defaultOptions: Options;
  /** 対象の集合に属する、このAnalyzerだけの項目（比較表の基準）。 */
  readonly TargetItem?: ComponentType<AnalyzerTargetItemProps<TargetItemValue>>;
}
