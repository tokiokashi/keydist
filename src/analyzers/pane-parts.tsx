import type { ComponentType } from 'react';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { KeyDetails } from '#interpretation/key-detail.ts';
import type { Trace } from '#trace/generate.ts';
import type { InfoHelp } from '#ui/primitives/info-button.tsx';
import type { TargetMark } from '#ui/theme/target-marks.ts';
import type { SetAnalyzerDefinition, SingleAnalyzerDefinition } from './contract.ts';
import type { UrlOptionsCodec } from './options.ts';

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
  /** 短い説明に収まらない説明。あれば見出しのⓘは小窓ではなくモーダルを開く。 */
  readonly help?: InfoHelp;
  /** 本体の推奨幅 [rem]。省略すると既定（`recommended-width.ts`）。 */
  readonly recommendedWidthRem?: number;
  readonly Body: ComponentType<BodyProps>;
  readonly Settings: ComponentType<AnalyzerSettingsProps<Options>>;
  /** 解析設定の各項目の「既定値へ戻す」と、解析設定のヘッダーの「すべて初期値に戻す」（Workspaceは⋯の「解析設定を初期値に戻す」）の戻す先。 */
  readonly defaultOptions: Options;
  /** 対象の集合に属する、このAnalyzerだけの項目（比較表の基準）。 */
  readonly TargetItem?: ComponentType<AnalyzerTargetItemProps<TargetItemValue>>;
}

/**
 * 図のキーの選択（物理キーの単位）。選んだキーは、同じペインの図どうしと、同じ対象を映す別のペインでまとめて強調する。
 * ホストが持ち主で、本体は強調する側と、押された時に知らせる側だけを受け持つ。
 */
export interface KeySelectionProps {
  /** 選んでいる物理キー。無ければ `undefined` */
  readonly selectedKeyId: string | undefined;
  /** 図のキーを押した。`anchor` は押したキーの要素で、小窓を寄せる基準になる */
  readonly onKeyPress: (keyId: string, anchor: Element) => void;
  /** 選択を外す（キーにフォーカスがある間のEscape） */
  readonly onClear: () => void;
}

/**
 * 対象を1つ見るAnalyzer（Single）の本体に、ホストが渡すprops。どのSingleにも同じ形で渡し、
 * 使わないものは本体が受け取らなければよい。Singleのペインの組み立てはAnalyzerごとに分けず、
 * これを受ける`Body`だけが違う。
 */
export interface SingleBodyProps<Extracted, Options> {
  /**
   * 図のキーを選ぶ操作と、選んだキー。キーの詳細（`SingleAnalyzerPaneParts.keyDetailsOf`）を持つAnalyzerにだけ渡す。
   * 選択の持ち主と、クリックで開く小窓はホストが持つ。
   */
  readonly keySelection?: KeySelectionProps;
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly trace: Trace;
  readonly extracted: Extracted;
  readonly options: Options;
  /** 図のそばで開く表示の調整の書き込み先。解析設定と同じ1つの値を書き換える。 */
  readonly onOptionsChange: (next: Options) => void;
}

/**
 * Singleのホスト（単体ページ・Workspaceのペイン・ペイン本体）が引数に取る形。
 * 各Singleの`definition.tsx`がこの形のオブジェクトを1つexportし、ホストへ渡すだけで
 * 単体ページとWorkspaceのペインに載る。
 */
export interface SingleAnalyzerPaneParts<Options, Extracted>
  extends AnalyzerPaneParts<SingleAnalyzerDefinition<Options, Extracted>, Options, SingleBodyProps<Extracted, Options>> {
  /** 解析設定の共有リンクでの読み書き。`options.ts`の`defineOptions`の結果をそのまま渡す。 */
  readonly urlOptions: UrlOptionsCodec<Options>;
  /**
   * 抽出の結果から、キーの詳細（仕様 §11.11）を取り出す。持つAnalyzerだけが渡す。
   * 渡すと、ホストが図のキーの選択を本体へ渡し、キーを押した時の小窓を出す。
   */
  readonly keyDetailsOf?: (extracted: Extracted) => KeyDetails;
}

/**
 * 集合を見るAnalyzer（Set）の本体に、ホストが渡すprops。どのSetにも同じ形で渡し、使わないものは
 * 本体が受け取らなければよい。`RowContext`は行ごとの表示に使う値で、Analyzerごとに
 * `SetAnalyzerPaneParts.rowContext`が作る。
 */
export interface SetBodyProps<Extracted, Options, RowContext> {
  readonly extracted: Extracted;
  /** 表示順（対象keyの列）。ホストが持つ集合の並び順。 */
  readonly order: readonly string[];
  readonly rowContext: ReadonlyMap<string, RowContext>;
  /** 集合の基準にする対象key。`undefined`は「基準なし」。基準を使わない本体は読まない。 */
  readonly baselineTargetKey: string | undefined;
  readonly options: Options;
  /** 本体の中で開く表示の調整の書き込み先。解析設定と同じ1つの値を書き換える。 */
  readonly onOptionsChange: (next: Options) => void;
}

/** 行の文脈を作る時の、解決した配列・物理配列・指割当の名前。対象を解決できなかった行には無い。 */
export interface SetRowHeader {
  readonly layoutName: string;
  readonly shapeName: string;
  readonly fingerAssignmentName: string;
}

/** `SetAnalyzerPaneParts.rowContext`に渡す、集合のメンバー1つぶん。表示名や色はホストが集合に対して決めたもの。 */
export interface SetRowSource {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前。 */
  readonly fullName: string;
  /** 解決できた時だけある。 */
  readonly header: SetRowHeader | undefined;
  /** 集合が配った色。まだ配られていない間は`undefined`。 */
  readonly color: string | undefined;
  readonly mark: TargetMark | undefined;
}

/**
 * Setのホスト（単体ページ・Workspaceのペイン・ペイン本体）が引数に取る形。
 * 各Setの`definition.tsx`がこの形のオブジェクトを1つexportし、ホストへ渡すだけで
 * 単体ページとWorkspaceのペインに載る。
 */
export interface SetAnalyzerPaneParts<Options, Extracted, RowContext>
  extends AnalyzerPaneParts<
    SetAnalyzerDefinition<Options, Extracted>,
    Options,
    SetBodyProps<Extracted, Options, RowContext>,
    string | undefined
  > {
  /** 解析設定の共有リンクでの読み書き。`options.ts`の`defineOptions`の結果をそのまま渡す。 */
  readonly urlOptions: UrlOptionsCodec<Options>;
  /** 本体が行ごとに使う文脈を作る。`undefined`を返した行は本体へ渡さない。 */
  readonly rowContext: (source: SetRowSource) => RowContext | undefined;
  /**
   * 条件の要約・条件の編集・表示名の作り分けから除く項目のid。このAnalyzerが自分で振る軸など、
   * 全員に共通の軸として別に見せる項目を挙げる。
   */
  readonly conditionExcludeIds?: readonly string[];
}
