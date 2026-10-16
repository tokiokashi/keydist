import type { AnalysisTarget } from '#input/setup/index.ts';
import {
  addWorkspacePane,
  createWorkspace,
  followBinding,
  initialOptionSetId,
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
 * - 下の段の9升: 指ごとの距離の見出し・縦棒・指の名前・左手と右手の見出しまでが、ペインの中でスクロールせずに収まる。
 *   ペインを足した時の既定の高さ（11升）より低い。
 * - 上の段と中の段を合わせて23升で、1920x930のサイドバー固定・非固定のどちらでも、この2段は1画面に入る。
 *   下の段まで含めるとページは32升になり、下の段を見るにはページを縦にスクロールする。
 *   930pxは、オーナーの1080のモニタで普通の窓に開いた時の表示領域（約930px）。
 *   全画面表示の1080pxで測ると、普通の窓では中の段が切れる。
 */
export const SAMPLE_COMPARISON_SIZE: GridSize = { w: 18, h: 9 };
export const SAMPLE_N_SENSITIVITY_SIZE: GridSize = { w: 6, h: 9 };
export const SAMPLE_LOWER_SIZE: GridSize = { w: 6, h: 14 };
export const SAMPLE_FINGER_DISTANCE_SIZE: GridSize = { w: 6, h: 9 };

/**
 * サンプルの並びが使う列の数。上の段（18 + 6）と中・下の段（6 × 4）がそろって右端になる幅。
 * FHDでサイドバーを固定して開いた面に、縦のスクロールバーがあっても横にスクロールせずに収まる
 * （収まることは`hosts/workspace/sample-workspace.test.ts`が検査する）。
 */
export const SAMPLE_GRID_COLS = 24;
const SAMPLE_RANGE: GridColumnRange = { start: 0, end: SAMPLE_GRID_COLS };

const layoutTarget = (layoutId: string): AnalysisTarget => ({ kind: 'layout', layoutId });

function groupId(n: number): string {
  return `link-${n}`;
}

/**
 * 空のWorkspace（ペインが1つも無い）にサンプルの並びを入れる。連動の組・対象・ペイン・解析設定・Workspaceの条件を
 * サンプルの定義に置き換える（空なので失うペインは無い。他の条件の項目は残す）。名前・テキストは変えない。
 * ペインがあるWorkspace・存在しないidは何もしない。
 */
export function applySampleLayout(
  library: WorkspaceLibrary,
  workspaceId: string,
  generatePaneId: WorkspaceIdGenerator,
): WorkspaceLibrary {
  const target = library.find((workspace) => workspace.id === workspaceId);
  if (target === undefined || target.panes.length > 0) return library;
  const groups: LinkGroup[] = SAMPLE_BIGRAM_FLOW_LAYOUT_IDS.map((layoutId, i) => ({
    id: groupId(i + 1),
    target: {
      single: { target: layoutTarget(layoutId) },
      set: i === 0
        ? { targets: SAMPLE_COMPARISON_LAYOUT_IDS.map(layoutTarget), baseline: undefined }
        : { targets: [], baseline: undefined },
    },
  }));
  // Bigram Flowの4つは1つの共有の設定に従う（2打鍵の取り方を1か所で変えられる）。指ごとの距離の4つも1つの共有の設定
  // に従い、こちらは既定のまま始める
  const optionSets: OptionSet[] = [
    { id: initialOptionSetId(SAMPLE_BIGRAM_FLOW_ANALYZER_ID), analyzerId: SAMPLE_BIGRAM_FLOW_ANALYZER_ID, options: SAMPLE_BIGRAM_FLOW_OPTIONS },
    { id: initialOptionSetId(SAMPLE_FINGER_DISTANCE_ANALYZER_ID), analyzerId: SAMPLE_FINGER_DISTANCE_ANALYZER_ID, options: undefined },
  ];
  const seeded: Workspace = {
    ...target,
    groups,
    optionSets,
    conditions: { ...target.conditions, defaultShapeId: SAMPLE_DEFAULT_SHAPE_ID },
  };
  let next: WorkspaceLibrary = library.map((workspace) => (workspace.id === workspaceId ? seeded : workspace));

  const panes: { readonly pane: WorkspacePane; readonly size: GridSize }[] = [
    {
      pane: { id: generatePaneId(), analyzerId: SAMPLE_COMPARISON_ANALYZER_ID, options: undefined, optionsBinding: OWN_OPTIONS, binding: followBinding(groupId(1)) },
      size: SAMPLE_COMPARISON_SIZE,
    },
    {
      pane: { id: generatePaneId(), analyzerId: SAMPLE_N_SENSITIVITY_ANALYZER_ID, options: undefined, optionsBinding: OWN_OPTIONS, binding: followBinding(groupId(1)) },
      size: SAMPLE_N_SENSITIVITY_SIZE,
    },
    ...SAMPLE_BIGRAM_FLOW_LAYOUT_IDS.map((_, i) => ({
      pane: {
        id: generatePaneId(),
        analyzerId: SAMPLE_BIGRAM_FLOW_ANALYZER_ID,
        options: undefined,
        optionsBinding: sharedOptions(initialOptionSetId(SAMPLE_BIGRAM_FLOW_ANALYZER_ID)),
        binding: followBinding(groupId(i + 1)),
      },
      size: SAMPLE_LOWER_SIZE,
    })),
    ...SAMPLE_BIGRAM_FLOW_LAYOUT_IDS.map((_, i) => ({
      pane: {
        id: generatePaneId(),
        analyzerId: SAMPLE_FINGER_DISTANCE_ANALYZER_ID,
        options: undefined,
        optionsBinding: sharedOptions(initialOptionSetId(SAMPLE_FINGER_DISTANCE_ANALYZER_ID)),
        binding: followBinding(groupId(i + 1)),
      },
      size: SAMPLE_FINGER_DISTANCE_SIZE,
    })),
  ];
  // 既存のペイン追加と同じ経路で置く。空いている最初の場所に入るので、上の段は比較表とN感度の2つ、下の段はBigram Flowの4つが左から並ぶ
  for (const { pane, size } of panes) next = addWorkspacePane(next, workspaceId, pane, size, SAMPLE_RANGE);
  return next;
}

/** サンプルのWorkspaceを手持ちの末尾に作る。名前が使われていれば連番（`createWorkspace`と同じ）。 */
export function createSampleWorkspace(
  library: WorkspaceLibrary,
  generateId: WorkspaceIdGenerator,
  generatePaneId: WorkspaceIdGenerator,
): { readonly library: WorkspaceLibrary; readonly created: Workspace } {
  const base = createWorkspace(library, generateId, SAMPLE_WORKSPACE_NAME);
  const next = applySampleLayout(base.library, base.created.id, generatePaneId);
  return { library: next, created: next.find((workspace) => workspace.id === base.created.id)! };
}
