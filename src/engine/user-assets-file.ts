import {
  defineAssetCodec,
  describeFileDecodeFailure,
  describeJsonSyntaxError,
  FILE_ROOT_SHAPE_DETAIL,
  FORMAT_FIELD_MISSING_DETAIL,
  isRecord,
  type AssetCodec,
  type CodecDiagnostic,
} from '#input/codec/index.ts';
import type { Command } from '#input/commands/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { decodeUserLayouts, type UserLayout } from '#input/layouts/user-layouts.ts';
import { decodeUserRomajiRules, isBuiltin, ROMAJI_RULES, type UserRomajiRule } from '#input/romaji/rules.ts';
import { builtinTextById } from '#input/text/builtin.ts';
import type { TextLibrary, UserText } from '#input/text/library.ts';
import { decodeBuiltinReadingCorrections, decodeUserTexts } from '#input/text/library-codec.ts';
import type { ReadingCorrections } from '#input/text/reading.ts';
import { completeLeftColumnKeys, decodeUserFingerAssignments } from '#input/shapes/user-finger-assignments.ts';
import type { FingerAssignment } from '#input/shapes/geometry.ts';
import type { KeydistAssets } from './commands.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from './finger-assignment.ts';
import {
  decodeUserAssetSetups,
  encodeUserAssetSetups,
  mergeUserAssetSetups,
  userAssetSetupsOf,
  withResolvableReferences,
  type UserAssetSetup,
} from './user-assets-setups.ts';

/**
 * 自作の配列・ローマ字規則・指の割り当て・Setup・テキストの書き出しファイルの形と、読み込み時の突き合わせ（DOMを使わない計算）。
 *
 * ファイルは `{ format, version, layouts, romajiRules, fingerAssignments, setups, texts, builtinReadingCorrections }`。
 * 配列・規則・指の割り当て・Setupの4つは、プリセットとWorkspaceのファイルに同梱する資産（`UserAssetsBundle`）と共通で、
 * テキストはこのファイルだけが持つ（`UserTextsBundle`。ほかのファイルはテキストを参照（id）でしか持たない）。`format` は書く直前に
 * `platform/browser-download.ts` が付け、読む時は `format` を見てからこのcodecへ渡す（プリセットのファイルと同じ封筒）。
 * 自作の物理配列は扱わない。
 */

export const USER_ASSETS_FILE_FORMAT = 'keydist-user-assets';

/**
 * 読み込めるファイルの大きさ（バイト）。目安は、手元に保存できるテキストの量。自作のテキストはlocalStorageに保存され、
 * Chromiumでは1つのサイトで約524万字（UTF-16の単位。2026-10-20に測った）まで入る。かな・漢字1字はファイルのUTF-8で3バイトなので、
 * 524万字は約15.7MBになり、16MiBはそれを収める最小の2のべきである。これを超えるファイルは、手元に保存できる量を超えている。
 */
export const USER_ASSETS_FILE_MAX_BYTES = 16 * 1024 * 1024;

/** 上限を利用者に伝える時の表記。 */
export const USER_ASSETS_FILE_MAX_LABEL = '16MB';

/** 1つのファイルから読み込める件数（種類ごと。テキストも）。人が手で管理できる量を大きく超えたら取り違えとみなして断る。 */
export const USER_ASSETS_FILE_MAX_ITEMS = 100;

export interface UserAssetsBundle {
  readonly layouts: readonly UserLayout[];
  readonly romajiRules: readonly UserRomajiRule[];
  readonly fingerAssignments: readonly FingerAssignment[];
  /** Setupと、そのSetupのレベルの条件。`setups`の無い古いファイルは空になる。 */
  readonly setups: readonly UserAssetSetup[];
}

/** ファイルに入れる自作のテキストと、組み込みのテキストに紐づけた読みの直し。「新しい」の印（`UserText.unseen`）は手元で見たかの印なので持たない。 */
export interface UserTextsBundle {
  readonly texts: readonly UserText[];
  /** 組み込みのテキストのid → 表記 → 読み。組み込みのテキストは本文を写さず、直しだけを持つ。 */
  readonly builtinReadingCorrections: Readonly<Record<string, ReadingCorrections>>;
}

export const EMPTY_USER_TEXTS_BUNDLE: UserTextsBundle = { texts: [], builtinReadingCorrections: {} };

export function isEmptyUserTextsBundle(bundle: UserTextsBundle): boolean {
  return bundle.texts.length === 0 && Object.keys(bundle.builtinReadingCorrections).length === 0;
}

/** 書き出しファイルの中身。 */
export interface UserAssetsFileValue {
  readonly bundle: UserAssetsBundle;
  readonly userTexts: UserTextsBundle;
}

function withoutUnseen(text: UserText): UserText {
  const { unseen: _drop, ...rest } = text;
  return rest;
}

function decodeUserTextsBundle(payload: Record<string, unknown>, diagnostics: CodecDiagnostic[]): UserTextsBundle {
  const texts = decodeUserTexts(payload.texts, 'texts', diagnostics).map(withoutUnseen);
  const decoded = decodeBuiltinReadingCorrections(payload.builtinReadingCorrections, 'builtinReadingCorrections', diagnostics) ?? {};
  const builtinReadingCorrections: Record<string, ReadingCorrections> = {};
  for (const [id, corrections] of Object.entries(decoded)) {
    if (builtinTextById(id) === undefined) {
      diagnostics.push({ path: `builtinReadingCorrections.${id}`, message: '組み込みのテキストに無いidの読みの直しを捨てました' });
      continue;
    }
    builtinReadingCorrections[id] = corrections;
  }
  return { texts, builtinReadingCorrections };
}

function encodeUserTextsBundle(value: UserTextsBundle): Record<string, unknown> {
  return {
    texts: value.texts.map((text) => ({
      ...withoutUnseen(text),
      ...(text.readingCorrections === undefined ? {} : { readingCorrections: { ...text.readingCorrections } }),
    })),
    builtinReadingCorrections: Object.fromEntries(Object.entries(value.builtinReadingCorrections).map(([id, corrections]) => [id, { ...corrections }])),
  };
}

/**
 * 資産の束を読む。`pathPrefix`は診断のpathの先頭（資産のファイルは空、Workspaceのファイルに同梱した資産は`userAssets.`）。
 * 無い種類は空にする。
 */
export function decodeUserAssetsBundle(payload: Record<string, unknown>, pathPrefix: string, diagnostics: CodecDiagnostic[]): UserAssetsBundle {
  const layouts = decodeUserLayouts(payload.layouts);
  for (const diagnostic of layouts.diagnostics) {
    diagnostics.push({ path: `${pathPrefix}layouts${diagnostic.path}`, message: diagnostic.message });
  }
  return {
    layouts: layouts.value,
    romajiRules: decodeUserRomajiRules(payload.romajiRules, `${pathPrefix}romajiRules`, diagnostics),
    fingerAssignments: completeLeftColumnKeys(decodeUserFingerAssignments(payload.fingerAssignments, `${pathPrefix}fingerAssignments`, diagnostics)),
    setups: decodeUserAssetSetups(payload.setups, `${pathPrefix}setups`, diagnostics),
  };
}

export function encodeUserAssetsBundle(value: UserAssetsBundle): Record<string, unknown> {
  return {
    layouts: value.layouts.map((layout) => structuredClone(layout)),
    romajiRules: value.romajiRules.map((rule) => ({ ...rule, overrides: { ...rule.overrides } })),
    fingerAssignments: value.fingerAssignments.map((assignment) => structuredClone(assignment)),
    setups: encodeUserAssetSetups(value.setups),
  };
}

export function isEmptyUserAssetsBundle(bundle: UserAssetsBundle): boolean {
  return bundle.layouts.length + bundle.romajiRules.length + bundle.fingerAssignments.length + bundle.setups.length === 0;
}

export const EMPTY_USER_ASSETS_BUNDLE: UserAssetsBundle = { layouts: [], romajiRules: [], fingerAssignments: [], setups: [] };

export const USER_ASSETS_FILE_CODEC: AssetCodec<UserAssetsFileValue> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) =>
    isRecord(payload) ? { bundle: decodeUserAssetsBundle(payload, '', diagnostics), userTexts: decodeUserTextsBundle(payload, diagnostics) } : undefined,
  encodePayload: (value) => ({ ...encodeUserAssetsBundle(value.bundle), ...encodeUserTextsBundle(value.userTexts) }),
});

export type UserAssetsHoldings = Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules' | 'fingerAssignments' | 'setupLibrary'>;

/** このファイルが持つ手元の資産。プリセットとWorkspaceのファイルに同梱する資産（`UserAssetsHoldings`）にテキストを足したもの。 */
export type UserAssetsFileHoldings = UserAssetsHoldings & Pick<KeydistAssets, 'textLibrary'>;

/**
 * 推奨の規則を、解決できるものだけ残した配列にする。組み込みでも`resolve`が返す先でもない規則を指す配列は、
 * 参照を外す（手元の規則に結び付かず、全体の値の規則で打つ配列になる。ローマ字を経ない配列は`romaji`を見ないので触らない）。
 */
function withResolvableRomaji(layout: UserLayout, resolve: (id: string) => string | undefined): UserLayout {
  if (layout.kind === 'kana' || layout.romaji === undefined) return layout;
  const resolved = isBuiltin(layout.romaji) ? layout.romaji : resolve(layout.romaji);
  if (resolved === layout.romaji) return layout;
  const { romaji: _dropped, ...rest } = layout;
  return resolved === undefined ? rest : { ...rest, romaji: resolved };
}

/**
 * 書き出すファイルの本体（`format`は付けない）。ファイルに入れる規則（手元の自作の規則）に無い規則を
 * 指す配列は、参照を外して書く。読み込む側が手元の同じidの規則に結び付けないようにするため。
 * Setupのレベルの条件が指す指の割り当て・ローマ字規則も同じで、ファイルに入れない自作の資産への参照は外す。
 */
export function userAssetsFileBody(assets: UserAssetsFileHoldings): Record<string, unknown> {
  return USER_ASSETS_FILE_CODEC.encode({ bundle: userAssetsBundleOf(assets), userTexts: userTextsBundleOf(assets.textLibrary) });
}

/** 手元のテキストを、ファイルに入れる形にする。組み込みのテキストに無いidの読みの直しは入れない。 */
export function userTextsBundleOf(library: TextLibrary): UserTextsBundle {
  const corrections = Object.entries(library.builtinReadingCorrections ?? {}).filter(([id]) => builtinTextById(id) !== undefined);
  return { texts: library.texts, builtinReadingCorrections: Object.fromEntries(corrections) };
}

const FILE_KEY_LABELS: Readonly<Record<string, string>> = {
  layouts: '配列',
  romajiRules: 'ローマ字規則',
  fingerAssignments: '指の割り当て',
  setups: 'Setup',
  texts: 'テキスト',
};

/** 書き出す件数（種類ごと）と、書き出すファイルの大きさを確かめる。読み込めない形なら、書き出さずに利用者へ伝える文を返す。 */
export function userAssetsFileExportProblem(body: Readonly<Record<string, unknown>>): string | undefined {
  for (const [key, label] of Object.entries(FILE_KEY_LABELS)) {
    const list = body[key];
    if (Array.isArray(list) && list.length > USER_ASSETS_FILE_MAX_ITEMS) {
      return `${label}が多すぎて書き出せません（${USER_ASSETS_FILE_MAX_ITEMS}件まで）。減らしてから書き出してください`;
    }
  }
  // 保存する形（`platform/browser-download.ts`の`downloadJson`）と同じ直列化で、読み込む側が数えるバイト数を測る
  const bytes = new TextEncoder().encode(`${JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, ...body }, null, 2)}\n`).length;
  return bytes > USER_ASSETS_FILE_MAX_BYTES
    ? `ファイルが大きすぎて書き出せません（${USER_ASSETS_FILE_MAX_LABEL}まで）。長いテキストを削除するか短くしてから書き出してください`
    : undefined;
}

/** 手元の資産を、ファイルに入れる形にする。入れない自作の規則・指の割り当てへの参照は外す。 */
export function userAssetsBundleOf(assets: UserAssetsHoldings): UserAssetsBundle {
  const ruleIds = new Set(assets.userRomajiRules.map((rule) => rule.id));
  return {
    layouts: assets.userLayouts.map((layout) => withResolvableRomaji(layout, (id) => (ruleIds.has(id) ? id : undefined))),
    romajiRules: assets.userRomajiRules,
    fingerAssignments: assets.fingerAssignments,
    setups: userAssetSetupsOf(assets.setupLibrary).map((setup) =>
      withResolvableReferences(setup, {
        ruleIds,
        fingerAssignmentIds: new Set(assets.fingerAssignments.map((assignment) => assignment.id)),
      }),
    ),
  };
}

export type UserAssetKind = 'layout' | 'romaji-rule' | 'finger-assignment' | 'setup' | 'text' | 'builtin-text-reading';

/** 突き合わせの結果の1件。 */
export type UserAssetImportOutcome =
  /** 手元に同じidが無く、そのまま足した。 */
  | { readonly kind: 'added' }
  /** 手元に同じidで中身の違うものがあり（または組み込みと同じidで）、別のidと別名で足した。 */
  | {
      readonly kind: 'added-renamed';
      readonly addedName: string;
      readonly addedId: string;
      /** 重なった相手。手元の自作か、組み込みか。名前は相手の名前。 */
      readonly overlap: { readonly with: 'own' | 'builtin'; readonly name: string };
    }
  /** 手元に同じidで中身が同じものがあり、何も足さなかった。`existingName` は手元の名前（ファイルの名前と違いうる）。 */
  | { readonly kind: 'skipped-same'; readonly existingName: string }
  /** 組み込みのテキストの読みの直しだけが取る。手元に同じテキストの別の直しがあり、組み込みのテキストは別のidで足せないため、手元のものを残して何も足さなかった。 */
  | { readonly kind: 'kept-own' };

export interface UserAssetImportEntry {
  readonly assetKind: UserAssetKind;
  /** ファイルにあった名前。 */
  readonly name: string;
  readonly outcome: UserAssetImportOutcome;
}

/** ファイルのid → 読み込み後に指すid。4種類とも、足さなかったものは同じ中身の手元のid、足したものは足したid。 */
export interface UserAssetIdMaps {
  readonly layouts: ReadonlyMap<string, string>;
  readonly rules: ReadonlyMap<string, string>;
  readonly fingers: ReadonlyMap<string, string>;
  readonly setups: ReadonlyMap<string, string>;
}

export interface UserAssetsMerge {
  readonly assets: UserAssetsHoldings;
  readonly idMaps: UserAssetIdMaps;
  /** 配列、規則、指の割り当て、Setupの順で、ファイルの並びのまま。 */
  readonly entries: readonly UserAssetImportEntry[];
}

/** キーを並べ替えて直列化する。入れ子のobjectのキーの並びが違うだけの値を、同じ中身として比べるため。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * 「中身が同じ」の判定に使う項目。idと名前は比べない（idは突き合わせの鍵で、名前は数値に関わらない）。
 * 数値に関わる項目はすべて比べる。
 * `romaji` は推奨の規則の読み込み後のidで比べる。面で定義する配列はローマ字を経ず `romaji` を持たない。
 * 面で定義する配列は `faces`（面の並びの順も含む）と `composition` で比べる。
 */
function layoutContent(layout: UserLayout): string {
  return canonical({
    rows: layout.rows,
    romaji: layout.romaji,
    sequences: layout.sequences,
    legends: layout.legends,
    faces: layout.faces,
    composition: layout.composition,
    homeKeys: layout.homeKeys,
  });
}

const ruleContent = (rule: UserRomajiRule): string => canonical({ base: rule.base, overrides: rule.overrides, generateSokuon: rule.generateSokuon });

const fingerContent = (assignment: FingerAssignment): string =>
  canonical({
    baseFinger: assignment.baseFinger,
    fingerKeys: Object.fromEntries(Object.entries(assignment.fingerKeys).map(([finger, keys]) => [finger, [...keys].sort()])),
    homeKey: assignment.homeKey,
  });

interface Item {
  readonly id: string;
  readonly name: string;
}

interface MergeKind<T extends Item> {
  readonly assetKind: UserAssetKind;
  readonly idPrefix: string;
  readonly current: readonly T[];
  readonly incoming: readonly T[];
  /** 組み込みの資産のid。同じidの自作は足さない（引いた結果がどちらか分からなくなるため）。 */
  readonly builtinIds: (id: string) => boolean;
  /** 組み込みの資産の名前。組み込みと重なったと伝える文に使う。 */
  readonly builtinName: (id: string) => string | undefined;
  readonly content: (item: T) => string;
  /** 別名で足す時の組み替え（新しいidと名前）。 */
  readonly rebuild: (item: T, id: string, name: string) => T;
}

/** 重ならない新しいid。`stamp` は1回の読み込みで固定の値で、同じ入力なら同じidになる。 */
function freshId(prefix: string, stamp: string, used: ReadonlySet<string>, builtin: (id: string) => boolean): string {
  for (let n = 1; ; n += 1) {
    const id = `${prefix}${stamp}-${n}`;
    if (!used.has(id) && !builtin(id)) return id;
  }
}

/** 「名前 (2)」「名前 (3)」…のうち、手元で使われていない最初の名前。 */
function freshName(name: string, used: ReadonlySet<string>): string {
  for (let n = 2; ; n += 1) {
    const candidate = `${name} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
}

function mergeKind<T extends Item>(
  kind: MergeKind<T>,
  stamp: string,
): {
  readonly items: readonly T[];
  readonly entries: readonly UserAssetImportEntry[];
  /** ファイルのid → 読み込み後に指すid（足さなかったものは手元のid、別名で足したものは新しいid）。 */
  readonly idMap: ReadonlyMap<string, string>;
} {
  const items = [...kind.current];
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const names = new Set(items.map((item) => item.name));
  const entries: UserAssetImportEntry[] = [];
  const idMap = new Map<string, string>();
  for (const incoming of kind.incoming) {
    const existing = byId.get(incoming.id);
    if (existing === undefined && !kind.builtinIds(incoming.id)) {
      items.push(incoming);
      byId.set(incoming.id, incoming);
      names.add(incoming.name);
      idMap.set(incoming.id, incoming.id);
      entries.push({ assetKind: kind.assetKind, name: incoming.name, outcome: { kind: 'added' } });
      continue;
    }
    // idが衝突している時は、同じidのものに加えて、別のidで足し済みの同じ中身（前に別名で足したもの）も同じとみなす。
    // 探さないと、中身の違うものを別名で足した後に同じファイルを読み直すたびに、また別名で足してしまう
    const content = kind.content(incoming);
    const same = existing !== undefined && kind.content(existing) === content ? existing : items.find((item) => kind.content(item) === content);
    if (same !== undefined) {
      idMap.set(incoming.id, same.id);
      entries.push({ assetKind: kind.assetKind, name: incoming.name, outcome: { kind: 'skipped-same', existingName: same.name } });
      continue;
    }
    const builtinName = kind.builtinIds(incoming.id) ? kind.builtinName(incoming.id) : undefined;
    const overlap =
      builtinName !== undefined ? ({ with: 'builtin', name: builtinName } as const) : ({ with: 'own', name: existing?.name ?? incoming.name } as const);
    const addedId = freshId(kind.idPrefix, stamp, new Set(byId.keys()), kind.builtinIds);
    const addedName = freshName(incoming.name, names);
    const added = kind.rebuild(incoming, addedId, addedName);
    items.push(added);
    byId.set(addedId, added);
    names.add(addedName);
    idMap.set(incoming.id, addedId);
    entries.push({ assetKind: kind.assetKind, name: incoming.name, outcome: { kind: 'added-renamed', addedName, addedId, overlap } });
  }
  return { items, entries, idMap };
}

/**
 * 読み込んだ資産を手元に突き合わせる。同じidが手元にある時、
 * - 中身が同じ（`layoutContent` 等の項目が一致。名前だけが違っても同じとみなす）なら何も足さない。
 *   同じファイルを二度読んでも増えず、名前を変えた手元のものを元の名前の複製で散らかさない
 * - 中身が違うなら手元を残し、読み込んだ側を新しいidと「名前 (2)」の別名で足す。ただし、別のidで同じ中身のものが
 *   既に手元にあれば（前に別名で足したもの）、それと同じとみなして足さない
 * 組み込みと同じidは中身を問わず別のidで足す。ローマ字規則を先に突き合わせ、配列の推奨の規則が別のidになったら
 * 配列の参照も振り直す（振り直した後の参照で配列の中身を比べる）。ファイルの中に無く組み込みでもない規則を指す配列は参照を外す。
 */
export function mergeUserAssets(current: UserAssetsHoldings, incoming: UserAssetsBundle, stamp: string): UserAssetsMerge {
  const rules = mergeKind<UserRomajiRule>(
    {
      assetKind: 'romaji-rule',
      idPrefix: 'romaji-',
      current: current.userRomajiRules,
      incoming: incoming.romajiRules,
      builtinIds: isBuiltin,
      builtinName: (id) => (isBuiltin(id) ? ROMAJI_RULES[id].name : undefined),
      content: ruleContent,
      rebuild: (rule, id, name) => ({ ...rule, id, name }),
    },
    stamp,
  );
  // 比べる時だけ、手元の配列の宙に浮いた参照（消した規則を指す）も外す。保存する手元の値は変えない
  const knownRuleIds = new Set(rules.items.map((rule) => rule.id));
  const resolveKnown = (id: string): string | undefined => (knownRuleIds.has(id) ? id : undefined);
  const layouts = mergeKind<UserLayout>(
    {
      assetKind: 'layout',
      idPrefix: 'user-',
      current: current.userLayouts,
      // ファイルの中に無く組み込みでもない規則を指す配列は、手元の同じidの規則に結び付けず、参照を外して全体の値の規則で打つ配列にする
      incoming: incoming.layouts.map((layout) => withResolvableRomaji(layout, (id) => rules.idMap.get(id))),
      builtinIds: (id) => LAYOUT_BY_ID.has(id),
      builtinName: (id) => LAYOUT_BY_ID.get(id)?.name,
      content: (layout) => layoutContent(withResolvableRomaji(layout, resolveKnown)),
      rebuild: (layout, id, name) => ({ ...layout, id, name }),
    },
    stamp,
  );
  const fingers = mergeKind<FingerAssignment>(
    {
      assetKind: 'finger-assignment',
      idPrefix: 'finger-',
      current: current.fingerAssignments,
      incoming: incoming.fingerAssignments,
      builtinIds: (id) => Object.hasOwn(FINGER_ASSIGNMENT_REGISTRY, id),
      builtinName: (id) => FINGER_ASSIGNMENT_REGISTRY[id]?.name,
      content: fingerContent,
      rebuild: (assignment, id, name) => ({ ...assignment, id, name }),
    },
    stamp,
  );
  // Setupは、突き合わせで別のidになった配列・規則・指の割り当てへ付け替えてから比べる
  const setups = mergeUserAssetSetups(
    current.setupLibrary,
    incoming.setups,
    { layouts: layouts.idMap, rules: rules.idMap, fingers: fingers.idMap },
    new Map(layouts.items.map((layout) => [layout.id, layout.name] as const)),
    stamp,
  );
  return {
    assets: { userLayouts: layouts.items, userRomajiRules: rules.items, fingerAssignments: fingers.items, setupLibrary: setups.library },
    idMaps: { layouts: layouts.idMap, rules: rules.idMap, fingers: fingers.idMap, setups: setups.idMap },
    entries: [
      ...layouts.entries,
      ...rules.entries,
      ...fingers.entries,
      ...setups.entries.map((entry): UserAssetImportEntry => ({ assetKind: 'setup', ...entry })),
    ],
  };
}

const textContentCache = new WeakMap<UserText, string>();

/** 「中身が同じ」の判定に使う項目。本文は長いので、同じテキストを何度も比べても1回だけ直列化する。 */
function textContent(text: UserText): string {
  const cached = textContentCache.get(text);
  if (cached !== undefined) return cached;
  const corrections = text.readingCorrections !== undefined && Object.keys(text.readingCorrections).length > 0 ? text.readingCorrections : undefined;
  const content = canonical({ text: text.text, languageOverride: text.languageOverride, readingCorrections: corrections });
  textContentCache.set(text, content);
  return content;
}

export interface UserTextsMerge {
  readonly library: TextLibrary;
  /** ファイルのテキストのid → 読み込み後に指すid。 */
  readonly idMap: ReadonlyMap<string, string>;
  /** 自作のテキスト、組み込みのテキストの読みの直しの順で、ファイルの並びのまま。 */
  readonly entries: readonly UserAssetImportEntry[];
}

/**
 * 読み込んだテキストを手元に突き合わせる。自作のテキストは`mergeUserAssets`と同じ規則（idが同じで中身が違えば別のidと別名で足す。
 * 中身は本文・言語の手動指定・直した読みで比べ、名前は比べない）。組み込みのテキストの読みの直しは、組み込みのテキストを別のidで足せないので、
 * 手元にその直しが無ければ足し、同じなら足さず、違えば手元を残す。組み込みのテキストに無いidは、読み込む時に捨てている。
 */
export function mergeUserTexts(current: TextLibrary, incoming: UserTextsBundle, stamp: string): UserTextsMerge {
  const texts = mergeKind<UserText>(
    {
      assetKind: 'text',
      idPrefix: 'text-',
      current: current.texts,
      incoming: incoming.texts,
      // 自作のテキストのidは組み込みのid（`builtin:`で始まる）と重ならない
      builtinIds: () => false,
      builtinName: () => undefined,
      content: textContent,
      rebuild: (text, id, name) => ({ ...text, id, name }),
    },
    stamp,
  );
  const entries = [...texts.entries];
  let builtinCorrections = current.builtinReadingCorrections;
  for (const [id, corrections] of Object.entries(incoming.builtinReadingCorrections)) {
    const name = builtinTextById(id)?.name;
    if (name === undefined) continue;
    const own = builtinCorrections?.[id];
    if (own === undefined) {
      builtinCorrections = { ...builtinCorrections, [id]: corrections };
      entries.push({ assetKind: 'builtin-text-reading', name, outcome: { kind: 'added' } });
    } else if (canonical(own) === canonical(corrections)) {
      entries.push({ assetKind: 'builtin-text-reading', name, outcome: { kind: 'skipped-same', existingName: name } });
    } else {
      entries.push({ assetKind: 'builtin-text-reading', name, outcome: { kind: 'kept-own' } });
    }
  }
  if (texts.items.length === current.texts.length && builtinCorrections === current.builtinReadingCorrections) {
    return { library: current, idMap: texts.idMap, entries };
  }
  const { builtinReadingCorrections: _old, ...base } = current;
  return {
    library: { ...base, texts: texts.items, ...(builtinCorrections === undefined ? {} : { builtinReadingCorrections: builtinCorrections }) },
    idMap: texts.idMap,
    entries,
  };
}

/**
 * ファイルから読んだ自作の資産を手元へ足す。足すものが無ければ何もしない。
 * 4つの資産を1回の変更で書くので、元に戻すと全部が戻る。
 */
export interface UserAssetsImportPlan {
  readonly command: Command<KeydistAssets>;
  /**
   * `command`が最後に適用された時の突き合わせの結果（画面に出す内訳）。書き込みと同じ突き合わせから作るので、
   * 読み込みの途中で別のタブが資産を書き換えても、出した内訳と書いた中身は食い違わない。適用前は`undefined`。
   */
  entries(): readonly UserAssetImportEntry[] | undefined;
}

/** 突き合わせで変わった資産だけの変更。何も変わらなければ空。 */
export function userAssetChanges(current: UserAssetsHoldings, merged: UserAssetsHoldings): Partial<KeydistAssets> {
  return {
    ...(merged.userLayouts.length === current.userLayouts.length ? {} : { userLayouts: merged.userLayouts }),
    ...(merged.userRomajiRules.length === current.userRomajiRules.length ? {} : { userRomajiRules: merged.userRomajiRules }),
    ...(merged.fingerAssignments.length === current.fingerAssignments.length ? {} : { fingerAssignments: merged.fingerAssignments }),
    ...(merged.setupLibrary === current.setupLibrary ? {} : { setupLibrary: merged.setupLibrary }),
  };
}

export function importUserAssetsCommand(
  incoming: UserAssetsBundle,
  stamp: string,
  incomingTexts: UserTextsBundle = EMPTY_USER_TEXTS_BUNDLE,
): UserAssetsImportPlan {
  let entries: readonly UserAssetImportEntry[] | undefined;
  const command: Command<KeydistAssets> = (current) => {
    const merge = mergeUserAssets(current, incoming, stamp);
    const texts = mergeUserTexts(current.textLibrary, incomingTexts, stamp);
    entries = [...merge.entries, ...texts.entries];
    const changes: Partial<KeydistAssets> = {
      ...userAssetChanges(current, merge.assets),
      ...(texts.library === current.textLibrary ? {} : { textLibrary: texts.library }),
    };
    if (Object.keys(changes).length === 0) return { kind: 'no-op' };
    return { kind: 'applied', label: '自作の資産を読み込む', changes };
  };
  return { command, entries: () => entries };
}

/** 読み取り結果。 */
export type UserAssetsFileReadResult =
  | { readonly ok: false; readonly message: string; readonly details: readonly string[] }
  | { readonly ok: true; readonly bundle: UserAssetsBundle; readonly userTexts: UserTextsBundle; readonly dropped: readonly CodecDiagnostic[] };

const fail = (message: string, ...details: string[]): UserAssetsFileReadResult => ({ ok: false, message, details });

/** ファイルの中身を分類し、読める資産を取り出す。壊れた要素は捨てて残りを読み、捨てた診断を返す。 */
export function parseUserAssetsFile(text: string): UserAssetsFileReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return fail('ファイルとして読めませんでした', describeJsonSyntaxError(error, text));
  }
  if (!isRecord(parsed) || parsed.format !== USER_ASSETS_FILE_FORMAT) {
    const detail = !isRecord(parsed)
      ? FILE_ROOT_SHAPE_DETAIL
      : parsed.format === undefined
        ? FORMAT_FIELD_MISSING_DETAIL
        : '「format」欄の値が自作の資産のファイルのものと違います';
    return fail('keydistの自作の資産のファイルではありません', detail);
  }
  for (const key of Object.keys(FILE_KEY_LABELS)) {
    const list = parsed[key];
    if (Array.isArray(list) && list.length > USER_ASSETS_FILE_MAX_ITEMS) {
      return fail(`件数が多すぎます（${USER_ASSETS_FILE_MAX_ITEMS}件まで）`, `${key}: ${list.length}`);
    }
  }
  const decoded = USER_ASSETS_FILE_CODEC.decode(parsed);
  if (!decoded.ok) {
    const failure = describeFileDecodeFailure(decoded.reason);
    return fail(failure.message, failure.detail);
  }
  const { bundle, userTexts } = decoded.value;
  if (isEmptyUserAssetsBundle(bundle) && isEmptyUserTextsBundle(userTexts)) {
    return fail('読み込める資産がありませんでした', ...decoded.diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`));
  }
  return { ok: true, bundle, userTexts, dropped: decoded.diagnostics };
}
