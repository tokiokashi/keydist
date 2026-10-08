import {
  defineAssetCodec,
  isRecord,
  type AssetCodec,
  type CodecDiagnostic,
} from '#input/codec/index.ts';
import { decodeLevelOverrides } from '#input/settings/index.ts';
import { decodeAnalysisTarget, encodeAnalysisTarget } from '#input/setup/index.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { decodeTextSelectionState, encodeTextSelectionState } from '#input/text/selection-codec.ts';
import { decodeTargetSet, encodeTargetSet } from './multi-target-selection-codec.ts';
import {
  DEFAULT_WORKSPACE_NAME,
  followBinding,
  NO_BINDING,
  OWN_OPTIONS,
  sharedOptions,
  initialWorkspaceTarget,
  INITIAL_LINK_GROUP_ID,
  type LinkGroup,
  type OptionSet,
  type PaneOptionsBinding,
  type PaneTargetBinding,
  type Workspace,
  type WorkspaceTarget,
  type WorkspaceLibrary,
  type WorkspacePane,
  type WorkspacePaneTarget,
} from './workspace.ts';
import { SETTINGS_ITEM_SCHEMAS } from './settings-codec.ts';
import { assignWorkspaceColors } from './workspace-colors.ts';
import { normalizeGrid, type GridItem, type WorkspaceGrid } from './workspace-grid.ts';

/**
 * Workspaceの手持ち（`WorkspaceLibrary`）のcodec。payloadは `{ workspaces }`。
 *
 * ペインの並びは、載せるライブラリの保存形式ではなく自前の格子（`workspace-grid.ts`）で持つ。decodeは壊れた要素だけを診断つきで捨て、残りを読む:
 * - idの無いWorkspace・idが重複したWorkspace・壊れたペイン（対象が読めない等）はその1件だけ捨てる
 * - 名前が壊れていれば既定の名前、テキストの選択が壊れていれば既定の選択へ戻す
 * - 並びが壊れている・ペインと食い違っている時は、ペインを失わないよう`normalizeGrid`で直す
 * - 今のアプリが知らないAnalyzerのペインは捨てずに残す（表示側が使えないペインとして出す）
 *
 * 版4は、ペインの対象の持ち方（従う組 / 固定）と連動の組ごとの対象に加え、解析設定の組（`optionSets`。Analyzerごとの共有の設定）と、
 * ペインの解析設定の持ち方（`optionsBinding`。組に従う / このペインだけ）を持つ。色の番号はWorkspaceが全ペインの和に配って持つ。
 * 版3以前は読まない（互換は守らない。AGENTS.md）。
 */

/** 格子の枠1つを読む。数でない値は`normalizeGrid`が範囲に収めるので、ここでは形だけを見る。 */
function decodeGridItem(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): GridItem | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') {
    diagnostics.push({ path, message: '配置の枠が読めないため捨てた' });
    return undefined;
  }
  const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  return { id: raw.id, x: num(raw.x, 0), y: num(raw.y, 0), w: num(raw.w, 0), h: num(raw.h, 0) };
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
    const selection = decodeTargetSet(raw.selection ?? {}, `${path}.selection`, diagnostics);
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
  if (raw.mode === 'none') return NO_BINDING;
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
  const set = raw.set === undefined ? undefined : decodeTargetSet(raw.set, `${path}.set`, diagnostics);
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

/** 解析設定の組を読む。idが読めない・重複・Analyzerが読めない組は捨てる（従っていたペインは`decodeOptionsBinding`が自分だけの設定へ戻す）。 */
function decodeOptionSets(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): readonly OptionSet[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    diagnostics.push({ path, message: '配列形式でないため解析設定の組を捨てた' });
    return [];
  }
  const sets: OptionSet[] = [];
  const seen = new Set<string>();
  raw.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item) || typeof item.id !== 'string' || item.id === '' || typeof item.analyzerId !== 'string' || item.analyzerId === '') {
      diagnostics.push({ path: itemPath, message: 'idまたはAnalyzerが読めないため解析設定の組を捨てた' });
      return;
    }
    if (seen.has(item.id)) {
      diagnostics.push({ path: `${itemPath}.id`, message: `重複したid「${item.id}」のため解析設定の組を捨てた` });
      return;
    }
    seen.add(item.id);
    sets.push({ id: item.id, analyzerId: item.analyzerId, options: item.options });
  });
  return sets;
}

/**
 * ペインの解析設定の持ち方を読む。無い場合はペイン自身の設定。読めない・従う先の組が無い・別のAnalyzerの組を指す時は、ペインを失わず、
 * ペイン自身の設定（`options`）で持つ形へ戻す（診断は出す）。
 */
function decodeOptionsBinding(
  raw: unknown,
  analyzerId: string,
  sets: readonly OptionSet[],
  path: string,
  diagnostics: CodecDiagnostic[],
): PaneOptionsBinding {
  // 持ち方が無いペインは、ペイン自身の設定で持つ（診断は出さない。ペインの`options`をそのまま読める）
  if (raw === undefined) return OWN_OPTIONS;
  if (isRecord(raw) && raw.mode === 'own') return OWN_OPTIONS;
  if (isRecord(raw) && raw.mode === 'shared' && typeof raw.set === 'string') {
    const set = sets.find((candidate) => candidate.id === raw.set);
    if (set !== undefined && set.analyzerId === analyzerId) return sharedOptions(set.id);
    diagnostics.push({ path: `${path}.set`, message: '従う解析設定の組が見つからないため、このペインだけの設定にした' });
    return OWN_OPTIONS;
  }
  diagnostics.push({ path, message: '解析設定の持ち方が読めないため、このペインだけの設定にした' });
  return OWN_OPTIONS;
}

function decodePane(
  raw: unknown,
  path: string,
  seen: Set<string>,
  groupIds: ReadonlySet<string>,
  fallbackGroup: string,
  sets: readonly OptionSet[],
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
  // 余白のペインは設定を持たないので、持ち方の欄が無くても診断しない
  const optionsBinding = binding.mode === 'none'
    ? OWN_OPTIONS
    : decodeOptionsBinding(raw.optionsBinding, raw.analyzerId, sets, `${path}.optionsBinding`, diagnostics);
  return {
    id: raw.id,
    analyzerId: raw.analyzerId,
    options: optionsBinding.mode === 'own' ? raw.options : undefined,
    optionsBinding,
    binding,
  };
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

  const optionSets = decodeOptionSets(raw.optionSets, `${path}.optionSets`, diagnostics);

  const rawPanes: readonly unknown[] = Array.isArray(raw.panes) ? raw.panes : [];
  if (raw.panes !== undefined && !Array.isArray(raw.panes)) {
    diagnostics.push({ path: `${path}.panes`, message: '配列形式でないためペインを捨てた' });
  }
  const seenPaneIds = new Set<string>();
  const panes: WorkspacePane[] = [];
  rawPanes.forEach((item, index) => {
    const pane = decodePane(item, `${path}.panes[${index}]`, seenPaneIds, groupIds, groups[0]!.id, optionSets, diagnostics);
    if (pane !== undefined) panes.push(pane);
  });

  const rawGrid: GridItem[] = [];
  if (raw.grid !== undefined && !Array.isArray(raw.grid)) {
    diagnostics.push({ path: `${path}.grid`, message: '配列形式でないため配置を捨てた' });
  }
  (Array.isArray(raw.grid) ? raw.grid : []).forEach((item: unknown, index: number) => {
    const decoded = decodeGridItem(item, `${path}.grid[${index}]`, diagnostics);
    if (decoded !== undefined) rawGrid.push(decoded);
  });
  // 詰める設定は真だけを読む（それ以外は既定の「詰めない」）。並びを直す時の詰め方がこれで決まる
  const compactPanes = raw.compactPanes === true;
  const grid: WorkspaceGrid = normalizeGrid(rawGrid, panes.map((pane) => pane.id), compactPanes);
  // 色の番号は、読めた分を持ち越し、無い・壊れた・和に無い対象は配り直す（診断は出さない。色は表示だけの値）
  const known = new Map<string, number>();
  if (isRecord(raw.colorSlots)) {
    for (const [key, slot] of Object.entries(raw.colorSlots)) if (typeof slot === 'number') known.set(key, slot);
  }
  const colorSlots = assignWorkspaceColors({ groups, panes, colorSlots: {} }, known);
  // 条件は値の型だけを検査して読む（置けるレベルかどうかは解決が決める。`input/settings/codec.ts`の方針と同じ）。
  // 読めない項目は捨てて「無い」ことにし、全体の条件のまま解決する。
  const conditions = raw.conditions === undefined
    ? undefined
    : decodeLevelOverrides(SETTINGS_ITEM_SCHEMAS, raw.conditions, `${path}.conditions`, diagnostics);
  return {
    id: raw.id, name, text, groups, optionSets, panes, grid, colorSlots,
    ...(compactPanes ? { compactPanes: true as const } : {}),
    ...(conditions === undefined ? {} : { conditions }),
  };
}

function encodePaneTarget(target: WorkspacePaneTarget): Record<string, unknown> {
  return target.kind === 'single'
    ? { kind: 'single', target: encodeAnalysisTarget(target.target) }
    : { kind: 'set', selection: encodeTargetSet(target.selection) };
}

function encodeBinding(binding: PaneTargetBinding): Record<string, unknown> {
  switch (binding.mode) {
    case 'follow': return { mode: 'follow', group: binding.group };
    case 'fixed': return { mode: 'fixed', target: encodePaneTarget(binding.target) };
    case 'none': return { mode: 'none' };
  }
}

function encodePane(pane: WorkspacePane): Record<string, unknown> {
  return {
    id: pane.id,
    analyzerId: pane.analyzerId,
    ...(pane.optionsBinding.mode === 'own' && pane.options !== undefined ? { options: pane.options } : {}),
    optionsBinding: pane.optionsBinding.mode === 'shared'
      ? { mode: 'shared', set: pane.optionsBinding.set }
      : { mode: 'own' },
    binding: encodeBinding(pane.binding),
  };
}

export const WORKSPACE_LIBRARY_CODEC: AssetCodec<WorkspaceLibrary> = defineAssetCodec({
  currentVersion: 4,
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
          set: encodeTargetSet(group.target.set),
        },
      })),
      optionSets: workspace.optionSets.map((set) => ({
        id: set.id,
        analyzerId: set.analyzerId,
        ...(set.options === undefined ? {} : { options: set.options }),
      })),
      panes: workspace.panes.map(encodePane),
      colorSlots: { ...workspace.colorSlots },
      grid: workspace.grid.map((item) => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h })),
      ...(workspace.compactPanes === true ? { compactPanes: true } : {}),
      ...(workspace.conditions === undefined ? {} : { conditions: { ...workspace.conditions } }),
    })),
  }),
});
