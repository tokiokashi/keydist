import { defineAssetCodec, describeFileDecodeFailure, isRecord, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import type { Command } from '#input/commands/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { decodeUserLayouts, type UserLayout } from '#input/layouts/user-layouts.ts';
import { decodeUserRomajiRules, isBuiltin, ROMAJI_RULES, type UserRomajiRule } from '#input/romaji/rules.ts';
import { decodeUserFingerAssignments } from '#input/shapes/user-finger-assignments.ts';
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
 * 自作の配列・ローマ字規則・指の割り当て・Setupの書き出しファイルの形と、読み込み時の突き合わせ（DOMを使わない計算）。
 *
 * ファイルは `{ format, version, layouts, romajiRules, fingerAssignments, setups }`。`format` は書く直前に
 * `platform/browser-download.ts` が付け、読む時は `format` を見てからこのcodecへ渡す（プリセットのファイルと同じ封筒）。
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
  /** Setupと、そのSetupのレベルの条件。`setups`の無い古いファイルは空になる。 */
  readonly setups: readonly UserAssetSetup[];
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
      setups: decodeUserAssetSetups(payload.setups, 'setups', diagnostics),
    };
  },
  encodePayload: (value) => ({
    layouts: value.layouts.map((layout) => structuredClone(layout)),
    romajiRules: value.romajiRules.map((rule) => ({ ...rule, overrides: { ...rule.overrides } })),
    fingerAssignments: value.fingerAssignments.map((assignment) => structuredClone(assignment)),
    setups: encodeUserAssetSetups(value.setups),
  }),
});

export type UserAssetsHoldings = Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules' | 'fingerAssignments' | 'setupLibrary'>;

/**
 * 推奨の規則を、解決できるものだけ残した配列にする。組み込みでも`resolve`が返す先でもない規則を指す配列は、
 * 参照を外す（手元の規則に結び付かず、全体の値の規則で打つ配列になる。ローマ字を経ない配列は`romaji`を見ないので触らない）。
 */
function withResolvableRomaji(layout: UserLayout, resolve: (id: string) => string | undefined): UserLayout {
  if (layout.direct === true || layout.romaji === undefined) return layout;
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
export function userAssetsFileBody(assets: UserAssetsHoldings): Record<string, unknown> {
  const ruleIds = new Set(assets.userRomajiRules.map((rule) => rule.id));
  return USER_ASSETS_FILE_CODEC.encode({
    layouts: assets.userLayouts.map((layout) => withResolvableRomaji(layout, (id) => (ruleIds.has(id) ? id : undefined))),
    romajiRules: assets.userRomajiRules,
    fingerAssignments: assets.fingerAssignments,
    setups: userAssetSetupsOf(assets.setupLibrary).map((setup) =>
      withResolvableReferences(setup, {
        ruleIds,
        fingerAssignmentIds: new Set(assets.fingerAssignments.map((assignment) => assignment.id)),
      }),
    ),
  });
}

export type UserAssetKind = 'layout' | 'romaji-rule' | 'finger-assignment' | 'setup';

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
  | { readonly kind: 'skipped-same'; readonly existingName: string };

export interface UserAssetImportEntry {
  readonly assetKind: UserAssetKind;
  /** ファイルにあった名前。 */
  readonly name: string;
  readonly outcome: UserAssetImportOutcome;
}

export interface UserAssetsMerge {
  readonly assets: UserAssetsHoldings;
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
 * 数値に関わる項目はすべて比べる。値が無いこととfalseが同じ意味の `direct` だけ、省略を揃える。
 * `romaji` は推奨の規則の読み込み後のidで比べる。ローマ字を経ない配列は `romaji` を使わないので比べない。
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
    entries: [
      ...layouts.entries,
      ...rules.entries,
      ...fingers.entries,
      ...setups.entries.map((entry): UserAssetImportEntry => ({ assetKind: 'setup', ...entry })),
    ],
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

export function importUserAssetsCommand(incoming: UserAssetsBundle, stamp: string): UserAssetsImportPlan {
  let entries: readonly UserAssetImportEntry[] | undefined;
  const command: Command<KeydistAssets> = (current) => {
    const merge = mergeUserAssets(current, incoming, stamp);
    entries = merge.entries;
    const merged = merge.assets;
    const changes: Partial<KeydistAssets> = {
      ...(merged.userLayouts.length === current.userLayouts.length ? {} : { userLayouts: merged.userLayouts }),
      ...(merged.userRomajiRules.length === current.userRomajiRules.length ? {} : { userRomajiRules: merged.userRomajiRules }),
      ...(merged.fingerAssignments.length === current.fingerAssignments.length ? {} : { fingerAssignments: merged.fingerAssignments }),
      ...(merged.setupLibrary === current.setupLibrary ? {} : { setupLibrary: merged.setupLibrary }),
    };
    if (Object.keys(changes).length === 0) return { kind: 'no-op' };
    return { kind: 'applied', label: '自作の資産を読み込む', changes };
  };
  return { command, entries: () => entries };
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
  for (const key of ['layouts', 'romajiRules', 'fingerAssignments', 'setups']) {
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
  const { layouts, romajiRules, fingerAssignments, setups } = decoded.value;
  if (layouts.length + romajiRules.length + fingerAssignments.length + setups.length === 0) {
    return fail('読み込める資産がありませんでした', ...decoded.diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`));
  }
  return { ok: true, bundle: decoded.value, dropped: decoded.diagnostics };
}
