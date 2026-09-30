import type { AnalysisTarget } from '#input/setup/index.ts';
import { initialTextSelection, type TextSelectionState } from '#input/text/selection.ts';
import { stableStringify } from './cache-key.ts';
import { initialMultiTargetSelection, type MultiTargetSelection } from './multi-target-selection.ts';
import {
  layoutWithPane,
  layoutWithPaneNextTo,
  layoutWithoutPane,
  normalizeLayout,
  sameLayoutExactly,
  type WorkspaceLayout,
} from './workspace-layout.ts';

/**
 * Workspace（Analyzerをペインとして並べる器。docs/architecture.md「画面の構成」）。
 * 名前・自分のテキストの選択・ペイン・ペインの並びを持つ資産で、書き込みはすべてコマンドを通す
 * （`engine/workspace-commands.ts`）。
 *
 * 資産の形はペインを載せるライブラリの保存形式とは独立に持つ（`workspace-layout.ts`冒頭）。
 *
 * ペインの対象は今は「固定」だけで、ペイン自身が持つ。Workspaceに従わせる対象と、その一括の
 * 切り替えは後から足す（形を足す時は資産の版を上げる）。
 */
export type WorkspacePaneTarget =
  /** 対象を1つ見るAnalyzer（Bigram Flow等）の対象。 */
  | { readonly kind: 'single'; readonly target: AnalysisTarget }
  /** 対象の集合を見るAnalyzer（比較表・N感度等）の集合。色の番号・基準はこのペインの中で持つ。 */
  | { readonly kind: 'set'; readonly selection: MultiTargetSelection };

export interface WorkspacePane {
  /** Workspaceの中で一意なid。配置がペインを指すのに使う。 */
  readonly id: string;
  /**
   * Analyzerの識別子（`definition.id`）。今のアプリが知らない識別子でも捨てずに残す
   * （Analyzerを一時的に外した時に、保存したペインを失わないため。表示側が「使えない」ペインとして出す）。
   */
  readonly analyzerId: string;
  /**
   * このペインの解析設定。中身はAnalyzerごとに違う形で、engineは個別Analyzerの型を知らないので
   * `unknown`のまま持つ（`standalone-analyzer-options.ts`と同じ理由）。一度も変えていなければ`undefined`
   * （Analyzerの既定値を使う）。
   */
  readonly options: unknown;
  readonly target: WorkspacePaneTarget;
}

export interface Workspace {
  readonly id: string;
  readonly name: string;
  /** このWorkspaceが使うテキスト。個別画面の「最後に使ったテキスト」とは別に持つ。 */
  readonly text: TextSelectionState;
  readonly panes: readonly WorkspacePane[];
  readonly layout: WorkspaceLayout;
}

/** Workspaceの手持ち（資産）。作った順。 */
export type WorkspaceLibrary = readonly Workspace[];

export type WorkspaceIdGenerator = () => string;

export function initialWorkspaceLibrary(): WorkspaceLibrary {
  return [];
}

export const DEFAULT_WORKSPACE_NAME = '新しいWorkspace';

export function findWorkspace(library: WorkspaceLibrary, id: string): Workspace | undefined {
  return library.find((workspace) => workspace.id === id);
}

/** 既に使われている名前と重ならない名前を作る（「新しいWorkspace」→「新しいWorkspace 2」…）。 */
export function uniqueWorkspaceName(library: WorkspaceLibrary, base: string): string {
  const used = new Set(library.map((workspace) => workspace.name));
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** 空のWorkspaceを作る。テキストは既定の選択から始める。 */
export function createWorkspace(
  library: WorkspaceLibrary,
  generateId: WorkspaceIdGenerator,
  name?: string,
): { readonly library: WorkspaceLibrary; readonly created: Workspace } {
  const created: Workspace = {
    id: generateId(),
    name: uniqueWorkspaceName(library, name?.trim() || DEFAULT_WORKSPACE_NAME),
    text: initialTextSelection(),
    panes: [],
    layout: undefined,
  };
  return { library: [...library, created], created };
}

/** 1件だけ書き換える。`update` が同じ参照を返せば（何もしなければ）手持ちの参照も変えない。 */
function updateWorkspace(
  library: WorkspaceLibrary,
  id: string,
  update: (workspace: Workspace) => Workspace,
): WorkspaceLibrary {
  const index = library.findIndex((workspace) => workspace.id === id);
  if (index === -1) return library;
  const current = library[index]!;
  const next = update(current);
  if (next === current) return library;
  return library.map((workspace, i) => (i === index ? next : workspace));
}

/** 名前を付け直す。空の名前・同じ名前は何もしない。他のWorkspaceと同じ名前も許す（idで区別する）。 */
export function renameWorkspace(library: WorkspaceLibrary, id: string, name: string): WorkspaceLibrary {
  const trimmed = name.trim();
  if (trimmed === '') return library;
  return updateWorkspace(library, id, (workspace) => (workspace.name === trimmed ? workspace : { ...workspace, name: trimmed }));
}

export function deleteWorkspace(library: WorkspaceLibrary, id: string): WorkspaceLibrary {
  return library.some((workspace) => workspace.id === id)
    ? library.filter((workspace) => workspace.id !== id)
    : library;
}

/** このWorkspaceのテキストの選択を書き換える。値が変わらなければ同じ参照を返す。 */
export function withWorkspaceText(library: WorkspaceLibrary, id: string, selection: TextSelectionState): WorkspaceLibrary {
  return updateWorkspace(library, id, (workspace) => (
    selection === workspace.text ? workspace : { ...workspace, text: selection }
  ));
}

/** 空の対象を持つペインの初期値。 */
export function emptySetTarget(): WorkspacePaneTarget {
  return { kind: 'set', selection: initialMultiTargetSelection() };
}

/** ペインを右端に足す。同じidのペインが既にあれば何もしない。 */
export function addWorkspacePane(library: WorkspaceLibrary, workspaceId: string, pane: WorkspacePane): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    if (workspace.panes.some((existing) => existing.id === pane.id)) return workspace;
    return {
      ...workspace,
      panes: [...workspace.panes, pane],
      layout: layoutWithPane(workspace.layout, pane.id),
    };
  });
}

/** ペインを閉じる。存在しないidは何もしない。 */
export function closeWorkspacePane(library: WorkspaceLibrary, workspaceId: string, paneId: string): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    if (!workspace.panes.some((pane) => pane.id === paneId)) return workspace;
    return {
      ...workspace,
      panes: workspace.panes.filter((pane) => pane.id !== paneId),
      layout: layoutWithoutPane(workspace.layout, paneId),
    };
  });
}

/**
 * ペインを複製する。解析設定と対象を写し、元のペインの右隣の新しい枠に置く。
 * 元のペインが無い、または新しいidが既に使われていれば何もしない。
 */
export function duplicateWorkspacePane(
  library: WorkspaceLibrary,
  workspaceId: string,
  paneId: string,
  newPaneId: string,
): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    const source = workspace.panes.find((pane) => pane.id === paneId);
    if (source === undefined || workspace.panes.some((pane) => pane.id === newPaneId)) return workspace;
    return {
      ...workspace,
      panes: [...workspace.panes, { ...source, id: newPaneId }],
      layout: layoutWithPaneNextTo(workspace.layout, paneId, newPaneId),
    };
  });
}

function updatePane(
  library: WorkspaceLibrary,
  workspaceId: string,
  paneId: string,
  update: (pane: WorkspacePane) => WorkspacePane,
): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    const index = workspace.panes.findIndex((pane) => pane.id === paneId);
    if (index === -1) return workspace;
    const current = workspace.panes[index]!;
    const next = update(current);
    if (next === current) return workspace;
    return { ...workspace, panes: workspace.panes.map((pane, i) => (i === index ? next : pane)) };
  });
}

/**
 * ペインの解析設定を書き換える。`undefined` は「一度も変えていない状態へ戻す」。
 * 中身が同じなら何もしない（`stableStringify`。キーの並びに依らない）。
 */
export function withWorkspacePaneOptions(
  library: WorkspaceLibrary,
  workspaceId: string,
  paneId: string,
  options: unknown,
): WorkspaceLibrary {
  return updatePane(library, workspaceId, paneId, (pane) => {
    const same = pane.options === undefined || options === undefined
      ? pane.options === options
      : stableStringify(pane.options) === stableStringify(options);
    return same ? pane : { ...pane, options };
  });
}

/** ペインの対象を書き換える。中身が同じなら何もしない。 */
export function withWorkspacePaneTarget(
  library: WorkspaceLibrary,
  workspaceId: string,
  paneId: string,
  target: WorkspacePaneTarget,
): WorkspaceLibrary {
  return updatePane(library, workspaceId, paneId, (pane) => (
    stableStringify(pane.target) === stableStringify(target) ? pane : { ...pane, target }
  ));
}

/**
 * ペインの並びを書き換える。ペインの集まりと食い違う部分（載っていないペイン・未知のペイン）は
 * `normalizeLayout` が直すので、呼び出し側は載せる側から受け取った形をそのまま渡してよい。
 * 重みまで含めて同じなら何もしない。
 */
export function withWorkspaceLayout(library: WorkspaceLibrary, workspaceId: string, layout: WorkspaceLayout): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    const normalized = normalizeLayout(layout, workspace.panes.map((pane) => pane.id));
    return sameLayoutExactly(normalized, workspace.layout) ? workspace : { ...workspace, layout: normalized };
  });
}
