import type { LevelOverrides } from '#input/settings/index.ts';
import { layoutIdsOfTargets, type AnalysisTarget } from '#input/setup/index.ts';
import { initialTextSelection, type TextSelectionState } from '#input/text/selection.ts';
import { stableStringify } from './cache-key.ts';
import type { SettingsValueMap } from './settings-items.ts';
import { initialTargetSet, type TargetSet } from './multi-target-selection.ts';
import {
  effectiveSingleTarget,
  initialSingleTargetSelection,
  withSingleTarget,
  type SingleTargetSelection,
} from './single-target-selection.ts';
import { initialWorkspaceColorSlots, withWorkspaceColors, type WorkspaceColorSlots } from './workspace-colors.ts';
import {
  gridWithPane,
  gridWithPaneNextTo,
  gridWithoutPane,
  normalizeGrid,
  sameGrid,
  type GridSize,
  type WorkspaceGrid,
} from './workspace-grid.ts';

/**
 * Workspace（Analyzerをペインとして並べる器。docs/architecture.md「画面の構成」）。
 * 名前・自分のテキストの選択・連動の組・ペイン・ペインの並びを持つ資産で、書き込みはすべてコマンドを通す
 * （`engine/workspace-commands.ts`）。
 *
 * 資産の形はペインを載せるライブラリの保存形式とは独立に持つ（`workspace-grid.ts`冒頭）。
 *
 * ペインの対象は2種類。連動の組（`Workspace.groups`）の対象を読む「従う」と、ペイン自身が
 * 持つ「固定」。全ペインがどちらかを明示して持つので、比較中のペインが黙って別の対象を映すことは無い。
 * 「従う」ペインの対象を選ぶ操作は、そのペインが従う組の対象を書き換える（同じ組の他のペインも一緒に変わる）。
 */
export type WorkspacePaneTarget =
  /** 対象を1つ見るAnalyzer（Bigram Flow等）の対象。 */
  | { readonly kind: 'single'; readonly target: AnalysisTarget }
  /** 対象の集合を見るAnalyzer（比較表・N感度等）の集合。基準は集合の中で持つ。色はWorkspaceが全ペインの和に配る。 */
  | { readonly kind: 'set'; readonly selection: TargetSet };

/**
 * ペインの対象の持ち方。`follow`は連動の組（`LinkGroup`）の対象を読み、`fixed`はこのペインだけの対象を持つ。
 * 固定の対象は、従っている間は持たない（従うへ戻す時に捨てる。戻したい時はUndo）。
 * `none`は対象を持たないペイン（余白のペイン。`BLANK_PANE_ID`）。どの組にも従わないので、組を残す理由にならず、
 * 集合の色の配り先にもならない。
 */
export type PaneTargetBinding =
  | { readonly mode: 'follow'; readonly group: string }
  | { readonly mode: 'fixed'; readonly target: WorkspacePaneTarget }
  | { readonly mode: 'none' };

/**
 * 余白のペイン（何も表示せず、並びの空きを埋めるだけのペイン）の`analyzerId`。
 * Analyzerではないが、保存の形・配置・色の配り・閉じる操作を他のペインと同じ経路に乗せるため、
 * 同じ`WorkspacePane`で持つ。対象を持たないので`binding`は`none`、解析設定も持たない。
 */
export const BLANK_PANE_ID = 'blank';

export const NO_BINDING: PaneTargetBinding = { mode: 'none' };

/**
 * 組の対象。Setup1つを見るAnalyzer用の1つと、集合を見るAnalyzer用の集合を別々に持つ
 * （個別画面のSingle・Multiが別々の選択を持つのと同じ。1つの値へ畳むとAnalyzerの種類で意味が変わる）。
 */
export interface WorkspaceTarget {
  readonly single: SingleTargetSelection;
  readonly set: TargetSet;
}

export function initialWorkspaceTarget(): WorkspaceTarget {
  return { single: initialSingleTargetSelection(), set: initialTargetSet() };
}

/**
 * 連動の組。同じ組に従うペインは、組の対象を切り替えると一括で追従する。Workspaceは組を複数持てて、
 * 組ごとに対象を持つ（比べる2つの群を、それぞれ別の対象で並べられる）。
 * 組の見分けは並びの番号で出す。対象の色（配列ごとの色）とは無関係。
 */
export interface LinkGroup {
  readonly id: string;
  readonly target: WorkspaceTarget;
}

/** 新しいWorkspaceが最初に持つ組のid。 */
export const INITIAL_LINK_GROUP_ID = 'link-1';

export function followBinding(group: string): PaneTargetBinding {
  return { mode: 'follow', group };
}

/**
 * ペインが今映す対象。従うなら組の対象、固定ならペイン自身の対象。
 * Analyzerが期待する形（`kind`）と合わない固定の対象・存在しない組は`undefined`（使えないペインとして扱う）。
 */
export function resolveWorkspacePaneTarget(
  binding: PaneTargetBinding,
  groups: readonly LinkGroup[],
  kind: WorkspacePaneTarget['kind'],
): WorkspacePaneTarget | undefined {
  if (binding.mode === 'none') return undefined;
  if (binding.mode === 'fixed') return binding.target.kind === kind ? binding.target : undefined;
  const group = groups.find((candidate) => candidate.id === binding.group);
  if (group === undefined) return undefined;
  return kind === 'single'
    ? { kind: 'single', target: effectiveSingleTarget(group.target.single) }
    : { kind: 'set', selection: group.target.set };
}

/**
 * Workspaceのペインが映しうる配列のid（重複なし）。従うペインは組の対象（1つ・集合の両方）、固定のペインは
 * 自分の対象を読む。ペインのAnalyzerが1つ・集合のどちらを見るかはここでは引かないので、従う組の両方を含む
 * （文脈バーの既定の物理配列のチップが、配列のレベルの値が勝つ配列を示すのに使う）。
 */
export function workspaceLayoutIds(workspace: Pick<Workspace, 'groups' | 'panes'>): readonly string[] {
  const targets: AnalysisTarget[] = [];
  const followed = new Set<string>();
  for (const pane of workspace.panes) {
    if (pane.binding.mode === 'follow') {
      followed.add(pane.binding.group);
    } else if (pane.binding.mode === 'none') {
      // 余白のペインは対象を持たない。
    } else if (pane.binding.target.kind === 'single') {
      targets.push(pane.binding.target.target);
    } else {
      targets.push(...pane.binding.target.selection.targets);
    }
  }
  for (const group of workspace.groups) {
    if (!followed.has(group.id)) continue;
    targets.push(effectiveSingleTarget(group.target.single), ...group.target.set.targets);
  }
  return layoutIdsOfTargets(targets);
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
  /** 連動の組。「従う」ペインは、このうち1つの対象を読む。1つ以上を常に持つ。 */
  readonly groups: readonly LinkGroup[];
  readonly panes: readonly WorkspacePane[];
  /** ペインごとの位置と大きさ（格子の升目。`workspace-grid.ts`）。ペインの集まりと同じ集まりのidを持つ。 */
  readonly grid: WorkspaceGrid;
  /**
   * 空いた所へペインを上へ詰めるか。表示だけが変わる設定（`ui`。出力の数値は動かない）で、Workspaceごとに持つ。
   * 無ければ（既定）詰めない。ペインを縮める・動かす・閉じて空いた所は空いたまま残り、衝突した時に下へ押すだけになる。
   * 詰めない値は持たない（疎）。切り替えても`grid`は書き換えない（`withWorkspaceCompactPanes`）。
   */
  readonly compactPanes?: true;
  /**
   * 集合の対象に配った色の番号。全ペインの対象の和を1つの集合として配るので、同じ対象はどのペインでも
   * 同じ色になる（`workspace-colors.ts`）。ペインを閉じる・対象を外すなどで和から消えた対象の番号は空く。
   * 書き込みの後に`updateWorkspace`が配り直すので、コマンドの側は意識しない。
   */
  readonly colorSlots: WorkspaceColorSlots;
  /**
   * このWorkspaceの条件（カスケードのWorkspaceのレベル。docs/architecture.md「カスケード」）。既定から変えた項目だけを持つ
   * （疎）。このWorkspaceのペインの解決にだけ入り、単体ページ・他のWorkspaceには入らない。
   * 無ければ（何も変えていなければ）全体の条件のまま。書き込みはコマンドを通す
   * （`engine/commands.ts`の条件のコマンド。全体・配列のレベルと同じ書き込み口を使う）。
   */
  readonly conditions?: LevelOverrides<SettingsValueMap>;
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

/** 空のWorkspaceを作る。テキストは既定の選択から、最初の組の対象は渡された値（省略時は空）から始める。 */
export function createWorkspace(
  library: WorkspaceLibrary,
  generateId: WorkspaceIdGenerator,
  name?: string,
  target: WorkspaceTarget = initialWorkspaceTarget(),
  /** 写し元（個別画面）で配っていた色の番号。見ていた対象の色を引き継ぐため。 */
  knownColors?: ReadonlyMap<string, number>,
): { readonly library: WorkspaceLibrary; readonly created: Workspace } {
  const created: Workspace = withWorkspaceColors({
    id: generateId(),
    name: uniqueWorkspaceName(library, name?.trim() || DEFAULT_WORKSPACE_NAME),
    text: initialTextSelection(),
    groups: [{ id: INITIAL_LINK_GROUP_ID, target }],
    panes: [],
    grid: [],
    colorSlots: initialWorkspaceColorSlots(),
  }, knownColors);
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
  const updated = update(current);
  if (updated === current) return library;
  // 対象が増減しうるどの書き込みも、ここで色を配り直す（外した対象の色を空け、加えた対象に配る）
  const next = withWorkspaceColors(updated);
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

/** 複製の名前に付ける語尾（「〜 のコピー」）。 */
export const WORKSPACE_COPY_SUFFIX = ' のコピー';

/**
 * Workspaceを複製する。ペインの並び・連動の組・固定の対象・解析設定・テキストの選択をそのまま写し、
 * 元のWorkspaceの右隣に置く（一覧で元と並んで見つかるように）。名前は「〜 のコピー」で、使われていれば連番。
 * ペインと組のidはWorkspaceの中でだけ一意なので、写してもぶつからない（並びが指すidも変えずに済む）。
 * 元が無い、または新しいidが既に使われていれば何もしない。
 */
export function duplicateWorkspace(library: WorkspaceLibrary, id: string, newId: string): WorkspaceLibrary {
  const index = library.findIndex((workspace) => workspace.id === id);
  if (index === -1 || library.some((workspace) => workspace.id === newId)) return library;
  const source = library[index]!;
  const copy: Workspace = { ...source, id: newId, name: uniqueWorkspaceName(library, `${source.name}${WORKSPACE_COPY_SUFFIX}`) };
  return [...library.slice(0, index + 1), copy, ...library.slice(index + 1)];
}

/**
 * 削除したWorkspaceを元の位置へ戻す。同じidが既にあれば何もしない。
 * 位置は削除した時の番号で、その間に一覧が短くなっていれば末尾に置く。
 */
export function restoreWorkspace(library: WorkspaceLibrary, workspace: Workspace, index: number): WorkspaceLibrary {
  if (library.some((existing) => existing.id === workspace.id)) return library;
  const at = Math.max(0, Math.min(index, library.length));
  return [...library.slice(0, at), workspace, ...library.slice(at)];
}

/** このWorkspaceのテキストの選択を書き換える。値が変わらなければ同じ参照を返す。 */
export function withWorkspaceText(library: WorkspaceLibrary, id: string, selection: TextSelectionState): WorkspaceLibrary {
  return updateWorkspace(library, id, (workspace) => (
    selection === workspace.text ? workspace : { ...workspace, text: selection }
  ));
}

/**
 * 組の対象を書き換える。`target.kind`が、単体用（`single`）と集合用（`set`）のどちらを
 * 書くかを決める。値が変わらなければ同じ参照を返す。
 */
export function withWorkspaceTarget(
  library: WorkspaceLibrary,
  id: string,
  groupId: string,
  target: WorkspacePaneTarget,
): WorkspaceLibrary {
  return updateWorkspace(library, id, (workspace) => {
    const index = workspace.groups.findIndex((group) => group.id === groupId);
    if (index === -1) return workspace;
    const group = workspace.groups[index]!;
    let next: WorkspaceTarget;
    if (target.kind === 'single') {
      const single = withSingleTarget(group.target.single, target.target);
      if (single === group.target.single) return workspace;
      next = { ...group.target, single };
    } else {
      if (stableStringify(group.target.set) === stableStringify(target.selection)) return workspace;
      next = { ...group.target, set: target.selection };
    }
    return { ...workspace, groups: workspace.groups.map((g, i) => (i === index ? { ...g, target: next } : g)) };
  });
}

/**
 * どのペインも従っていない組を消す。ただし組は1つ以上残す（全部空なら先頭を残す。
 * 空のWorkspaceの対象を失わず、次に足すペインが従う先にもなる）。
 */
function pruneLinkGroups(workspace: Workspace): Workspace {
  const used = new Set(workspace.panes.flatMap((pane) => (pane.binding.mode === 'follow' ? [pane.binding.group] : [])));
  let kept = workspace.groups.filter((group) => used.has(group.id));
  if (kept.length === 0) kept = workspace.groups.slice(0, 1);
  return kept.length === workspace.groups.length ? workspace : { ...workspace, groups: kept };
}

/** ペインを足す。`size`の大きさで、格子の空いている最初の場所に置く。同じidのペインが既にあれば何もしない。 */
export function addWorkspacePane(library: WorkspaceLibrary, workspaceId: string, pane: WorkspacePane, size: GridSize): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    if (workspace.panes.some((existing) => existing.id === pane.id)) return workspace;
    return {
      ...workspace,
      panes: [...workspace.panes, pane],
      grid: gridWithPane(workspace.grid, pane.id, size, workspace.compactPanes === true),
    };
  });
}

/** ペインを閉じる。存在しないidは何もしない。 */
export function closeWorkspacePane(library: WorkspaceLibrary, workspaceId: string, paneId: string): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    if (!workspace.panes.some((pane) => pane.id === paneId)) return workspace;
    return pruneLinkGroups({
      ...workspace,
      panes: workspace.panes.filter((pane) => pane.id !== paneId),
      grid: gridWithoutPane(workspace.grid, paneId, workspace.compactPanes === true),
    });
  });
}

/**
 * ペインを複製する。解析設定と対象の持ち方（従う / 固定）を写し、元のペインと同じ大きさの枠を、右隣（無ければ真下）に置く。
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
      grid: gridWithPaneNextTo(workspace.grid, paneId, newPaneId, workspace.compactPanes === true),
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

/**
 * ペインの対象の持ち方（従う組 / 固定とその対象）を書き換える。中身が同じなら何もしない。
 * 誰も従わなくなった組は消える。存在しない組へ従わせる指定は何もしない。
 */
export function withWorkspacePaneBinding(
  library: WorkspaceLibrary,
  workspaceId: string,
  paneId: string,
  binding: PaneTargetBinding,
): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    if (binding.mode === 'follow' && !workspace.groups.some((group) => group.id === binding.group)) return workspace;
    const index = workspace.panes.findIndex((pane) => pane.id === paneId);
    if (index === -1) return workspace;
    const current = workspace.panes[index]!;
    if (stableStringify(current.binding) === stableStringify(binding)) return workspace;
    return pruneLinkGroups({
      ...workspace,
      panes: workspace.panes.map((pane, i) => (i === index ? { ...current, binding } : pane)),
    });
  });
}

/**
 * ペインを新しい組へ移す。新しい組の対象は、そのペインが今映している対象（`current`）から始める
 * （押しても見た目が変わらない）。`current`と別の形（Single / Multi）の対象は、元の組があればそこから写し、
 * 固定だったペインなら空から始める。元の組は、誰も従わなくなれば消える。
 */
export function withPaneInNewLinkGroup(
  library: WorkspaceLibrary,
  workspaceId: string,
  paneId: string,
  newGroupId: string,
  current: WorkspacePaneTarget,
): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    const pane = workspace.panes.find((candidate) => candidate.id === paneId);
    if (pane === undefined || workspace.groups.some((group) => group.id === newGroupId)) return workspace;
    const previous = pane.binding.mode === 'follow'
      ? workspace.groups.find((group) => group.id === (pane.binding as { group: string }).group)
      : undefined;
    const base = previous?.target ?? initialWorkspaceTarget();
    const target: WorkspaceTarget = current.kind === 'single'
      ? { ...base, single: { target: current.target } }
      : { ...base, set: current.selection };
    return pruneLinkGroups({
      ...workspace,
      groups: [...workspace.groups, { id: newGroupId, target }],
      panes: workspace.panes.map((candidate) => (
        candidate.id === paneId ? { ...candidate, binding: followBinding(newGroupId) } : candidate
      )),
    });
  });
}

/**
 * このWorkspaceの条件を丸ごと置き換える。`undefined`・空は「何も変えていない状態」（キーごと消す）。
 * 同じ参照なら何もしない。
 */
export function withWorkspaceConditionOverrides(
  library: WorkspaceLibrary,
  workspaceId: string,
  conditions: LevelOverrides<SettingsValueMap> | undefined,
): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    const next = conditions === undefined || Object.keys(conditions).length === 0 ? undefined : conditions;
    if (workspace.conditions === next) return workspace;
    const { conditions: _removed, ...rest } = workspace;
    return next === undefined ? rest : { ...rest, conditions: next };
  });
}

/**
 * ペインの並び（ドラッグ・大きさの変更の結果）を書き換える。ペインの集まりと食い違う部分（枠の無いペイン・未知のペイン）は
 * `normalizeGrid`が直し、重なりを解く（詰める設定の時は上の空きも詰める）ので、呼び出し側は載せる側から受け取った形をそのまま渡してよい。
 * 位置と大きさが同じなら何もしない。
 */
export function withWorkspaceGrid(library: WorkspaceLibrary, workspaceId: string, grid: WorkspaceGrid): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    const normalized = normalizeGrid(grid, workspace.panes.map((pane) => pane.id), workspace.compactPanes === true);
    return sameGrid(normalized, workspace.grid) ? workspace : { ...workspace, grid: normalized };
  });
}

/**
 * 「空いた所に詰める」を切り替える。並び（`grid`）は書き換えない。詰めない→詰めるに切り替えた直後は、
 * 保存した並びに空きが残ったままで、表示だけが詰めた形になる（載せる側が詰めて描く）。
 * 並びへ詰めた結果が書かれるのは、次にペインを動かす・足す・閉じた時。切り替えを戻せば、保存した並びがそのまま見える。
 * 同じ値なら何もしない。
 */
export function withWorkspaceCompactPanes(library: WorkspaceLibrary, workspaceId: string, compact: boolean): WorkspaceLibrary {
  return updateWorkspace(library, workspaceId, (workspace) => {
    if ((workspace.compactPanes === true) === compact) return workspace;
    const { compactPanes: _removed, ...rest } = workspace;
    return compact ? { ...rest, compactPanes: true } : rest;
  });
}
