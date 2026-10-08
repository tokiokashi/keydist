import { defineAssetCodec, isRecord, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import type { Command } from '#input/commands/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { decodeUserLayouts, type UserLayout } from '#input/layouts/user-layouts.ts';
import { decodeUserRomajiRules, isBuiltin, type UserRomajiRule } from '#input/romaji/rules.ts';
import { decodeUserFingerAssignments } from '#input/shapes/user-finger-assignments.ts';
import type { FingerAssignment } from '#input/shapes/geometry.ts';
import type { KeydistAssets } from './commands.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from './finger-assignment.ts';

/**
 * 自作の配列・ローマ字規則・指の割り当ての書き出しファイルの形と、読み込み時の突き合わせ（DOMを使わない計算）。
 *
 * ファイルは`{ format, version, layouts, romajiRules, fingerAssignments }`。`format`は書く直前に
 * `platform/browser-download.ts`が付け、読む時は`format`を見てからこのcodecへ渡す（プリセットのファイルと同じ封筒）。
 * 自作の物理配列は扱わない。
 */

export const USER_ASSETS_FILE_FORMAT = 'keydist-user-assets';

/** 読み込めるファイルの大きさ。自作の資産は1件が数KBで、これは誤って別の大きなファイルを選んだ時にだけ働く。 */
export const USER_ASSETS_FILE_MAX_BYTES = 1024 * 1024;

/** 1つのファイルから読み込める件数（種類ごと）。人が手で管理できる量を大きく超えたら取り違えとみなして断る。 */
export const USER_ASSETS_FILE_MAX_ITEMS = 100;

export interface UserAssetsBundle {
  readonly layouts: readonly UserLayout[];
  readonly romajiRules: readonly UserRomajiRule[];
  readonly fingerAssignments: readonly FingerAssignment[];
}

export const USER_ASSETS_FILE_CODEC: AssetCodec<UserAssetsBundle> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const layouts = decodeUserLayouts(payload.layouts);
    for (const diagnostic of layouts.diagnostics) {
      diagnostics.push({ path: `layouts${diagnostic.path}`, message: diagnostic.message });
    }
    return {
      layouts: layouts.value,
      romajiRules: decodeUserRomajiRules(payload.romajiRules, 'romajiRules', diagnostics),
      fingerAssignments: decodeUserFingerAssignments(payload.fingerAssignments, 'fingerAssignments', diagnostics),
    };
  },
  encodePayload: (value) => ({
    layouts: value.layouts.map((layout) => structuredClone(layout)),
    romajiRules: value.romajiRules.map((rule) => ({ ...rule, overrides: { ...rule.overrides } })),
    fingerAssignments: value.fingerAssignments.map((assignment) => structuredClone(assignment)),
  }),
});

export type UserAssetsHoldings = Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules' | 'fingerAssignments'>;

/** 書き出すファイルの本体（`format`は付けない）。 */
export function userAssetsFileBody(assets: UserAssetsHoldings): Record<string, unknown> {
  return USER_ASSETS_FILE_CODEC.encode({
    layouts: assets.userLayouts,
    romajiRules: assets.userRomajiRules,
    fingerAssignments: assets.fingerAssignments,
  });
}

export type UserAssetKind = 'layout' | 'romaji-rule' | 'finger-assignment';

/** 突き合わせの結果の1件。 */
export type UserAssetImportOutcome =
  /** 手元に同じidが無く、そのまま足した。 */
  | { readonly kind: 'added' }
  /** 手元に同じidで中身の違うものがあり（または組み込みと同じidで）、別のidと別名で足した。 */
  | { readonly kind: 'added-renamed'; readonly addedName: string; readonly addedId: string }
  /** 手元に同じidで中身が同じものがあり、何も足さなかった。`existingName`は手元の名前（ファイルの名前と違いうる）。 */
  | { readonly kind: 'skipped-same'; readonly existingName: string };

export interface UserAssetImportEntry {
  readonly assetKind: UserAssetKind;
  /** ファイルにあった名前。 */
  readonly name: string;
  readonly outcome: UserAssetImportOutcome;
}

export interface UserAssetsMerge {
  readonly assets: UserAssetsHoldings;
  /** 配列、規則、指の割り当ての順で、ファイルの並びのまま。 */
  readonly entries: readonly UserAssetImportEntry[];
}

/** キーを並べ替えて直列化する。入れ子のobjectのキーの並びが違うだけの値を、同じ中身として比べるため。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort().filter((key) => value[key] !== undefined);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * 「中身が同じ」の判定に使う項目。idと名前は比べない（idは突き合わせの鍵で、名前は数値に関わらない）。
 * 数値に関わる項目はすべて比べる。値が無いこととfalseが同じ意味の`direct`だけ、省略を揃える。
 * `romaji`は推奨の規則の読み込み後のidで比べる。ローマ字を経ない配列は`romaji`を使わないので比べない。
 */
function layoutContent(layout: UserLayout): string {
  const direct = layout.direct === true;
  return canonical({
    rows: layout.rows,
    romaji: direct ? undefined : layout.romaji,
    sequences: layout.sequences,
    legends: layout.legends,
    direct: direct ? true : undefined,
    homeKeys: layout.homeKeys,
  });
}

const ruleContent = (rule: UserRomajiRule): string =>
  canonical({ base: rule.base, overrides: rule.overrides, generateSokuon: rule.generateSokuon });

const fingerContent = (assignment: FingerAssignment): string =>
  canonical({ keyFinger: assignment.keyFinger, homeKey: assignment.homeKey });

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
  readonly content: (item: T) => string;
  /** 別名で足す時の組み替え（新しいidと名前）。 */
  readonly rebuild: (item: T, id: string, name: string) => T;
}

/** 重ならない新しいid。`stamp`は1回の読み込みで固定の値で、同じ入力なら同じidになる。 */
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

function mergeKind<T extends Item>(kind: MergeKind<T>, stamp: string): {
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
    if (existing !== undefined && kind.content(existing) === kind.content(incoming)) {
      idMap.set(incoming.id, existing.id);
      entries.push({ assetKind: kind.assetKind, name: incoming.name, outcome: { kind: 'skipped-same', existingName: existing.name } });
      continue;
    }
    const addedId = freshId(kind.idPrefix, stamp, new Set(byId.keys()), kind.builtinIds);
    const addedName = freshName(incoming.name, names);
    const added = kind.rebuild(incoming, addedId, addedName);
    items.push(added);
    byId.set(addedId, added);
    names.add(addedName);
    idMap.set(incoming.id, addedId);
    entries.push({ assetKind: kind.assetKind, name: incoming.name, outcome: { kind: 'added-renamed', addedName, addedId } });
  }
  return { items, entries, idMap };
}

/**
 * 読み込んだ資産を手元に突き合わせる。同じidが手元にある時、
 * - 中身が同じ（`layoutContent`等の項目が一致。名前だけが違っても同じとみなす）なら何も足さない。
 *   同じファイルを二度読んでも増えず、名前を変えた手元のものを元の名前の複製で散らかさない
 * - 中身が違うなら手元を残し、読み込んだ側を新しいidと「名前 (2)」の別名で足す
 * 組み込みと同じidは中身を問わず別のidで足す。ローマ字規則を先に突き合わせ、配列の推奨の規則が別のidになったら
 * 配列の参照も振り直す（振り直した後の参照で配列の中身を比べる）。
 */
export function mergeUserAssets(current: UserAssetsHoldings, incoming: UserAssetsBundle, stamp: string): UserAssetsMerge {
  const rules = mergeKind<UserRomajiRule>({
    assetKind: 'romaji-rule',
    idPrefix: 'romaji-',
    current: current.userRomajiRules,
    incoming: incoming.romajiRules,
    builtinIds: isBuiltin,
    content: ruleContent,
    rebuild: (rule, id, name) => ({ ...rule, id, name }),
  }, stamp);
  const layouts = mergeKind<UserLayout>({
    assetKind: 'layout',
    idPrefix: 'user-',
    current: current.userLayouts,
    incoming: incoming.layouts.map((layout) => ({ ...layout, romaji: rules.idMap.get(layout.romaji) ?? layout.romaji })),
    builtinIds: (id) => LAYOUT_BY_ID.has(id),
    content: layoutContent,
    rebuild: (layout, id, name) => ({ ...layout, id, name }),
  }, stamp);
  const fingers = mergeKind<FingerAssignment>({
    assetKind: 'finger-assignment',
    idPrefix: 'finger-',
    current: current.fingerAssignments,
    incoming: incoming.fingerAssignments,
    builtinIds: (id) => Object.hasOwn(FINGER_ASSIGNMENT_REGISTRY, id),
    content: fingerContent,
    rebuild: (assignment, id, name) => ({ ...assignment, id, name }),
  }, stamp);
  return {
    assets: { userLayouts: layouts.items, userRomajiRules: rules.items, fingerAssignments: fingers.items },
    entries: [...layouts.entries, ...rules.entries, ...fingers.entries],
  };
}

/**
 * ファイルから読んだ自作の資産を手元へ足す。足すものが無ければ何もしない。
 * 3つの資産を1回の変更で書くので、元に戻すと全部が戻る。
 */
export function importUserAssetsCommand(incoming: UserAssetsBundle, stamp: string): Command<KeydistAssets> {
  return (current) => {
    const merged = mergeUserAssets(current, incoming, stamp).assets;
    const changes: Partial<KeydistAssets> = {
      ...(merged.userLayouts.length === current.userLayouts.length ? {} : { userLayouts: merged.userLayouts }),
      ...(merged.userRomajiRules.length === current.userRomajiRules.length ? {} : { userRomajiRules: merged.userRomajiRules }),
      ...(merged.fingerAssignments.length === current.fingerAssignments.length ? {} : { fingerAssignments: merged.fingerAssignments }),
    };
    if (Object.keys(changes).length === 0) return { kind: 'no-op' };
    return { kind: 'applied', label: '自作の資産を読み込む', changes };
  };
}

/** 読み取り結果。 */
export type UserAssetsFileReadResult =
  | { readonly ok: false; readonly message: string; readonly details: readonly string[] }
  | { readonly ok: true; readonly bundle: UserAssetsBundle; readonly dropped: readonly CodecDiagnostic[] };

const fail = (message: string, ...details: string[]): UserAssetsFileReadResult => ({ ok: false, message, details });

/** ファイルの中身を分類し、読める資産を取り出す。壊れた要素は捨てて残りを読み、捨てた診断を返す。 */
export function parseUserAssetsFile(text: string): UserAssetsFileReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return fail('ファイルとして読めませんでした', error instanceof Error ? error.message : String(error));
  }
  if (!isRecord(parsed) || parsed.format !== USER_ASSETS_FILE_FORMAT) {
    return fail('keydistの自作の資産のファイルではありません', `format: ${JSON.stringify(isRecord(parsed) ? parsed.format : undefined) ?? 'undefined'}`);
  }
  for (const key of ['layouts', 'romajiRules', 'fingerAssignments']) {
    const list = parsed[key];
    if (Array.isArray(list) && list.length > USER_ASSETS_FILE_MAX_ITEMS) {
      return fail(`件数が多すぎます（${USER_ASSETS_FILE_MAX_ITEMS}件まで）`, `${key}: ${list.length}`);
    }
  }
  const decoded = USER_ASSETS_FILE_CODEC.decode(parsed);
  if (!decoded.ok) {
    const { reason } = decoded;
    if (reason.kind === 'future-version') {
      return fail('新しい形式のファイルです。keydistを更新してから読み込んでください', `version: ${reason.version} (対応: ${reason.currentVersion})`);
    }
    return fail('ファイルの形式が正しくありません', JSON.stringify(reason));
  }
  const { layouts, romajiRules, fingerAssignments } = decoded.value;
  if (layouts.length + romajiRules.length + fingerAssignments.length === 0) {
    return fail(
      '読み込める資産がありませんでした',
      ...decoded.diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`),
    );
  }
  return { ok: true, bundle: decoded.value, dropped: decoded.diagnostics };
}
