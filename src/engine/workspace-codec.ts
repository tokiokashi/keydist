import {
  defineAssetCodec,
  isRecord,
  type AssetCodec,
  type CodecDiagnostic,
} from '#input/codec/index.ts';
import { decodeAnalysisTarget, encodeAnalysisTarget } from '#input/setup/index.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { decodeTextSelectionState, encodeTextSelectionState } from '#input/text/selection-codec.ts';
import { decodeMultiTargetSelection, encodeMultiTargetSelection } from './multi-target-selection-codec.ts';
import {
  DEFAULT_WORKSPACE_NAME,
  followBinding,
  initialWorkspaceTarget,
  INITIAL_LINK_GROUP_ID,
  type LinkGroup,
  type PaneTargetBinding,
  type Workspace,
  type WorkspaceTarget,
  type WorkspaceLibrary,
  type WorkspacePane,
  type WorkspacePaneTarget,
} from './workspace.ts';
import { normalizeLayout, type WorkspaceLayout, type WorkspaceLayoutNode } from './workspace-layout.ts';

/**
 * Workspaceの手持ち（`WorkspaceLibrary`）のcodec（#544 §8-3）。payloadは `{ workspaces }`。
 *
 * ペインの並びは、載せるライブラリの保存形式ではなく自前の木（`workspace-layout.ts`）で持つ
 * （#544 レビューゲート5）。decodeは壊れた要素だけを診断つきで捨て、残りを読む:
 * - idの無いWorkspace・idが重複したWorkspace・壊れたペイン（対象が読めない等）はその1件だけ捨てる
 * - 名前が壊れていれば既定の名前、テキストの選択が壊れていれば既定の選択へ戻す
 * - 並びが壊れている・ペインと食い違っている時は、ペインを失わないよう`normalizeLayout`で直す
 * - 今のアプリが知らないAnalyzerのペインは捨てずに残す（表示側が使えないペインとして出す）
 *
 * 版3は、ペインの対象の持ち方（従う組 / 固定）と、連動の組ごとの対象を持つ形。版2以前は読まない（互換は守らない。AGENTS.md）。
 */

/** 並びの入れ子の深さの上限。壊れた・悪意のあるデータで再帰を深くしないため。 */
const MAX_LAYOUT_DEPTH = 16;

function decodeLayoutNode(raw: unknown, path: string, depth: number, diagnostics: CodecDiagnostic[]): WorkspaceLayoutNode | undefined {
  if (!isRecord(raw)) {
    diagnostics.push({ path, message: 'object形式でないため配置の要素を捨てた' });
    return undefined;
  }
  if (depth > MAX_LAYOUT_DEPTH) {
    diagnostics.push({ path, message: '入れ子が深すぎるため配置の要素を捨てた' });
    return undefined;
  }
  const weight = typeof raw.weight === 'number' && Number.isFinite(raw.weight) && raw.weight > 0 ? raw.weight : 1;
  if (raw.kind === 'group') {
    if (!Array.isArray(raw.paneIds)) {
      diagnostics.push({ path: `${path}.paneIds`, message: '配列形式でないため配置の要素を捨てた' });
      return undefined;
    }
    const paneIds = raw.paneIds.filter((id): id is string => typeof id === 'string' && id !== '');
    const active = typeof raw.activePaneId === 'string' ? raw.activePaneId : undefined;
    return { kind: 'group', paneIds, ...(active === undefined ? {} : { activePaneId: active }), weight };
  }
  if (raw.kind === 'split') {
    if (raw.direction !== 'row' && raw.direction !== 'column') {
      diagnostics.push({ path: `${path}.direction`, message: '向きが読めないため配置の要素を捨てた' });
      return undefined;
    }
    const rawChildren: readonly unknown[] = Array.isArray(raw.children) ? raw.children : [];
    if (raw.children !== undefined && !Array.isArray(raw.children)) {
      // 空のsplitは`normalizeLayout`が捨ててペインを既定の位置へ置き直すので、配置がまるごと変わる
      diagnostics.push({ path: `${path}.children`, message: '配列形式でないため配置の子要素を捨てた' });
    }
    const children: WorkspaceLayoutNode[] = [];
    rawChildren.forEach((child, index) => {
      const decoded = decodeLayoutNode(child, `${path}.children[${index}]`, depth + 1, diagnostics);
      if (decoded !== undefined) children.push(decoded);
    });
    return { kind: 'split', direction: raw.direction, children, weight };
  }
  diagnostics.push({ path: `${path}.kind`, message: '種類が読めないため配置の要素を捨てた' });
  return undefined;
}

function decodePaneTarget(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): WorkspacePaneTarget | undefined {
  if (!isRecord(raw)) {
    diagnostics.push({ path, message: 'object形式でないためペインを捨てた' });
    return undefined;
  }
  if (raw.kind === 'single') {
    const target = decodeAnalysisTarget(raw.target, `${path}.target`, diagnostics);
    return target === undefined ? undefined : { kind: 'single', target };
  }
  if (raw.kind === 'set') {
    const selection = decodeMultiTargetSelection(raw.selection ?? {}, `${path}.selection`, diagnostics);
    return selection === undefined ? undefined : { kind: 'set', selection };
  }
  diagnostics.push({ path: `${path}.kind`, message: '対象の種類が読めないためペインを捨てた' });
  return undefined;
}

/**
 * 従う組が読めない・存在しない時は、ペインを失わないよう先頭の組へ従わせる（診断は出す）。
 * 対象の持ち方そのものが読めない時は、どの対象を映すか決められないのでペインを捨てる。
 */
function decodeBinding(
  raw: unknown,
  path: string,
  groupIds: ReadonlySet<string>,
  fallbackGroup: string,
  diagnostics: CodecDiagnostic[],
): PaneTargetBinding | undefined {
  if (raw === undefined) {
    diagnostics.push({ path, message: '対象の持ち方が無いためペインを捨てた' });
    return undefined;
  }
  if (!isRecord(raw)) {
    diagnostics.push({ path, message: 'object形式でないため対象の持ち方が読めず、ペインを捨てた' });
    return undefined;
  }
  if (raw.mode === 'follow') {
    if (typeof raw.group === 'string' && groupIds.has(raw.group)) return followBinding(raw.group);
    diagnostics.push({ path: `${path}.group`, message: '従う組が見つからないため先頭の組へ従わせた' });
    return followBinding(fallbackGroup);
  }
  if (raw.mode === 'fixed') {
    const target = decodePaneTarget(raw.target, `${path}.target`, diagnostics);
    return target === undefined ? undefined : { mode: 'fixed', target };
  }
  diagnostics.push({ path: `${path}.mode`, message: '対象の持ち方が読めないためペインを捨てた' });
  return undefined;
}

/** 壊れた部分だけ空へ戻し、読めた部分は残す。 */
function decodeWorkspaceTarget(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): WorkspaceTarget {
  const initial = initialWorkspaceTarget();
  if (raw === undefined) return initial;
  if (!isRecord(raw)) {
    diagnostics.push({ path, message: 'object形式でないため組の対象を空へ戻した' });
    return initial;
  }
  const singleTarget = raw.single === undefined ? undefined : decodeAnalysisTarget(raw.single, `${path}.single`, diagnostics);
  const set = raw.set === undefined ? undefined : decodeMultiTargetSelection(raw.set, `${path}.set`, diagnostics);
  return { single: { target: singleTarget }, set: set ?? initial.set };
}

/** 組は1つ以上を常に持つ。読めた組が無ければ、空の対象の組を1つ作る（診断は出す）。 */
function decodeGroups(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): readonly LinkGroup[] {
  const groups: LinkGroup[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(raw)) {
    diagnostics.push({ path, message: '配列形式でないため連動の組を作り直した' });
  } else {
    raw.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (!isRecord(item) || typeof item.id !== 'string' || item.id === '') {
        diagnostics.push({ path: itemPath, message: 'idが読めないため連動の組を捨てた' });
        return;
      }
      if (seen.has(item.id)) {
        diagnostics.push({ path: `${itemPath}.id`, message: `重複したid「${item.id}」のため連動の組を捨てた` });
        return;
      }
      seen.add(item.id);
      groups.push({ id: item.id, target: decodeWorkspaceTarget(item.target, `${itemPath}.target`, diagnostics) });
    });
  }
  if (groups.length === 0) {
    if (Array.isArray(raw)) diagnostics.push({ path, message: '読める連動の組が無いため作り直した' });
    groups.push({ id: INITIAL_LINK_GROUP_ID, target: initialWorkspaceTarget() });
  }
  return groups;
}

function decodePane(
  raw: unknown,
  path: string,
  seen: Set<string>,
  groupIds: ReadonlySet<string>,
  fallbackGroup: string,
  diagnostics: CodecDiagnostic[],
): WorkspacePane | undefined {
  if (!isRecord(raw)) {
    diagnostics.push({ path, message: 'object形式でないためペインを捨てた' });
    return undefined;
  }
  if (typeof raw.id !== 'string' || raw.id === '' || typeof raw.analyzerId !== 'string' || raw.analyzerId === '') {
    diagnostics.push({ path, message: 'idまたはAnalyzerが読めないためペインを捨てた' });
    return undefined;
  }
  if (seen.has(raw.id)) {
    diagnostics.push({ path: `${path}.id`, message: `重複したペインid「${raw.id}」のためペインを捨てた` });
    return undefined;
  }
  const binding = decodeBinding(raw.binding, `${path}.binding`, groupIds, fallbackGroup, diagnostics);
  if (binding === undefined) return undefined;
  seen.add(raw.id);
  return { id: raw.id, analyzerId: raw.analyzerId, options: raw.options, binding };
}

function decodeWorkspace(raw: unknown, path: string, seenIds: Set<string>, diagnostics: CodecDiagnostic[]): Workspace | undefined {
  if (!isRecord(raw)) {
    diagnostics.push({ path, message: 'object形式でないためWorkspaceを捨てた' });
    return undefined;
  }
  if (typeof raw.id !== 'string' || raw.id === '') {
    diagnostics.push({ path: `${path}.id`, message: 'idが読めないためWorkspaceを捨てた' });
    return undefined;
  }
  if (seenIds.has(raw.id)) {
    diagnostics.push({ path: `${path}.id`, message: `重複したid「${raw.id}」のためWorkspaceを捨てた` });
    return undefined;
  }
  seenIds.add(raw.id);

  let name = DEFAULT_WORKSPACE_NAME;
  if (typeof raw.name === 'string' && raw.name.trim() !== '') {
    name = raw.name;
  } else {
    diagnostics.push({ path: `${path}.name`, message: '名前が読めないため既定の名前へ戻した' });
  }

  const text = raw.text === undefined
    ? initialTextSelection()
    : decodeTextSelectionState(raw.text, `${path}.text`, diagnostics) ?? initialTextSelection();

  const groups = decodeGroups(raw.groups, `${path}.groups`, diagnostics);
  const groupIds = new Set(groups.map((group) => group.id));

  const rawPanes: readonly unknown[] = Array.isArray(raw.panes) ? raw.panes : [];
  if (raw.panes !== undefined && !Array.isArray(raw.panes)) {
    diagnostics.push({ path: `${path}.panes`, message: '配列形式でないためペインを捨てた' });
  }
  const seenPaneIds = new Set<string>();
  const panes: WorkspacePane[] = [];
  rawPanes.forEach((item, index) => {
    const pane = decodePane(item, `${path}.panes[${index}]`, seenPaneIds, groupIds, groups[0]!.id, diagnostics);
    if (pane !== undefined) panes.push(pane);
  });

  const rawLayout = raw.layout === undefined ? undefined : decodeLayoutNode(raw.layout, `${path}.layout`, 0, diagnostics);
  const layout: WorkspaceLayout = normalizeLayout(rawLayout, panes.map((pane) => pane.id));
  return { id: raw.id, name, text, groups, panes, layout };
}

function encodePaneTarget(target: WorkspacePaneTarget): Record<string, unknown> {
  return target.kind === 'single'
    ? { kind: 'single', target: encodeAnalysisTarget(target.target) }
    : { kind: 'set', selection: encodeMultiTargetSelection(target.selection) };
}

function encodePane(pane: WorkspacePane): Record<string, unknown> {
  return {
    id: pane.id,
    analyzerId: pane.analyzerId,
    ...(pane.options === undefined ? {} : { options: pane.options }),
    binding: pane.binding.mode === 'follow'
      ? { mode: 'follow', group: pane.binding.group }
      : { mode: 'fixed', target: encodePaneTarget(pane.binding.target) },
  };
}

function encodeLayoutNode(node: WorkspaceLayoutNode): Record<string, unknown> {
  if (node.kind === 'group') {
    return {
      kind: 'group',
      paneIds: [...node.paneIds],
      ...(node.activePaneId === undefined ? {} : { activePaneId: node.activePaneId }),
      weight: node.weight,
    };
  }
  return { kind: 'split', direction: node.direction, children: node.children.map(encodeLayoutNode), weight: node.weight };
}

export const WORKSPACE_LIBRARY_CODEC: AssetCodec<WorkspaceLibrary> = defineAssetCodec({
  currentVersion: 3,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const raw: readonly unknown[] = Array.isArray(payload.workspaces) ? payload.workspaces : [];
    if (payload.workspaces !== undefined && !Array.isArray(payload.workspaces)) {
      diagnostics.push({ path: 'payload.workspaces', message: '配列形式でないためWorkspaceを捨てた' });
    }
    const seenIds = new Set<string>();
    const workspaces: Workspace[] = [];
    raw.forEach((item, index) => {
      const workspace = decodeWorkspace(item, `payload.workspaces[${index}]`, seenIds, diagnostics);
      if (workspace !== undefined) workspaces.push(workspace);
    });
    return workspaces;
  },
  encodePayload: (library) => ({
    workspaces: library.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      text: encodeTextSelectionState(workspace.text),
      groups: workspace.groups.map((group) => ({
        id: group.id,
        target: {
          ...(group.target.single.target === undefined ? {} : { single: encodeAnalysisTarget(group.target.single.target) }),
          set: encodeMultiTargetSelection(group.target.set),
        },
      })),
      panes: workspace.panes.map(encodePane),
      ...(workspace.layout === undefined ? {} : { layout: encodeLayoutNode(workspace.layout) }),
    })),
  }),
});
