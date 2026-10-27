import type { ComponentType, ReactNode } from 'react';
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
  readonly help?: InfoHelp | undefined;
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
 * 単体の画面でSingleの対象の図の下に並べる、Multiの集合の対象1つぶん。計算は、その対象をSingleで選んだ時と
 * 同じ経路（解決→抽出）を対象ごとに通した結果。表示名と色はホストが画面に並ぶ集合に対して決めたもの。
 */
export interface SetTargetFigure<Extracted> {
  readonly key: string;
  readonly label: string;
  /** 集合によらない完全な名前。 */
  readonly fullName: string;
  /** 集合が配った色。まだ配られていない間は`undefined`。 */
  readonly color: string | undefined;
  readonly mark: TargetMark | undefined;
  readonly state:
    | { readonly status: 'ready'; readonly layout: Layout; readonly geometry: Geometry; readonly extracted: Extracted }
    | { readonly status: 'computing' }
    /** `message`は画面にそのまま出せる文（このテキストで使えない配列など）。 */
    | { readonly status: 'failed'; readonly message: string };
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
  /**
   * Singleの対象の図の下に並べる、Multiの集合の対象（Singleの対象は除く）。単体の画面で、
   * `SingleAnalyzerPaneParts.standaloneSetTargets`を宣言したAnalyzerにだけ渡す。Workspaceのペインは渡さない。
   * 集合に並べる対象が無い時は渡さない。
   */
  readonly setTargets?: readonly SetTargetFigure<Extracted>[];
  /**
   * Multiの集合を選ぶ操作（ホストが値と結んだもの）。Singleの対象の図と`setTargets`の格子の間に置く。
   * `standaloneSetTargets`を宣言したAnalyzerの単体の画面で、ホストが集合への書き込み口を持つ時だけ渡す。
   * 集合に並べる対象が無い時も渡す。
   */
  readonly setTargetPicker?: ReactNode;
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly trace: Trace;
  readonly extracted: Extracted;
  readonly options: Options;
  /** 文節の区切りを使う設定の時の、区切りの用意の状態。`SingleAnalyzerPaneParts.usesSegmentation` を宣言したAnalyzerにだけ渡す。 */
  readonly segmentation?: SegmentationStatus;
  /** 図のそばで開く表示の調整の書き込み先。解析設定と同じ1つの値を書き換える。 */
  readonly onOptionsChange: (next: Options) => void;
  /**
   * 別のペインの図で押された文字位置へ移る操作（Workspace）。`SingleAnalyzerPaneParts.acceptsPlaybackSeek` を宣言したAnalyzerにだけ渡す。
   * 操作のたびに`revision`が増え、このペインが宛先の時だけ`charPosition`がある。
   */
  readonly playbackSeek?: PlaybackSeekDelivery;
  /**
   * 開いた時の最初の文字位置（個別画面。別の画面の図から開いた時）。`acceptsPlaybackSeek` を宣言したAnalyzerにだけ渡す。
   * 本体を最初に描く時にだけ読む。
   */
  readonly initialCharPosition?: number;
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
  /**
   * 単体の画面で、Singleの対象の図の下にMultiの集合の対象を並べることの宣言。持つAnalyzerだけが渡す。
   * 渡すと、単体の画面のホストが集合の対象を追加で計算して本体へ`setTargets`で渡し、
   * 並べる対象がある間だけペインの幅の上限を`recommendedWidthRem`に広げる。
   * 単体の画面のホストが集合への書き込み口を渡す時は、格子の上に集合を選ぶ操作も出す（`setTargetPicker`）。
   * Multiの集合は書き換えられる。Singleの値には書かない。
   */
  readonly standaloneSetTargets?: {
    /** 集合の対象を並べる間の、ペインの推奨幅 [rem]。 */
    readonly recommendedWidthRem: number;
  };
  /**
   * 条件の要約（閉じた1行・対象名の併記）に、基本の項目へ足して数える項目のid。このAnalyzerが読む条件だけを挙げる
   * （打鍵再生ならチェーン・アルペジオ）。挙げない項目は、モーダルの行としては編集できるが、
   * 読まない条件で測ったように読めないよう、要約には数えない。
   */
  readonly conditionExtraIds?: readonly string[];
  /**
   * 別の画面の図（Run Chart）で押された文字位置へ移れることの宣言。持つAnalyzerだけが立てる。
   * 立てると、Workspaceではホストが同じ対象を映すペインとして受け手に登録し、宛てられた操作を本体へ`playbackSeek`で渡す。
   * 個別画面では、開いた時の最初の文字位置（URLの `position`）を本体へ`initialCharPosition`で渡す。
   */
  readonly acceptsPlaybackSeek?: boolean;
  /**
   * 解析設定が文節の区切りを求めているか。持つAnalyzerだけが宣言する。
   * 求めている間だけ、ホストが分割器を読み込み、区切りを入力へ載せる（求めない設定では分割器に触れない）。
   */
  readonly usesSegmentation?: (options: Options) => boolean;
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
  /** 図で押した点の位置から打鍵再生へ移る手段。`SetAnalyzerPaneParts.jumpsToPlayback` を宣言したAnalyzerにだけ渡す。 */
  readonly playbackJump?: PlaybackJump;
  /** 文節の区切りを使う設定の時の、区切りの用意の状態。`SetAnalyzerPaneParts.usesSegmentation` を宣言したAnalyzerにだけ渡す。 */
  readonly segmentation?: SegmentationStatus;
}

/**
 * 文節の区切りの用意の状態。`unsupported` は日本語以外のテキスト（分割器は日本語のモデルだけを使う）、
 * `failed` は分割器を読み込めなかった時。どちらも区切りを使わずに計算する。
 */
export type SegmentationStatus = 'ready' | 'unsupported' | 'failed';

/** 別のペインの図で押された文字位置への移動を、打鍵再生のペインに伝える形。宛先でなければ `charPosition` は `undefined`（番号だけ進む）。 */
export interface PlaybackSeekDelivery {
  /** 操作のたびに増える。本体は、当てた番号と比べて新しい操作だけを当てる */
  readonly revision: number;
  readonly charPosition: number | undefined;
}

/**
 * 図で押した点の文字位置から、打鍵再生へ移る手段（ホストが渡す）。
 * 移り方は画面で違う。Workspaceは、同じ対象を映す打鍵再生のペインを動かす（`destination: 'pane'`）。
 * 個別画面は、その対象の打鍵再生の画面を、文字位置を最初の再生位置にして開く（`destination: 'page'`）。
 */
export interface PlaybackJump {
  readonly destination: 'pane' | 'page';
  /** 対象（`targetKey`）の打鍵再生へ移れるか。個別画面は常に移れる。Workspaceは、同じ対象を映す打鍵再生のペインがある時だけ。 */
  readonly available: (targetKey: string) => boolean;
  /** 対象の打鍵再生の、文字位置（評価に渡したテキストの文字位置。先頭が0）へ移る。 */
  readonly jump: (targetKey: string, charPosition: number) => void;
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
  extends AnalyzerPaneParts<SetAnalyzerDefinition<Options, Extracted>, Options, SetBodyProps<Extracted, Options, RowContext>, string | undefined> {
  /** 解析設定の共有リンクでの読み書き。`options.ts`の`defineOptions`の結果をそのまま渡す。 */
  readonly urlOptions: UrlOptionsCodec<Options>;
  /** 本体が行ごとに使う文脈を作る。`undefined`を返した行は本体へ渡さない。 */
  readonly rowContext: (source: SetRowSource) => RowContext | undefined;
  /**
   * 条件の要約・条件の編集・表示名の作り分けから除く項目のid。このAnalyzerが自分で振る軸など、
   * 全員に共通の軸として別に見せる項目を挙げる。
   */
  readonly conditionExcludeIds?: readonly string[];
  /**
   * Workspaceのペインで、画面に入るまで計算を始めない。計算が長く、いつも見ているとは限らないAnalyzerだけが立てる。
   * 個別画面は開いた時に計算する。
   */
  readonly computeOnlyWhenOnScreen?: boolean;
  /**
   * 図で押した点の位置から打鍵再生へ移ることの宣言。持つAnalyzerだけが立てる。
   * 立てると、ホストが移る手段を本体へ`playbackJump`で渡す。
   */
  readonly jumpsToPlayback?: boolean;
  /**
   * 解析設定が文節の区切りを求めているか。持つAnalyzerだけが宣言する。
   * 求めている間だけ、ホストが分割器を読み込み、区切りを入力へ載せる（求めない設定では分割器に触れない）。
   */
  readonly usesSegmentation?: (options: Options) => boolean;
}
