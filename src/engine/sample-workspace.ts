import type { AnalysisTarget } from '#input/setup/index.ts';
import {
  addWorkspacePane,
  createWorkspace,
  followBinding,
  newOptionSetId,
  OWN_OPTIONS,
  sharedOptions,
  type LinkGroup,
  type OptionSet,
  type Workspace,
  type WorkspaceIdGenerator,
  type WorkspaceLibrary,
  type WorkspacePane,
} from './workspace.ts';
import type { GridColumnRange, GridSize } from './workspace-grid.ts';

/**
 * 中身入りのサンプルのWorkspace。空のWorkspaceでは何ができる画面か伝わりにくいので、
 * 比較表・N感度・Bigram Flowを並べた状態を用意する。トップからは新しいWorkspaceとして作り（`createSampleWorkspaceCommand`）、
 * 空のWorkspaceの中からは今のWorkspaceに入れる（`startWorkspaceFromSampleCommand`）。入れた後は普通のWorkspaceと同じ。
 *
 * 中身の定義はこのファイルの1か所に置く。作成は`createSampleWorkspaceCommand`（`workspace-commands.ts`）が
 * 既存のコマンドの経路に乗せる。Analyzerのidはこの層から`analyzers/<name>/`を読めないので文字列で持ち、
 * 組み込みに存在することは`hosts/workspace/sample-workspace.test.ts`が確かめる（idが変わったらそこで落ちる）。
 */
export const SAMPLE_WORKSPACE_NAME = 'サンプル';

export const SAMPLE_COMPARISON_ANALYZER_ID = 'comparison';
export const SAMPLE_N_SENSITIVITY_ANALYZER_ID = 'n-sensitivity';
export const SAMPLE_BIGRAM_FLOW_ANALYZER_ID = 'bigram-flow';
export const SAMPLE_FINGER_DISTANCE_ANALYZER_ID = 'finger-distance';

/** 比較表・N感度が見る対象（連動1の集合）。組み込みの配列のid。 */
export const SAMPLE_COMPARISON_LAYOUT_IDS: readonly string[] = [
  'qwerty',
  'dvorak',
  'oonishi',
  'naginata-v18',
  'shin-jis-prefix',
  'shingeta',
  'tsuki-2-263',
];

/** Bigram Flowの4つと指ごとの距離の4つが見る配列。並びの順に連動1〜4。 */
export const SAMPLE_BIGRAM_FLOW_LAYOUT_IDS: readonly string[] = ['qwerty', 'oonishi', 'tsuki-2-263', 'naginata-v18'];

/** サンプルのWorkspaceの条件（Workspaceのレベル）の既定の物理配列。全体の条件は書き換えない。 */
export const SAMPLE_DEFAULT_SHAPE_ID = 'split-ortholinear';

/** Bigram Flowの共有の解析設定。2打鍵の取り方を手の中だけにする（変えた項目だけを持つ）。 */
export const SAMPLE_BIGRAM_FLOW_OPTIONS = { source: 'within-hand' } as const;

/**
 * 並びの大きさ（24列）。上の段は比較表とN感度が横に並び（18 + 6列）、中の段は同じ幅（6列）のBigram Flow 4つ、
 * 下の段は同じ幅の指ごとの距離4つ。列の幅は面の幅に依らない固定なので、ペインの画素の幅も画面の幅に依らない
 * （6列は400px、18列は1216px）。24列の並びは1640pxで、FHDでサイドバーを固定して開いた面（1680px）に、
 * 縦のスクロールバーがあっても横にスクロールせずに収まる。
 * 比較表は列が多く広いほど表が収まり、N感度は6列（中の段の1つと同じ幅）で図・凡例・表が縦に収まる。
 * 高さは升目（1升は行28pxと間8pxで36px）単位で、上の段は2つで揃える。各ペインが中でスクロールせずに収まる最小の高さを、
 * 画面の幅1440・1920・2560のどれでも同じ値で実測して決めた。
 * - 上の段の9升: 比較表は7行の表全体、N感度は図・凡例・横軸のラベル・畳んだ表の見出しまでが収まる。
 * - 中の段の14升: Bigram FlowのKeyboard FlowとRelative vectorsが凡例まで収まる。
 * - 下の段の10升: 指ごとの距離の見出し・縦棒・指の名前・左手と右手の見出し・選んだ棒の文を出す欄までが、ペインの中でスクロールせずに収まる。
 *   ペインを足した時の既定の高さ（11升）より低い。
 * - 上の段と中の段を合わせて23升で、1920x930のサイドバー固定・非固定のどちらでも、この2段は1画面に入る。
 *   下の段まで含めるとページは33升になり、下の段を見るにはページを縦にスクロールする。
 *   930pxは、オーナーの1080のモニタで普通の窓に開いた時の表示領域（約930px）。
 *   全画面表示の1080pxで測ると、普通の窓では中の段が切れる。
 */
export const SAMPLE_COMPARISON_SIZE: GridSize = { w: 18, h: 9 };
export const SAMPLE_N_SENSITIVITY_SIZE: GridSize = { w: 6, h: 9 };
export const SAMPLE_LOWER_SIZE: GridSize = { w: 6, h: 14 };
export const SAMPLE_FINGER_DISTANCE_SIZE: GridSize = { w: 6, h: 10 };

/**
 * サンプルの比較表が出す列。表は18列の幅（SAMPLE_COMPARISON_SIZE）の中で横にスクロールせずに収まる列に絞る。
 * Bigram数の2列まで出すと幅が足りず、表の中で横にスクロールする。足りない列は解析設定で出せる。
 */
export const SAMPLE_COMPARISON_OPTIONS = {
  visibleColumns: [
    'actions',
    'totalUnits',
    'meanPerStroke',
    'perCharUnits',
    'perCharSteps',
    'perCharPresses',
    'singleTapLayerRate',
    'singleTapRate',
    'singleKeyRate',
    'sameFinger',
    'sameFingerRate',
    'adjacentMean',
    'adjacentStdDev',
    'rightHandDistanceShare',
    'rightHandPressShare',
  ],
};

/**
 * サンプルの並びが使う列の数。上の段（18 + 6）と中・下の段（6 × 4）がそろって右端になる幅。
 * FHDでサイドバーを固定して開いた面に、縦のスクロールバーがあっても横にスクロールせずに収まる
 * （収まることは`hosts/workspace/sample-workspace.test.ts`が検査する）。
 */
export const SAMPLE_GRID_COLS = 24;
const SAMPLE_RANGE: GridColumnRange = { start: 0, end: SAMPLE_GRID_COLS };

/**
 * 配列の詳細と比較のサンプル。1つの配列の詳細の段を上に、複数の配列の比較の段をその下に置く。
 * 全部のペインが1つの連動の組に従い、詳細の段は組の単体の対象（1つの配列）、比較の段は組の集合を見る。
 */
export const LAYOUT_DETAIL_WORKSPACE_NAME = '配列の詳細と比較';
export const SAMPLE_FINGER_MATRIX_ANALYZER_ID = 'finger-matrix';

/** 詳細の段が見る配列。比較の段の集合（`SAMPLE_COMPARISON_LAYOUT_IDS`）の中の1つで、層を持つ。 */
export const LAYOUT_DETAIL_LAYOUT_ID = 'tsuki-2-263';

/**
 * 並びの大きさ（24列）。詳細の段は、左に打鍵再生（8列）、右上にヒートマップ（レイヤー）（16列）、その下に
 * ヒートマップと指ごとの距離（移動距離）（8列ずつ）、さらに下に指ごとの距離（標準偏差）（8列）とBigram Flow（16列）。
 * 比較の段は、比較表とN感度が横に並び（18 + 6列）、その下に配列×指のマトリックス4つが2列で並ぶ（12列ずつ）。
 * 列の幅は面の幅に依らない固定なので、ペインの画素の幅も画面の幅に依らない（8列は536px、24列の並びは1640px）。
 * 24列の並びはFHDでサイドバーを固定して開いた面（1680px）に、縦のスクロールバーがあっても横にスクロールせずに収まる。
 * 高さは升目（1升は行28pxと間8pxで36px）単位。各ペインの中身がペインの中でスクロールせずに収まる最小の高さを、
 * 画面の幅2560で、その幅・高さのペインを縦に積んで実測して決めた（ペインの幅は画面の幅に依らないので、他の画面の幅でも同じ）。
 * 実測した最小の幅と高さ（列 × 升）:
 * - 打鍵再生: 8列で20升（6列では収まらない）。右隣の段の高さ（9 + 12）に揃えて21升。
 * - ヒートマップ（レイヤー）: 16列で9升（12列以下は図が縦に並ぶので15升）。
 * - ヒートマップ: 図が小さく、8列で収まる。高さは隣の指ごとの距離に揃えて12升。
 * - 指ごとの距離: 移動距離は8列で12升、標準偏差は8列で23升（見出し・縦棒・指の名前・左手と右手の見出し・選んだ棒の文を出す欄に加えて、6組の分布の図まで）。
 * - Bigram Flow: 16列で10升（Keyboard FlowとRelative vectorsが凡例まで）。左隣の指ごとの距離（標準偏差）の高さに揃えて23升。
 * - 比較表: 18列で9升。N感度: 6列の並びで9升（図・凡例・横軸のラベル・畳んだ表の見出しまで）。
 * - 配列×指のマトリックス: 12列で10升（押下数・移動距離は12列から、指間距離の平均・標準偏差は10列から横にスクロールせず収まる）。
 * 縦は収めない（詳細の段で44升、全体で73升）ので、下の段を見るにはページを縦にスクロールする。
 */
export const LAYOUT_DETAIL_PLAYBACK_SIZE: GridSize = { w: 8, h: 21 };
export const LAYOUT_DETAIL_HEATMAP_LAYERS_SIZE: GridSize = { w: 16, h: 9 };
export const LAYOUT_DETAIL_HEATMAP_SIZE: GridSize = { w: 8, h: 12 };
export const LAYOUT_DETAIL_FINGER_DISTANCE_SIZE: GridSize = { w: 8, h: 12 };
export const LAYOUT_DETAIL_FINGER_DISTANCE_STD_DEV_SIZE: GridSize = { w: 8, h: 23 };
export const LAYOUT_DETAIL_BIGRAM_FLOW_SIZE: GridSize = { w: 16, h: 23 };
export const LAYOUT_DETAIL_COMPARISON_SIZE: GridSize = { w: 18, h: 9 };
export const LAYOUT_DETAIL_N_SENSITIVITY_SIZE: GridSize = { w: 6, h: 9 };
export const LAYOUT_DETAIL_FINGER_MATRIX_SIZE: GridSize = { w: 12, h: 10 };

/** 配列の詳細と比較のサンプルが使う列の数。 */
export const LAYOUT_DETAIL_GRID_COLS = 24;
const LAYOUT_DETAIL_RANGE: GridColumnRange = { start: 0, end: LAYOUT_DETAIL_GRID_COLS };

const layoutTarget = (layoutId: string): AnalysisTarget => ({ kind: 'layout', layoutId });

function groupId(n: number): string {
  return `link-${n}`;
}

/** 用意してあるサンプルの種類。 */
export type SampleKind = 'overview' | 'layout-detail';

/** ペインを置く順番に並べる定義。`group`は`groupId`の番号で、`optionSet`があれば共有の解析設定に従う。 */
interface SamplePaneSpec {
  readonly analyzerId: string;
  /** 共有に従わないペインの、変えた項目だけの解析設定。 */
  readonly options?: unknown;
  readonly optionSet?: boolean;
  readonly group: number;
  readonly size: GridSize;
}

interface SampleDefinition {
  readonly name: string;
  readonly groups: readonly LinkGroup[];
  readonly optionSets: readonly OptionSet[];
  readonly panes: readonly SamplePaneSpec[];
  readonly range: GridColumnRange;
  /** 画面に出す名前。「〜を作る」「〜で始める」の前に付く。 */
  readonly label: string;
}

const OVERVIEW: SampleDefinition = {
  name: SAMPLE_WORKSPACE_NAME,
  label: '複数の配列を並べたサンプル',
  range: SAMPLE_RANGE,
  groups: SAMPLE_BIGRAM_FLOW_LAYOUT_IDS.map((layoutId, i) => ({
    id: groupId(i + 1),
    target: {
      single: { target: layoutTarget(layoutId) },
      set: i === 0 ? { targets: SAMPLE_COMPARISON_LAYOUT_IDS.map(layoutTarget), baseline: undefined } : { targets: [], baseline: undefined },
    },
  })),
  // Bigram Flowの4つは1つの共有の設定に従う（2打鍵の取り方を1か所で変えられる）。指ごとの距離の4つも1つの共有の設定
  // に従い、こちらは既定のまま始める
  optionSets: [
    {
      id: newOptionSetId({ optionSets: [] }, SAMPLE_BIGRAM_FLOW_ANALYZER_ID),
      analyzerId: SAMPLE_BIGRAM_FLOW_ANALYZER_ID,
      options: SAMPLE_BIGRAM_FLOW_OPTIONS,
    },
    { id: newOptionSetId({ optionSets: [] }, SAMPLE_FINGER_DISTANCE_ANALYZER_ID), analyzerId: SAMPLE_FINGER_DISTANCE_ANALYZER_ID, options: undefined },
  ],
  // 上の段は比較表とN感度の2つ、中の段はBigram Flowの4つ、下の段は指ごとの距離の4つが左から並ぶ
  panes: [
    { analyzerId: SAMPLE_COMPARISON_ANALYZER_ID, options: SAMPLE_COMPARISON_OPTIONS, group: 1, size: SAMPLE_COMPARISON_SIZE },
    { analyzerId: SAMPLE_N_SENSITIVITY_ANALYZER_ID, group: 1, size: SAMPLE_N_SENSITIVITY_SIZE },
    ...SAMPLE_BIGRAM_FLOW_LAYOUT_IDS.map(
      (_, i): SamplePaneSpec => ({ analyzerId: SAMPLE_BIGRAM_FLOW_ANALYZER_ID, optionSet: true, group: i + 1, size: SAMPLE_LOWER_SIZE }),
    ),
    ...SAMPLE_BIGRAM_FLOW_LAYOUT_IDS.map(
      (_, i): SamplePaneSpec => ({ analyzerId: SAMPLE_FINGER_DISTANCE_ANALYZER_ID, optionSet: true, group: i + 1, size: SAMPLE_FINGER_DISTANCE_SIZE }),
    ),
  ],
};

const LAYOUT_DETAIL: SampleDefinition = {
  name: LAYOUT_DETAIL_WORKSPACE_NAME,
  label: '配列の詳細と比較のサンプル',
  range: LAYOUT_DETAIL_RANGE,
  // 全部が1つの連動の組に従う。詳細の段のペインは単体の対象、比較の段のペインは集合を見る
  groups: [
    {
      id: groupId(1),
      target: {
        single: { target: layoutTarget(LAYOUT_DETAIL_LAYOUT_ID) },
        set: { targets: SAMPLE_COMPARISON_LAYOUT_IDS.map(layoutTarget), baseline: undefined },
      },
    },
  ],
  optionSets: [],
  panes: [
    { analyzerId: 'playback', group: 1, size: LAYOUT_DETAIL_PLAYBACK_SIZE },
    { analyzerId: 'heatmap-layers', group: 1, size: LAYOUT_DETAIL_HEATMAP_LAYERS_SIZE },
    { analyzerId: 'heatmap', group: 1, size: LAYOUT_DETAIL_HEATMAP_SIZE },
    { analyzerId: SAMPLE_FINGER_DISTANCE_ANALYZER_ID, group: 1, size: LAYOUT_DETAIL_FINGER_DISTANCE_SIZE },
    { analyzerId: SAMPLE_FINGER_DISTANCE_ANALYZER_ID, options: { chartMetric: 'stdDev' }, group: 1, size: LAYOUT_DETAIL_FINGER_DISTANCE_STD_DEV_SIZE },
    { analyzerId: SAMPLE_BIGRAM_FLOW_ANALYZER_ID, group: 1, size: LAYOUT_DETAIL_BIGRAM_FLOW_SIZE },
    { analyzerId: SAMPLE_COMPARISON_ANALYZER_ID, options: SAMPLE_COMPARISON_OPTIONS, group: 1, size: LAYOUT_DETAIL_COMPARISON_SIZE },
    { analyzerId: SAMPLE_N_SENSITIVITY_ANALYZER_ID, group: 1, size: LAYOUT_DETAIL_N_SENSITIVITY_SIZE },
    ...(['presses', 'distance', 'pairMean', 'pairStdDev'] as const).map(
      (surface): SamplePaneSpec => ({
        analyzerId: SAMPLE_FINGER_MATRIX_ANALYZER_ID,
        options: { surface },
        group: 1,
        size: LAYOUT_DETAIL_FINGER_MATRIX_SIZE,
      }),
    ),
  ],
};

const DEFINITIONS: Readonly<Record<SampleKind, SampleDefinition>> = { overview: OVERVIEW, 'layout-detail': LAYOUT_DETAIL };

/** サンプルの種類ごとの、ボタンの文言（「〜を作る」「〜で始める」）の前に付く名前。 */
export function sampleLabel(kind: SampleKind): string {
  return DEFINITIONS[kind].label;
}

/** 画面に出すサンプルの種類の一覧。トップと空のWorkspaceの選ぶ項目は、この順に並べる。 */
export const SAMPLE_KINDS: readonly SampleKind[] = ['overview', 'layout-detail'];

/**
 * 空のWorkspace（ペインが1つも無い）にサンプルの並びを入れる。連動の組・対象・ペイン・解析設定・Workspaceの条件を
 * サンプルの定義に置き換える（空なので失うペインは無い。他の条件の項目は残す）。名前・テキストは変えない。
 * ペインがあるWorkspace・存在しないidは何もしない。
 */
export function applySampleLayout(
  library: WorkspaceLibrary,
  workspaceId: string,
  generatePaneId: WorkspaceIdGenerator,
  kind: SampleKind,
): WorkspaceLibrary {
  const target = library.find((workspace) => workspace.id === workspaceId);
  if (target === undefined || target.panes.length > 0) return library;
  const definition = DEFINITIONS[kind];
  const seeded: Workspace = {
    ...target,
    groups: [...definition.groups],
    optionSets: [...definition.optionSets],
    conditions: { ...target.conditions, defaultShapeId: SAMPLE_DEFAULT_SHAPE_ID },
  };
  let next: WorkspaceLibrary = library.map((workspace) => (workspace.id === workspaceId ? seeded : workspace));

  // 既存のペイン追加と同じ経路で置く。空いている最初の場所に入る
  for (const spec of definition.panes) {
    const set = spec.optionSet === true ? seeded.optionSets.find((candidate) => candidate.analyzerId === spec.analyzerId) : undefined;
    const pane: WorkspacePane = {
      id: generatePaneId(),
      analyzerId: spec.analyzerId,
      options: spec.options,
      optionsBinding: set !== undefined ? sharedOptions(set.id) : OWN_OPTIONS,
      binding: followBinding(groupId(spec.group)),
    };
    next = addWorkspacePane(next, workspaceId, pane, spec.size, definition.range);
  }
  return next;
}

/** サンプルのWorkspaceを手持ちの末尾に作る。名前が使われていれば連番（`createWorkspace`と同じ）。 */
export function createSampleWorkspace(
  library: WorkspaceLibrary,
  generateId: WorkspaceIdGenerator,
  generatePaneId: WorkspaceIdGenerator,
  kind: SampleKind,
): { readonly library: WorkspaceLibrary; readonly created: Workspace } {
  const base = createWorkspace(library, generateId, DEFINITIONS[kind].name);
  const next = applySampleLayout(base.library, base.created.id, generatePaneId, kind);
  return { library: next, created: next.find((workspace) => workspace.id === base.created.id)! };
}
