import { describeFileDecodeFailure, isRecord, type CodecDiagnostic } from '#input/codec/index.ts';
import type { LevelOverrides } from '#input/settings/index.ts';
import { PRESET_FILE_CODEC, type PresetFileContents } from '#engine/preset-file-codec.ts';
import { EMPTY_USER_ASSETS_BUNDLE, USER_ASSETS_FILE_MAX_ITEMS, type UserAssetsBundle } from '#engine/user-assets-file.ts';
import type { Workspace } from '#engine/workspace.ts';
import { SETTINGS_ITEMS, type SettingsValueMap } from '#engine/settings-items.ts';
import { conditionItemLabel } from './condition-summary.ts';

/**
 * プリセットの書き出しファイルの形と、読み込みの分類・文言（DOMを使わない計算。
 * ファイルの保存・読み取りは`platform/`で、`PresetFileIo`として注入される）。
 *
 * ファイルは`{ format, version, presets?, workspaces?, userAssets? }`。`version`・`presets`・`workspaces`・`userAssets`は封筒のcodec
 * （`engine/preset-file-codec.ts`）の出力そのままで、`format`だけを書く直前に付ける（`platform/browser-download.ts`）。
 * どちらか一方だけを持つファイルも読める。読む時は`format`を見てからcodecへ渡す。
 *
 * 最上位とプリセットの中の未知のキーは、読まずに捨てる。捨てたことは不具合報告用の原文にだけ残し、
 * 結果の行の件数の文には数えない（新しい版が足した項目を、古い版が読めなかった失敗として見せないため）。
 * 読めた部分は読み込む。
 */

export const PRESET_FILE_FORMAT = 'keydist-presets';

/**
 * 読み込めるファイルの大きさ。プリセットは既定から変えた項目だけを持つ疎な値なので1件は数百バイトで、
 * 100件でも数十KBに収まる。1MBはその十数倍の余裕で、人が作った量では届かず、
 * 誤って別の大きなファイルを選んだ時にだけ働く。localStorageの容量（約5MB）を1つのファイルで
 * 食い切らせない意味もある。
 */
export const PRESET_FILE_MAX_BYTES = 1024 * 1024;

/** 1つのファイルから読み込めるプリセットの件数。人が手で管理できる量を大きく超えたら、取り違えとみなして断る。 */
export const PRESET_FILE_MAX_PRESETS = 100;

/** 1つのファイルから読み込めるWorkspaceの件数。理由はプリセットと同じ。 */
export const PRESET_FILE_MAX_WORKSPACES = 100;

/** 書き出すファイルの本体（`format`は付けない）。渡さない側、または空の側はファイルに出さない。 */
export function presetFileBody(contents: Partial<PresetFileContents>): Record<string, unknown> {
  return PRESET_FILE_CODEC.encode({
    presets: contents.presets ?? [],
    workspaces: contents.workspaces ?? [],
    userAssets: contents.userAssets ?? EMPTY_USER_ASSETS_BUNDLE,
  });
}

/** ファイル名に使えない文字（OSごとに違うものの和集合）と制御文字。 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ファイル名に使えない文字として制御文字（U+0000〜U+001F）そのものを除くため
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** ファイル名に入れる名前。使えない文字は`_`にし、長すぎる名前は切る。 */
function cleanedForFilename(name: string): string {
  return name.replace(UNSAFE_FILENAME_CHARS, '_').trim().slice(0, 40);
}

/** Workspaceの書き出しのファイル名。ダウンロード先で見分けられるよう、Workspaceの名前を入れる。 */
export function workspaceFileName(name: string): string {
  const cleaned = cleanedForFilename(name);
  return `keydist-Workspace-${cleaned === '' ? '名前なし' : cleaned}.json`;
}

/**
 * プリセットの書き出しのファイル名。全件は日付、1件はプリセット名を入れて、ダウンロード先で見分けられるようにする。
 * 名前に使えない文字は`_`にし、長すぎる名前は切る。
 */
export function presetFileName(scope: { readonly kind: 'all'; readonly date: Date } | { readonly kind: 'one'; readonly name: string }): string {
  if (scope.kind === 'one') {
    const cleaned = cleanedForFilename(scope.name);
    return `keydist-プリセット-${cleaned === '' ? '名前なし' : cleaned}.json`;
  }
  const { date } = scope;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `keydist-プリセット-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** この端末にある参照先の資産のid。プリセットの値がこれに無いidを指していたら注記する。 */
export interface PresetReferences {
  readonly fingerAssignmentIds: ReadonlySet<string>;
  readonly romajiRuleIds: ReadonlySet<string>;
  readonly shapeIds: ReadonlySet<string>;
}

export interface ImportedPreset {
  readonly name: string;
  readonly values: LevelOverrides<SettingsValueMap>;
}

export type PresetFileReadResult =
  | { readonly ok: false; readonly message: string; readonly details: readonly string[] }
  | {
      readonly ok: true;
      readonly presets: readonly ImportedPreset[];
      /** 結果の行に出す文。一部を読めなかった時の注記を含む。参照先の注記は追加後の名前が要るので含めない（`importResultMessage`）。 */
      readonly message: string;
      /** 参照先がこの端末に無いプリセット（`presets`の添字）。名前は番号付けの後で決まるので、添字で返す。 */
      readonly missingReferences: readonly MissingReference[];
      /** 不具合報告用の原文（捨てた値の診断）。 */
      readonly details: readonly string[];
    };

export interface MissingReference {
  readonly noun: string;
  readonly indices: readonly number[];
}

export const PRESET_FILE_TOO_LARGE_MESSAGE = 'ファイルが大きすぎます（1MBまで）';
export const PRESET_FILE_UNREADABLE_MESSAGE = 'ファイルを読み取れませんでした';
/** 読み込んだ内容を保存できなかった時の文。 */
export const PRESET_FILE_IMPORT_FAILED_MESSAGE = '読み込みに失敗しました。もう一度試してください';

function failure(message: string, ...details: string[]): { readonly ok: false; readonly message: string; readonly details: readonly string[] } {
  return { ok: false, message, details };
}

/** 捨てられた値の診断（`presets[i].values.<項目id>…`）から項目idを取り出す。値でなくプリセットごとの診断は`undefined`。 */
function droppedItemId(path: string): string | undefined {
  const matched = /^presets\[\d+\]\.values\.([^.[]+)/.exec(path);
  return matched?.[1];
}

/** 捨てた値の数を「N件の値は読み込めませんでした（先読みN、…）」に、捨てたプリセットの数を別の文にする。 */
function droppedTexts(diagnostics: readonly CodecDiagnostic[]): readonly string[] {
  let droppedPresets = 0;
  let droppedValues = 0;
  const labels: string[] = [];
  let noRow = 0;
  let unknown = 0;
  for (const diagnostic of diagnostics) {
    const id = droppedItemId(diagnostic.path);
    if (id === undefined) {
      droppedPresets += 1;
      continue;
    }
    droppedValues += 1;
    const label = conditionItemLabel(id);
    if (label !== undefined) {
      if (!labels.includes(label)) labels.push(label);
    } else if (Object.hasOwn(SETTINGS_ITEMS, id)) {
      noRow += 1;
    } else {
      unknown += 1;
    }
  }
  const texts: string[] = [];
  if (droppedValues > 0) {
    const parts = [...labels, ...(noRow > 0 ? [`その他の項目 ${noRow}件`] : []), ...(unknown > 0 ? [`この版に無い項目 ${unknown}件`] : [])];
    texts.push(`${droppedValues}件の値は読み込めませんでした（${parts.join('、')}）`);
  }
  if (droppedPresets > 0) texts.push(`${droppedPresets}件のプリセットは読み込めませんでした`);
  return texts;
}

const REFERENCE_KINDS: readonly {
  readonly item: 'fingerAssignmentId' | 'romajiRuleId' | 'defaultShapeId';
  readonly noun: string;
  readonly known: (references: PresetReferences) => ReadonlySet<string>;
}[] = [
  { item: 'fingerAssignmentId', noun: '指の割当', known: (references) => references.fingerAssignmentIds },
  { item: 'romajiRuleId', noun: 'ローマ字規則', known: (references) => references.romajiRuleIds },
  { item: 'defaultShapeId', noun: '物理配列', known: (references) => references.shapeIds },
];

/**
 * 参照先の資産がこの端末に無いプリセット。プリセットのファイルには参照先を同梱しないので、他の端末で作った
 * 自作の指の割当などを指す値が入ってくる。値は捨てずに残し、流し込むと既定へ戻ることを先に伝える。
 * 読み込みは同名に番号を付けるので、名前ではなく添字で返す（手元の同名のプリセットを指さないため）。
 */
function missingReferences(presets: readonly ImportedPreset[], references: PresetReferences): readonly MissingReference[] {
  const found: MissingReference[] = [];
  for (const kind of REFERENCE_KINDS) {
    const known = kind.known(references);
    const indices = presets.flatMap((preset, index) => {
      const id = (preset.values as Record<string, unknown>)[kind.item];
      return typeof id === 'string' && !known.has(id) ? [index] : [];
    });
    if (indices.length > 0) found.push({ noun: kind.noun, indices });
  }
  return found;
}

/**
 * 結果の行に出す文。参照先の注記は、追加後の名前（`addedNames`。`presets`と同じ並び）で書く。
 */
export function importResultMessage(message: string, missing: readonly MissingReference[], addedNames: readonly string[]): string {
  const notes = missing.map(({ noun, indices }) => {
    const names = indices.map((index) => `「${addedNames[index] ?? ''}」`).join('');
    return `${names}はこの端末にない${noun}を使っています。流し込むと既定に戻ります`;
  });
  return [message, ...notes].join('。');
}

const ENVELOPE_KEYS: ReadonlySet<string> = new Set(['format', 'version', 'presets', 'workspaces', 'userAssets']);
const PRESET_KEYS: ReadonlySet<string> = new Set(['id', 'name', 'values']);

/** 読まずに捨てる未知のキー（最上位とプリセットの中）。不具合報告用の原文にだけ出す。 */
function unknownKeyLines(parsed: Record<string, unknown>): readonly string[] {
  const lines = Object.keys(parsed)
    .filter((key) => !ENVELOPE_KEYS.has(key))
    .map((key) => `${key}: 未知のキーのため読み込みませんでした`);
  if (Array.isArray(parsed.presets)) {
    parsed.presets.forEach((preset: unknown, index: number) => {
      if (!isRecord(preset)) return;
      for (const key of Object.keys(preset)) {
        if (!PRESET_KEYS.has(key)) lines.push(`presets[${index}].${key}: 未知のキーのため読み込みませんでした`);
      }
    });
  }
  return lines;
}

const diagnosticLine = (diagnostic: CodecDiagnostic): string => `${diagnostic.path}: ${diagnostic.message}`;

/** Workspaceごと捨てた診断（配列でない・object形式でない・idが読めない/重複）。ペインなど一部を直した診断は含めない。 */
const WORKSPACE_DROP_PATH = /^workspaces(\[\d+\](\.id)?)?$/;

/** 捨てたWorkspaceの数と、ペインなど一部を読めなかった数を、文にする。 */
function workspaceDroppedTexts(diagnostics: readonly CodecDiagnostic[]): readonly string[] {
  const dropped = diagnostics.filter((diagnostic) => WORKSPACE_DROP_PATH.test(diagnostic.path)).length;
  const partial = diagnostics.length - dropped;
  return [
    ...(dropped > 0 ? [`${dropped}件のWorkspaceは読み込めませんでした`] : []),
    ...(partial > 0 ? [`${partial}件のペインや設定は読み込めませんでした`] : []),
  ];
}

type EnvelopeRead =
  | { readonly ok: false; readonly message: string; readonly details: readonly string[] }
  | {
      readonly ok: true;
      readonly contents: PresetFileContents;
      readonly presetDiagnostics: readonly CodecDiagnostic[];
      readonly workspaceDiagnostics: readonly CodecDiagnostic[];
      readonly assetDiagnostics: readonly CodecDiagnostic[];
      readonly unknownKeys: readonly string[];
    };

/** ファイルの封筒を読む。プリセットとWorkspaceのどちらを使うかは呼び出し側が決める。 */
function readEnvelope(text: string): EnvelopeRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return failure('条件ファイルとして読めませんでした', error instanceof Error ? error.message : String(error));
  }
  if (!isRecord(parsed) || parsed.format !== PRESET_FILE_FORMAT) {
    return failure('keydist の条件ファイルではありません', `format: ${JSON.stringify(isRecord(parsed) ? parsed.format : undefined) ?? 'undefined'}`);
  }
  if (Array.isArray(parsed.presets) && parsed.presets.length > PRESET_FILE_MAX_PRESETS) {
    return failure(`プリセットが多すぎます（${PRESET_FILE_MAX_PRESETS}件まで）`, `presets: ${parsed.presets.length}`);
  }
  if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > PRESET_FILE_MAX_WORKSPACES) {
    return failure(`Workspaceが多すぎます（${PRESET_FILE_MAX_WORKSPACES}件まで）`, `workspaces: ${parsed.workspaces.length}`);
  }
  if (isRecord(parsed.userAssets)) {
    for (const key of ['layouts', 'romajiRules', 'fingerAssignments', 'setups']) {
      const list = parsed.userAssets[key];
      if (Array.isArray(list) && list.length > USER_ASSETS_FILE_MAX_ITEMS) {
        return failure(`同梱の資産が多すぎます（種類ごとに${USER_ASSETS_FILE_MAX_ITEMS}件まで）`, `userAssets.${key}: ${list.length}`);
      }
    }
  }
  const decoded = PRESET_FILE_CODEC.decode(parsed);
  if (!decoded.ok) {
    const decodeFailure = describeFileDecodeFailure(decoded.reason);
    return failure(decodeFailure.message, decodeFailure.detail);
  }
  return {
    ok: true,
    contents: decoded.value,
    presetDiagnostics: decoded.diagnostics.filter((diagnostic) => diagnostic.path.startsWith('presets')),
    workspaceDiagnostics: decoded.diagnostics.filter((diagnostic) => diagnostic.path.startsWith('workspaces')),
    assetDiagnostics: decoded.diagnostics.filter((diagnostic) => diagnostic.path.startsWith('userAssets')),
    unknownKeys: unknownKeyLines(parsed),
  };
}

/**
 * ファイルの中身を分類し、読めるプリセットを取り出す。大きさは読む前に`platform`が断るので、ここでは
 * 件数だけを見る。壊れた値・未知の項目は捨てて残りを読み、捨てたものは文と原文で伝える。
 * Workspaceは扱わない（同じファイルのWorkspaceは`parseWorkspaceFile`が読む）。
 */
export function parsePresetFile(text: string, references: PresetReferences): PresetFileReadResult {
  const envelope = readEnvelope(text);
  if (!envelope.ok) return envelope;
  const details = [...envelope.presetDiagnostics.map(diagnosticLine), ...envelope.unknownKeys];
  const presets = envelope.contents.presets.map((preset) => ({ name: preset.name, values: preset.values }));
  if (presets.length === 0) {
    return failure(
      envelope.contents.workspaces.length > 0 ? 'このファイルにプリセットは含まれていません' : '読み込めるプリセットがありませんでした',
      ...details,
      ...(details.length === 0 ? ['presets: 0'] : []),
    );
  }
  const message = [`${presets.length}件のプリセットを読み込みました`, ...droppedTexts(envelope.presetDiagnostics)].join('。');
  return { ok: true, presets, message, missingReferences: missingReferences(presets, references), details };
}

export type WorkspaceFileReadResult =
  | { readonly ok: false; readonly message: string; readonly details: readonly string[] }
  | {
      readonly ok: true;
      readonly workspaces: readonly Workspace[];
      /** Workspaceが参照する自作の資産としてファイルに同梱されていたもの。無ければ空。 */
      readonly userAssets: UserAssetsBundle;
      /** 読めなかった部分の文（捨てたWorkspaceの数など）。無ければ空。 */
      readonly dropped: readonly string[];
      /** 不具合報告用の原文（捨てた要素の診断と、読まなかった未知のキー）。 */
      readonly details: readonly string[];
    };

/**
 * ファイルの中身を分類し、読めるWorkspaceを取り出す。壊れた要素は捨てて残りを読む。
 * 同梱された資産（`userAssets`）はそのまま返し、手元の資産への突き合わせと、参照先が手元にあるかの確認は、手元に足す時に行う
 * （`engine/workspace-import.ts`）。
 * プリセットは扱わない（同じファイルのプリセットは`parsePresetFile`が読む）。
 */
export function parseWorkspaceFile(text: string): WorkspaceFileReadResult {
  const envelope = readEnvelope(text);
  if (!envelope.ok) return envelope;
  const details = [...envelope.workspaceDiagnostics.map(diagnosticLine), ...envelope.assetDiagnostics.map(diagnosticLine), ...envelope.unknownKeys];
  const { workspaces, userAssets } = envelope.contents;
  if (workspaces.length === 0) {
    return failure(
      envelope.contents.presets.length > 0 ? 'このファイルにWorkspaceは含まれていません' : '読み込めるWorkspaceがありませんでした',
      ...details,
      ...(details.length === 0 ? ['workspaces: 0'] : []),
    );
  }
  const droppedAssets = envelope.assetDiagnostics.length;
  return {
    ok: true,
    workspaces,
    userAssets,
    dropped: [
      ...workspaceDroppedTexts(envelope.workspaceDiagnostics),
      ...(droppedAssets > 0 ? [`${droppedAssets}件の同梱の資産の項目は読み込めませんでした`] : []),
    ],
    details,
  };
}
