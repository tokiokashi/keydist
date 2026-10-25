import type { Command } from '#input/commands/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { ROMAJI_RULES } from '#input/romaji/rules.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import type { KeydistAssets } from './commands.ts';
import { isEmptyUserAssetsBundle, mergeUserAssets, userAssetChanges, type UserAssetImportEntry, type UserAssetsBundle } from './user-assets-file.ts';
import { remapWorkspaceAssets } from './workspace-assets.ts';
import { stableStringify } from './cache-key.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from './finger-assignment.ts';
import { workspaceTargets, type Workspace, type WorkspaceIdGenerator, type WorkspaceLibrary } from './workspace.ts';

/**
 * ファイルから読んだWorkspaceを手元へ足す計算（DOMを使わない）。
 *
 * ファイルには、Workspaceが参照する自作の資産（配列・ローマ字規則・指の割り当て・Setup）が同梱される
 * （`workspace-assets.ts`）。同梱した資産は自作の資産の読み込み（`user-assets-file.ts`）と同じ規則で手元に突き合わせ、
 * その対応（ファイルのid → 読み込み後のid）をWorkspaceのすべての参照箇所に当ててから、Workspaceを手元に突き合わせる。
 * 資産とWorkspaceは1回の変更で書くので、元に戻す操作は無く、同じファイルを二度読んでも資産もWorkspaceも増えない。
 * 同梱されない参照先（組み込みの資産・物理配列・自作のテキスト、同梱するものが無かった自作の資産）は、
 * この端末に無ければ指している種類を結果に添える（画面が注記する）。
 *
 * Workspaceの突き合わせは自作の資産の読み込み（`user-assets-file.ts`）と同じ決め方にそろえる:
 * - 手元に同じidが無ければ、そのまま足す
 * - 同じidがあり中身が同じなら、何も足さない（同じファイルを二度読んでも増えない）
 * - 同じidがあり中身が違えば、手元を残し、読み込んだ側を新しいidと「名前 (2)」の別名で足す。
 *   ただし、別のidで同じ中身のものが既に手元にあれば（前に別名で足したもの）、それと同じとみなして足さない
 */

/** この端末に無い参照先の種類。 */
export type WorkspaceMissingKind = 'layout' | 'setup' | 'finger-assignment' | 'romaji-rule' | 'shape' | 'text';

export type WorkspaceImportOutcome =
  /** 手元に同じidが無く、そのまま足した。 */
  | { readonly kind: 'added'; readonly addedId: string }
  /** 手元に同じidで中身の違うものがあり、別のidと別名で足した。 */
  | { readonly kind: 'added-renamed'; readonly addedName: string; readonly addedId: string }
  /** 手元に同じ中身のものがあり、何も足さなかった。`existingName`は手元の名前（ファイルの名前と違いうる）。 */
  | { readonly kind: 'skipped-same'; readonly existingName: string };

export interface WorkspaceImportEntry {
  /** ファイルにあった名前。 */
  readonly name: string;
  readonly outcome: WorkspaceImportOutcome;
  /** 足したWorkspaceが指す、この端末に無い参照先の種類。足さなかった時は空。 */
  readonly missing: readonly WorkspaceMissingKind[];
}

export interface WorkspaceImportMerge {
  readonly library: WorkspaceLibrary;
  /** ファイルの並びのまま。 */
  readonly entries: readonly WorkspaceImportEntry[];
}

/** 参照先の有無を調べる手持ち。 */
export type WorkspaceReferenceHoldings = Pick<KeydistAssets, 'setupLibrary' | 'userLayouts' | 'fingerAssignments' | 'userRomajiRules' | 'textLibrary'>;

/**
 * 「中身が同じ」の判定に使う値。idと名前は比べない（idは突き合わせの鍵で、名前は数値に関わらない）。
 * 色の番号も比べない（対象から配り直せる表示だけの値で、読み込みのたびに同じ配り方になる）。
 */
function workspaceContent(workspace: Workspace): string {
  const { id: _id, name: _name, colorSlots: _colorSlots, ...content } = workspace;
  return stableStringify(content);
}

/** 「名前 (2)」「名前 (3)」…のうち、手元で使われていない最初の名前。 */
function freshName(name: string, used: ReadonlySet<string>): string {
  for (let n = 2; ; n += 1) {
    const candidate = `${name} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Workspaceが指す参照先のうち、手持ちに無いものの種類。 */
export function missingWorkspaceReferences(workspace: Workspace, holdings: WorkspaceReferenceHoldings): readonly WorkspaceMissingKind[] {
  const missing = new Set<WorkspaceMissingKind>();
  const setupIds = new Set(holdings.setupLibrary.setups.map((setup) => setup.id));
  const userLayoutIds = new Set(holdings.userLayouts.map((layout) => layout.id));
  for (const target of workspaceTargets(workspace)) {
    if (target.kind === 'layout') {
      if (!LAYOUT_BY_ID.has(target.layoutId) && !userLayoutIds.has(target.layoutId)) missing.add('layout');
    } else if (!setupIds.has(target.setupId)) {
      missing.add('setup');
    }
  }
  const conditions = (workspace.conditions ?? {}) as Record<string, unknown>;
  const absent = (id: unknown, known: (id: string) => boolean) => typeof id === 'string' && !known(id);
  if (
    absent(
      conditions.fingerAssignmentId,
      (id) => Object.hasOwn(FINGER_ASSIGNMENT_REGISTRY, id) || holdings.fingerAssignments.some((assignment) => assignment.id === id),
    )
  ) {
    missing.add('finger-assignment');
  }
  if (absent(conditions.romajiRuleId, (id) => Object.hasOwn(ROMAJI_RULES, id) || holdings.userRomajiRules.some((rule) => rule.id === id))) {
    missing.add('romaji-rule');
  }
  if (absent(conditions.defaultShapeId, (id) => Object.values(PHYSICAL_SHAPES).some((shape) => shape.id === id))) {
    missing.add('shape');
  }
  const ref = workspace.text.ref;
  if (ref.kind === 'user' && !holdings.textLibrary.texts.some((text) => text.id === ref.id)) missing.add('text');
  return [...missing];
}

/**
 * 読み込んだWorkspaceを手元に突き合わせる。足すものは手元の末尾に、ファイルの並びで加える。
 */
export function mergeWorkspaces(
  current: WorkspaceLibrary,
  incoming: WorkspaceLibrary,
  holdings: WorkspaceReferenceHoldings,
  generateId: WorkspaceIdGenerator,
): WorkspaceImportMerge {
  const library = [...current];
  const usedIds = new Set(library.map((workspace) => workspace.id));
  const usedNames = new Set(library.map((workspace) => workspace.name));
  const entries: WorkspaceImportEntry[] = [];
  for (const workspace of incoming) {
    if (!usedIds.has(workspace.id)) {
      library.push(workspace);
      usedIds.add(workspace.id);
      usedNames.add(workspace.name);
      entries.push({ name: workspace.name, outcome: { kind: 'added', addedId: workspace.id }, missing: missingWorkspaceReferences(workspace, holdings) });
      continue;
    }
    const content = workspaceContent(workspace);
    const same =
      library.find((candidate) => candidate.id === workspace.id && workspaceContent(candidate) === content) ??
      library.find((candidate) => workspaceContent(candidate) === content);
    if (same !== undefined) {
      entries.push({ name: workspace.name, outcome: { kind: 'skipped-same', existingName: same.name }, missing: [] });
      continue;
    }
    let addedId = generateId();
    while (usedIds.has(addedId)) addedId = generateId();
    const addedName = freshName(workspace.name, usedNames);
    const added: Workspace = { ...workspace, id: addedId, name: addedName };
    library.push(added);
    usedIds.add(addedId);
    usedNames.add(addedName);
    entries.push({
      name: workspace.name,
      outcome: { kind: 'added-renamed', addedName, addedId },
      missing: missingWorkspaceReferences(added, holdings),
    });
  }
  return { library, entries };
}

/**
 * ファイルから読んだWorkspaceと、同梱された資産を手元へ足す。足すものが無ければ何もしない。
 * `entries()`・`assetEntries()`は、コマンドが最後に適用された時の突き合わせの結果（画面に出す内訳）。書き込みと同じ突き合わせから作るので、
 * 読み込みの途中で別のタブが資産を書き換えても、出した内訳と書いた中身は食い違わない。適用前は`undefined`。
 */
export interface WorkspaceImportPlan {
  readonly command: Command<KeydistAssets>;
  entries(): readonly WorkspaceImportEntry[] | undefined;
  /** 同梱された資産の突き合わせの結果。同梱が無ければ空。 */
  assetEntries(): readonly UserAssetImportEntry[] | undefined;
}

export function importWorkspacesCommand(
  incoming: WorkspaceLibrary,
  bundle: UserAssetsBundle,
  generateId: WorkspaceIdGenerator,
  stamp: string,
): WorkspaceImportPlan {
  let entries: readonly WorkspaceImportEntry[] | undefined;
  let assetEntries: readonly UserAssetImportEntry[] | undefined;
  const command: Command<KeydistAssets> = (current) => {
    // 同梱が無ければ資産は触らず、Workspaceの参照もそのまま（同梱の無いファイルは同梱する資産が無いものとして読む）
    const assets = isEmptyUserAssetsBundle(bundle) ? undefined : mergeUserAssets(current, bundle, stamp);
    const remapped = assets === undefined ? incoming : incoming.map((workspace) => remapWorkspaceAssets(workspace, assets.idMaps));
    const merge = mergeWorkspaces(current.workspaces, remapped, assets === undefined ? current : { ...current, ...assets.assets }, generateId);
    entries = merge.entries;
    assetEntries = assets?.entries ?? [];
    const changes: Partial<KeydistAssets> = {
      ...(assets === undefined ? {} : userAssetChanges(current, assets.assets)),
      ...(merge.library.length === current.workspaces.length ? {} : { workspaces: merge.library }),
    };
    if (Object.keys(changes).length === 0) return { kind: 'no-op' };
    return { kind: 'applied', label: 'Workspaceを読み込む', changes };
  };
  return { command, entries: () => entries, assetEntries: () => assetEntries };
}
