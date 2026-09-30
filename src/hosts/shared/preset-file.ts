import { isRecord, type CodecDiagnostic } from '#input/codec/index.ts';
import type { PresetLibrary } from '#input/presets/index.ts';
import type { LevelOverrides } from '#input/settings/index.ts';
import { PRESET_LIBRARY_CODEC } from '#engine/preset-codec.ts';
import { SETTINGS_ITEMS, type SettingsValueMap } from '#engine/settings-items.ts';
import { conditionItemLabel } from './condition-summary.ts';

/**
 * プリセットの書き出しファイルの形と、読み込みの分類・文言（DOMを使わない計算。
 * ファイルの保存・読み取りは`platform/`で、`PresetFileIo`として注入される）。
 *
 * ファイルは`{ format, version, presets }`。`version`と`presets`は資産のcodecの出力そのままで、
 * `format`だけを書く直前に付ける（`platform/browser-download.ts`）。読む時は`format`を見てから
 * codecへ渡す。旧画面の条件ファイルも`version: 4`を持つので、印が無いと新しい版と取り違える。
 * 同じ封筒に`workspaces`を足して`version`を上げる余地を残す（古いアプリはcodecが
 * 新しい版として断る）。
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

/** 書き出すファイルの本体（`format`は付けない）。 */
export function presetFileBody(library: PresetLibrary<SettingsValueMap>): Record<string, unknown> {
  return PRESET_LIBRARY_CODEC.encode(library);
}

/** ファイル名に使えない文字（OSごとに違うものの和集合）と制御文字。 */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/**
 * 書き出しのファイル名。全件は日付、1件はプリセット名を入れて、ダウンロード先で見分けられるようにする。
 * 名前に使えない文字は`_`にし、長すぎる名前は切る。
 */
export function presetFileName(scope: { readonly kind: 'all'; readonly date: Date } | { readonly kind: 'one'; readonly name: string }): string {
  if (scope.kind === 'one') {
    const cleaned = scope.name.replace(UNSAFE_FILENAME_CHARS, '_').trim().slice(0, 40);
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
      /** 結果の行に出す文。一部を読めなかった・参照先が無い時の注記も含む。 */
      readonly message: string;
      /** 不具合報告用の原文（捨てた値の診断）。 */
      readonly details: readonly string[];
    };

export const PRESET_FILE_TOO_LARGE_MESSAGE = 'ファイルが大きすぎます（1MBまで）';
export const PRESET_FILE_UNREADABLE_MESSAGE = 'ファイルを読み取れませんでした';

function failure(message: string, ...details: string[]): PresetFileReadResult {
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
    const parts = [
      ...labels,
      ...(noRow > 0 ? [`その他の項目 ${noRow}件`] : []),
      ...(unknown > 0 ? [`この版に無い項目 ${unknown}件`] : []),
    ];
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
 * 参照先の資産がこの端末に無いプリセットの注記。ファイルには参照先を同梱しないので、他の端末で作った
 * 自作の指の割当などを指す値が入ってくる。値は捨てずに残し、流し込むと既定へ戻ることを先に伝える。
 */
function missingReferenceTexts(presets: readonly ImportedPreset[], references: PresetReferences): readonly string[] {
  const texts: string[] = [];
  for (const kind of REFERENCE_KINDS) {
    const known = kind.known(references);
    const names = presets
      .filter((preset) => {
        const id = (preset.values as Record<string, unknown>)[kind.item];
        return typeof id === 'string' && !known.has(id);
      })
      .map((preset) => `「${preset.name}」`);
    if (names.length > 0) texts.push(`${names.join('')}はこの端末に無い${kind.noun}を使っています。流し込むと既定に戻ります`);
  }
  return texts;
}

/**
 * ファイルの中身を分類し、読めるプリセットを取り出す。大きさは読む前に`platform`が断るので、ここでは
 * 件数だけを見る。壊れた値・未知の項目は捨てて残りを読み、捨てたものは文と原文で伝える。
 */
export function parsePresetFile(text: string, references: PresetReferences): PresetFileReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return failure('条件ファイルとして読めませんでした', error instanceof Error ? error.message : String(error));
  }
  if (isRecord(parsed) && !('format' in parsed) && 'conditions' in parsed && parsed.version === 4) {
    return failure('旧画面の条件ファイルは読み込めません', 'legacy bundle version 4');
  }
  if (!isRecord(parsed) || parsed.format !== PRESET_FILE_FORMAT) {
    return failure('keydist の条件ファイルではありません', `format: ${JSON.stringify(isRecord(parsed) ? parsed.format : undefined) ?? 'undefined'}`);
  }
  if (Array.isArray(parsed.presets) && parsed.presets.length > PRESET_FILE_MAX_PRESETS) {
    return failure(`プリセットが多すぎます（${PRESET_FILE_MAX_PRESETS}件まで）`, `presets: ${parsed.presets.length}`);
  }
  const decoded = PRESET_LIBRARY_CODEC.decode(parsed);
  if (!decoded.ok) {
    const { reason } = decoded;
    if (reason.kind === 'future-version') {
      return failure(
        '新しい形式のファイルです。keydist を更新してから読み込んでください',
        `version: ${reason.version} (対応: ${reason.currentVersion})`,
      );
    }
    return failure('ファイルの形式が正しくありません', JSON.stringify(reason));
  }
  const details = decoded.diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`);
  const presets = decoded.value.presets.map((preset) => ({ name: preset.name, values: preset.values }));
  if (presets.length === 0) {
    return failure(
      '読み込めるプリセットがありませんでした',
      ...details,
      ...(details.length === 0 ? ['presets: 0'] : []),
    );
  }
  const message = [
    `${presets.length}件のプリセットを読み込んだ`,
    ...droppedTexts(decoded.diagnostics),
    ...missingReferenceTexts(presets, references),
  ].join('。');
  return { ok: true, presets, message, details };
}
