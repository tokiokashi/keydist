import type { AnalysisTarget } from '#input/setup/index.ts';
import { initialTextSelection, type TextSelectionState } from '#input/text/selection.ts';
import { stableStringify } from './cache-key.ts';
import { initialMultiTargetSelection, type MultiTargetSelection } from './multi-target-selection.ts';
import {
  effectiveSingleTarget,
  initialSingleTargetSelection,
  withSingleTarget,
  type SingleTargetSelection,
} from './single-target-selection.ts';
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
 * ペインの対象は2種類（#544 §6）。Workspaceの対象（`Workspace.target`）を読む「従う」と、ペイン自身が
 * 持つ「固定」。全ペインがどちらかを明示して持つので、比較中のペインが黙って別の対象を映すことは無い。
 * 「従う」ペインの対象を選ぶ操作は、Workspaceの対象を書き換える（隣の従うペインも一緒に変わる）。
 */
export type WorkspacePaneTarget =
  /** 対象を1つ見るAnalyzer（Bigram Flow等）の対象。 */
  | { readonly kind: 'single'; readonly target: AnalysisTarget }
  /** 対象の集合を見るAnalyzer（比較表・N感度等）の集合。色の番号・基準はこのペインの中で持つ。 */
  | { readonly kind: 'set'; readonly selection: MultiTargetSelection };

/**
 * ペインの対象の持ち方。`follow`はWorkspaceの対象を読み、`fixed`はこのペインだけの対象を持つ。
 * 固定の対象は、従っている間は持たない（従うへ戻す時に捨てる。戻したい時はUndo）。
 */
export type PaneTargetBinding =
  | { readonly mode: 'follow' }
  | { readonly mode: 'fixed'; readonly target: WorkspacePaneTarget };

export const FOLLOW_BINDING: PaneTargetBinding = { mode: 'follow' };

/**
 * Workspaceの対象。Setup1つを見るAnalyzer用の1つと、集合を見るAnalyzer用の集合を別々に持つ
 * （個別画面のSingle・Multiが別々の選択を持つのと同じ。1つの値へ畳むとAnalyzerの種類で意味が変わる）。
 */
export interface WorkspaceTarget {
  readonly single: SingleTargetSelection;
  readonly set: MultiTargetSelection;
}

export function initialWorkspaceTarget(): WorkspaceTarget {
  return { single: initialSingleTargetSelection(), set: initialMultiTargetSelection() };
}

/**
 * ペインが今映す対象。従うならWorkspaceの対象、固定ならペイン自身の対象。
 * Analyzerが期待する形（`kind`）と合わない固定の対象は`undefined`（使えないペインとして扱う）。
 */
export function resolveWorkspacePaneTarget(
  binding: PaneTargetBinding,
  workspaceTarget: WorkspaceTarget,
  kind: WorkspacePaneTarget['kind'],
): WorkspacePaneTarget | undefined {
  if (binding.mode === 'fixed') return binding.target.kind === kind ? binding.target : undefined;
  return kind === 'single'
    ? { kind: 'single', target: effectiveSingleTarget(workspaceTarget.single) }
    : { kind: 'set', selection: workspaceTarget.set };
}

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
  readonly binding: PaneTargetBinding;
}

export interface Workspace {
  readonly id: string;
  readonly name: string;
  /** このWorkspaceが使うテキスト。個別画面の「最後に使ったテキスト」とは別に持つ。 */
  readonly text: TextSelectionState;
  /** 「従う」ペインが読む対象。 */
  readonly target: WorkspaceTarget;
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

/** 空のWorkspaceを作る。テキストは既定の選択から、対象は渡された値（省略時は空）から始める。 */
export function createWorkspace(
  library: WorkspaceLibrary,
  generateId: WorkspaceIdGenerator,
  name?: string,
  target: WorkspaceTarget = initialWorkspaceTarget(),
): { readonly library: WorkspaceLibrary; readonly created: Workspace } {
  const created: Workspace = {
    id: generateId(),
    name: uniqueWorkspaceName(library, name?.trim() || DEFAULT_WORKSPACE_NAME),
    text: initialTextSelection(),
    target,
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

/**
 * Workspaceの対象を書き換える。`target.kind`が、単体用（`single`）と集合用（`set`）のどちらを
 * 書くかを決める。値が変わらなければ同じ参照を返す。
 */
export function withWorkspaceTarget(library: WorkspaceLibrary, id: string, target: WorkspacePaneTarget): WorkspaceLibrary {
  return updateWorkspace(library, id, (workspace) => {
    if (target.kind === 'single') {
      const single = withSingleTarget(workspace.target.single, target.target);
      return single === workspace.target.single ? workspace : { ...workspace, target: { ...workspace.target, single } };
    }
    return stableStringify(workspace.target.set) === stableStringify(target.selection)
      ? workspace
      : { ...workspace, target: { ...workspace.target, set: target.selection } };
  });
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
 * ペインを複製する。解析設定と対象の持ち方（従う / 固定）を写し、元のペインの右隣の新しい枠に置く。
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

/** ペインの対象の持ち方（従う / 固定とその対象）を書き換える。中身が同じなら何もしない。 */
export function withWorkspacePaneBinding(
  library: WorkspaceLibrary,
  workspaceId: string,
  paneId: string,
  binding: PaneTargetBinding,
): WorkspaceLibrary {
  return updatePane(library, workspaceId, paneId, (pane) => (
    stableStringify(pane.binding) === stableStringify(binding) ? pane : { ...pane, binding }
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
