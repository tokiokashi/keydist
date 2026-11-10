import type { Command } from '#input/commands/index.ts';
import type { Preset } from '#input/presets/index.ts';
import type { KeydistAssets } from './commands.ts';
import { stableStringify } from './cache-key.ts';
import { remapPresetValues } from './preset-assets.ts';
import type { SettingsValueMap } from './settings-items.ts';
import { EMPTY_USER_ASSETS_EXTRAS, type UserAssetsExtras } from './user-assets-extras.ts';
import {
  ASSET_KINDS_WITHOUT_RENAME,
  EMPTY_USER_TEXTS_BUNDLE,
  importPolicyOf,
  mergeKind,
  mergeUserAssets,
  mergeUserTexts,
  userAssetChanges,
  type ImportPolicies,
  type UserAssetImportEntry,
  type UserAssetKind,
  type UserAssetsBundle,
  type UserAssetsFileHoldings,
  type UserTextsBundle,
} from './user-assets-file.ts';
import { remapWorkspaceAssets, remapWorkspaceTexts } from './workspace-assets.ts';
import { mergeWorkspaces, workspaceContent } from './workspace-import.ts';
import type { Workspace, WorkspaceLibrary } from './workspace.ts';

/**
 * 「データ・設定の管理」の書き出しファイルを手元へ足す計算（DOMを使わない計算）。
 *
 * 配列・ローマ字規則・指の割り当て・Setup・テキストを先に突き合わせ、その対応（ファイルのid → 読み込み後のid）を
 * プリセットとWorkspaceの参照に当ててから、プリセットとWorkspaceを突き合わせる。個人速度と解析設定は、別のidで足せない1件の値として扱う。
 * 同じidで中身の違うものの扱いは種類ごとに`policies`で決める（`ImportPolicy`）。
 */

/** ファイルの中身。`parseUserAssetsFile`の成功の結果から取り出す。 */
export interface UserAssetsFileContents {
  readonly bundle: UserAssetsBundle;
  readonly userTexts: UserTextsBundle;
  readonly extras: UserAssetsExtras;
}

export interface UserAssetsImportPlan {
  readonly command: Command<KeydistAssets>;
  /**
   * `command`が最後に適用された時の突き合わせの結果（画面に出す内訳）。書き込みと同じ突き合わせから作るので、
   * 読み込みの途中で別のタブが資産を書き換えても、出した内訳と書いた中身は食い違わない。適用前は`undefined`。
   */
  entries(): readonly UserAssetImportEntry[] | undefined;
}

export interface UserAssetsImportMerge {
  readonly changes: Partial<KeydistAssets>;
  /** 配列、ローマ字規則、指の割り当て、Setup、テキスト、組み込みテキストの読みの直し、プリセット、Workspace、個人速度、解析設定の順。 */
  readonly entries: readonly UserAssetImportEntry[];
}

function mergePresets(
  current: KeydistAssets['presetLibrary'],
  incoming: readonly Preset<SettingsValueMap>[],
  maps: { readonly rules: ReadonlyMap<string, string>; readonly fingers: ReadonlyMap<string, string> },
  stamp: string,
  policies: ImportPolicies | undefined,
): { readonly library: KeydistAssets['presetLibrary']; readonly entries: readonly UserAssetImportEntry[] } {
  const merged = mergeKind<Preset<SettingsValueMap>>(
    {
      assetKind: 'preset',
      idPrefix: 'preset-',
      current: current.presets,
      incoming: incoming.map((preset) => ({ ...preset, values: remapPresetValues(preset.values, maps) })),
      builtinIds: () => false,
      builtinName: () => undefined,
      content: (preset) => stableStringify(preset.values),
      rebuild: (preset, id, name) => ({ ...preset, id, name }),
      policy: importPolicyOf(policies, 'preset'),
    },
    stamp,
  );
  return { library: merged.items === current.presets ? current : { presets: merged.items }, entries: merged.entries };
}

function mergeWorkspaceFile(
  current: WorkspaceLibrary,
  incoming: WorkspaceLibrary,
  holdings: Parameters<typeof mergeWorkspaces>[2],
  stamp: string,
  policies: ImportPolicies | undefined,
): { readonly library: WorkspaceLibrary; readonly entries: readonly UserAssetImportEntry[] } {
  const policy = importPolicyOf(policies, 'workspace');
  let library = current;
  const entries: UserAssetImportEntry[] = [];
  const rest: Workspace[] = [];
  for (const workspace of incoming) {
    const own = library.find((candidate) => candidate.id === workspace.id);
    const content = own === undefined ? undefined : workspaceContent(workspace);
    // 手元に同じidで中身の違うものがあり、同じ中身のものが手元のどこにも無い時だけ、扱いを選ぶ対象になる
    const conflicting = own !== undefined && content !== workspaceContent(own) && !library.some((candidate) => workspaceContent(candidate) === content);
    if (!conflicting || policy === 'rename') {
      rest.push(workspace);
    } else if (policy === 'skip') {
      entries.push({ assetKind: 'workspace', name: workspace.name, outcome: { kind: 'kept-own' } });
    } else {
      library = library.map((candidate) => (candidate === own ? workspace : candidate));
      entries.push({ assetKind: 'workspace', name: workspace.name, outcome: { kind: 'overwritten', previousName: own.name } });
    }
  }
  let serial = 0;
  const generateId = (): string => {
    serial += 1;
    return `workspace-${stamp}-${serial}`;
  };
  const merged = mergeWorkspaces(library, rest, holdings, generateId);
  // `mergeWorkspaces`の内訳は、渡した`rest`と同じ並び（1件に1つ）
  merged.entries.forEach((entry, index) => {
    const { outcome } = entry;
    if (outcome.kind === 'added') {
      entries.push({ assetKind: 'workspace', name: entry.name, outcome: { kind: 'added' } });
    } else if (outcome.kind === 'skipped-same') {
      entries.push({ assetKind: 'workspace', name: entry.name, outcome });
    } else {
      const overlapName = library.find((candidate) => candidate.id === rest[index]?.id)?.name ?? entry.name;
      entries.push({
        assetKind: 'workspace',
        name: entry.name,
        outcome: { kind: 'added-renamed', addedName: outcome.addedName, addedId: outcome.addedId, overlap: { with: 'own', name: overlapName } },
      });
    }
  });
  // `mergeWorkspaces`は常に新しい配列を返す。足したものが無ければ手元の配列のまま返す
  return { library: merged.library.length === library.length ? library : merged.library, entries };
}

function mergePersonalSpeed(
  current: KeydistAssets['personalSpeed'],
  incoming: KeydistAssets['personalSpeed'],
  policies: ImportPolicies | undefined,
): { readonly value: KeydistAssets['personalSpeed']; readonly entries: readonly UserAssetImportEntry[] } {
  const name = '個人速度';
  if (incoming.calibration === undefined) return { value: current, entries: [] };
  if (current.calibration === undefined) return { value: incoming, entries: [{ assetKind: 'personal-speed', name, outcome: { kind: 'added' } }] };
  if (stableStringify(current.calibration) === stableStringify(incoming.calibration)) {
    return { value: current, entries: [{ assetKind: 'personal-speed', name, outcome: { kind: 'skipped-same', existingName: name } }] };
  }
  return importPolicyOf(policies, 'personal-speed') === 'overwrite'
    ? { value: incoming, entries: [{ assetKind: 'personal-speed', name, outcome: { kind: 'overwritten', previousName: name } }] }
    : { value: current, entries: [{ assetKind: 'personal-speed', name, outcome: { kind: 'kept-own' } }] };
}

/** Analyzerごとの解析設定を1件ずつ突き合わせる。内訳は1行にまとめる（Analyzerの識別子は画面に出さない）。 */
function mergeAnalyzerOptions(
  current: KeydistAssets['standaloneAnalyzerOptions'],
  incoming: KeydistAssets['standaloneAnalyzerOptions'],
  policies: ImportPolicies | undefined,
): { readonly value: KeydistAssets['standaloneAnalyzerOptions']; readonly entries: readonly UserAssetImportEntry[] } {
  const name = '解析設定';
  const ids = Object.keys(incoming);
  if (ids.length === 0) return { value: current, entries: [] };
  const overwrite = importPolicyOf(policies, 'analyzer-options') === 'overwrite';
  let value = current;
  let added = false;
  let conflicted = false;
  for (const id of ids) {
    if (!Object.hasOwn(current, id)) {
      value = { ...value, [id]: incoming[id] };
      added = true;
    } else if (stableStringify(current[id]) !== stableStringify(incoming[id])) {
      conflicted = true;
      if (overwrite) value = { ...value, [id]: incoming[id] };
    }
  }
  const outcome: UserAssetImportEntry['outcome'] = conflicted
    ? overwrite
      ? { kind: 'overwritten', previousName: name }
      : { kind: 'kept-own' }
    : added
      ? { kind: 'added' }
      : { kind: 'skipped-same', existingName: name };
  return { value, entries: [{ assetKind: 'analyzer-options', name, outcome }] };
}

/** ファイルの中身を手元へ突き合わせた結果。何も変わらなければ`changes`は空。 */
export function mergeUserAssetsFile(
  current: UserAssetsFileHoldings,
  file: UserAssetsFileContents,
  stamp: string,
  policies?: ImportPolicies,
): UserAssetsImportMerge {
  const { extras } = file;
  const assets = mergeUserAssets(current, file.bundle, stamp, policies);
  const texts = mergeUserTexts(current.textLibrary, file.userTexts, stamp, policies);
  const presets = mergePresets(current.presetLibrary, extras.presets, assets.idMaps, stamp, policies);
  const workspaces = mergeWorkspaceFile(
    current.workspaces,
    extras.workspaces.map((workspace) => remapWorkspaceTexts(remapWorkspaceAssets(workspace, assets.idMaps), texts.idMap)),
    { ...current, ...assets.assets, textLibrary: texts.library },
    stamp,
    policies,
  );
  const personalSpeed = mergePersonalSpeed(current.personalSpeed, extras.personalSpeed, policies);
  const analyzerOptions = mergeAnalyzerOptions(current.standaloneAnalyzerOptions, extras.analyzerOptions, policies);
  const changes: Partial<KeydistAssets> = {
    ...userAssetChanges(current, assets.assets),
    ...(texts.library === current.textLibrary ? {} : { textLibrary: texts.library }),
    ...(presets.library === current.presetLibrary ? {} : { presetLibrary: presets.library }),
    ...(workspaces.library === current.workspaces ? {} : { workspaces: workspaces.library }),
    ...(personalSpeed.value === current.personalSpeed ? {} : { personalSpeed: personalSpeed.value }),
    ...(analyzerOptions.value === current.standaloneAnalyzerOptions ? {} : { standaloneAnalyzerOptions: analyzerOptions.value }),
  };
  return {
    changes,
    entries: [...assets.entries, ...texts.entries, ...presets.entries, ...workspaces.entries, ...personalSpeed.entries, ...analyzerOptions.entries],
  };
}

/** 扱いを選べる種類と、その件数。 */
export interface UserAssetsImportConflict {
  readonly kind: UserAssetKind;
  /** 手元に同じidで中身の違うものがある件数。 */
  readonly count: number;
  /** 手元の自作の資産を置き換えられる件が1つ以上ある（組み込みと同じidの資産だけなら`false`）。 */
  readonly canOverwrite: boolean;
  /** 別のidで足せる（`false`なら、選べるのは置き換えと読み込まないの2つ）。 */
  readonly canRename: boolean;
}

/**
 * 既定の扱い（別名で足す。別名で足せない種類は手元を残す）で読み込んだ時に、手元と重なった種類を数える。
 * 利用者に扱いを選んでもらう種類を決めるのに使う。
 */
export function userAssetsImportConflicts(
  current: UserAssetsFileHoldings,
  file: UserAssetsFileContents,
  stamp: string,
): readonly UserAssetsImportConflict[] {
  const { entries } = mergeUserAssetsFile(current, file, stamp);
  const byKind = new Map<UserAssetKind, { count: number; canOverwrite: boolean }>();
  for (const entry of entries) {
    const { outcome } = entry;
    const overlapsBuiltin = outcome.kind === 'added-renamed' && outcome.overlap.with === 'builtin';
    const overlapsOwn = outcome.kind === 'added-renamed' && outcome.overlap.with === 'own';
    if (!overlapsBuiltin && !overlapsOwn && outcome.kind !== 'kept-own') continue;
    const found = byKind.get(entry.assetKind) ?? { count: 0, canOverwrite: false };
    byKind.set(entry.assetKind, { count: found.count + 1, canOverwrite: found.canOverwrite || !overlapsBuiltin });
  }
  return [...byKind].map(([kind, found]) => ({ kind, ...found, canRename: !ASSET_KINDS_WITHOUT_RENAME.has(kind) }));
}

/**
 * ファイルから読んだ資産と設定を手元へ足す。足すものが無ければ何もしない。
 * すべての種類を1回の変更で書くので、元に戻すと全部が戻る。
 */
export function importUserAssetsCommand(
  bundle: UserAssetsBundle,
  stamp: string,
  rest: { readonly userTexts?: UserTextsBundle; readonly extras?: UserAssetsExtras; readonly policies?: ImportPolicies } = {},
): UserAssetsImportPlan {
  let entries: readonly UserAssetImportEntry[] | undefined;
  const command: Command<KeydistAssets> = (current) => {
    const merge = mergeUserAssetsFile(
      current,
      { bundle, userTexts: rest.userTexts ?? EMPTY_USER_TEXTS_BUNDLE, extras: rest.extras ?? EMPTY_USER_ASSETS_EXTRAS },
      stamp,
      rest.policies,
    );
    entries = merge.entries;
    if (Object.keys(merge.changes).length === 0) return { kind: 'no-op' };
    return { kind: 'applied', label: '資産と設定を読み込む', changes: merge.changes };
  };
  return { command, entries: () => entries };
}
