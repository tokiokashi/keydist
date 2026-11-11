import { defineAssetCodec, droppedDuplicateId, droppedNotArray, isRecord, type AssetCodec, type CodecDiagnostic } from '../codec/index.ts';
import { kanaToRomajiChunks } from '../romaji/kunrei.ts';
import { katakanaToHiragana } from '../text/reading.ts';

/**
 * コンボの組（仕様 §4.3「利用者が定義したコンボ」）。配列の定義に入らない、利用者の資産。
 * 押すキーは英字の配列でそのキーが出す字で持ち、出力は組を作る時に選んだローマ字規則（基準の綴り）で展開した綴りで持つ。
 * 手持ちを操作する純関数は、`input/romaji/rule-edit.ts`と同じ規約で、変化が無ければ同一の配列参照を返す。
 */

/** コンボの組のidの接頭辞。 */
export const COMBO_SET_ID_PREFIX = 'combo-set-';

export const newComboSetId = (): string => `${COMBO_SET_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 1件のコンボ。キーは2つ以上で、同じ字を重ねない。出力は基準の綴りで展開したローマ字の綴り。 */
export interface ComboSetEntry {
  readonly keys: readonly string[];
  readonly output: string;
}

export interface ComboSet {
  readonly id: string;
  readonly name: string;
  /** 組を作る時に選んだローマ字規則（組み込みか自作のid）。出力の綴りはこの規則で展開した。 */
  readonly romajiRuleId: string;
  readonly combos: readonly ComboSetEntry[];
}

/** 押すキーに使える字。英字の文字を出すキーだけを選べる。 */
const COMBO_KEY = /^[a-z]$/;

export const MIN_COMBO_KEYS = 2;

export const isComboKey = (key: unknown): key is string => typeof key === 'string' && COMBO_KEY.test(key);

/** 順序によらず同じキーの集合かを比べる鍵。 */
export const comboKeySetKey = (keys: readonly string[]): string => [...keys].sort().join('');

const comboIdentity = (combo: ComboSetEntry): string => `${comboKeySetKey(combo.keys)}\u0000${combo.output}`;

function isComboSetEntry(value: unknown): value is ComboSetEntry {
  if (!isRecord(value)) return false;
  const { keys, output } = value;
  return (
    Array.isArray(keys) &&
    keys.length >= MIN_COMBO_KEYS &&
    keys.every(isComboKey) &&
    new Set(keys).size === keys.length &&
    typeof output === 'string' &&
    output.length > 0 &&
    !/\s/u.test(output)
  );
}

/**
 * 保存された組の一覧を読む。壊れた組とid重複は捨てて診断を積む。壊れたコンボは、その1件だけを捨てる。
 * 値があって配列でない時は全件が消えるので診断を積み、`undefined`（項目が無い）は空で正しいので積まない。
 */
export function decodeComboSets(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): ComboSet[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) diagnostics.push({ path, message: droppedNotArray('コンボの組') });
    return [];
  }
  const seen = new Set<string>();
  const sets: ComboSet[] = [];
  raw.forEach((candidate: unknown, index) => {
    const where = `${path}[${index}]`;
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      candidate.id.length === 0 ||
      typeof candidate.name !== 'string' ||
      candidate.name.length === 0 ||
      typeof candidate.romajiRuleId !== 'string' ||
      candidate.romajiRuleId.length === 0 ||
      !Array.isArray(candidate.combos)
    ) {
      diagnostics.push({ path: where, message: '形式が不正なためコンボの組を捨てました' });
      return;
    }
    if (seen.has(candidate.id)) {
      diagnostics.push({ path: where, message: droppedDuplicateId(candidate.id) });
      return;
    }
    seen.add(candidate.id);
    const combos: ComboSetEntry[] = [];
    const seenCombos = new Set<string>();
    candidate.combos.forEach((combo: unknown, comboIndex) => {
      if (!isComboSetEntry(combo)) {
        diagnostics.push({ path: `${where}.combos[${comboIndex}]`, message: '形式が不正なためコンボを捨てました' });
        return;
      }
      const identity = comboIdentity(combo);
      if (seenCombos.has(identity)) {
        diagnostics.push({ path: `${where}.combos[${comboIndex}]`, message: '同じコンボが重複しているため捨てました' });
        return;
      }
      seenCombos.add(identity);
      combos.push({ keys: [...combo.keys], output: combo.output });
    });
    sets.push({ id: candidate.id, name: candidate.name, romajiRuleId: candidate.romajiRuleId, combos });
  });
  return sets;
}

export function encodeComboSets(sets: readonly ComboSet[]): readonly Record<string, unknown>[] {
  return sets.map((set) => ({
    id: set.id,
    name: set.name,
    romajiRuleId: set.romajiRuleId,
    combos: set.combos.map((combo) => ({ keys: [...combo.keys], output: combo.output })),
  }));
}

/** コンボの組の手持ちのcodec（版1）。 */
export const COMBO_SETS_CODEC: AssetCodec<readonly ComboSet[]> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => (isRecord(payload) ? decodeComboSets(payload.comboSets, 'comboSets', diagnostics) : undefined),
  encodePayload: (value) => ({ comboSets: encodeComboSets(value) }),
});

export type ExpandedComboOutput = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly problem: string };

/**
 * かなで入力した出力を、基準の綴りのテーブルで展開する。見出しは最長一致で切り出す（仕様 §4.3）。
 * テーブルの見出しに当たらない文字が1つでもあれば、そのかなは作らない。片仮名は平仮名として読む。
 */
export function expandComboOutput(kana: string, table: ReadonlyMap<string, string>): ExpandedComboOutput {
  const text = katakanaToHiragana(kana.trim());
  if (text === '') return { ok: false, problem: '出力のかなを入力してください' };
  if (/\s/u.test(text)) return { ok: false, problem: '出力のかなに空白を含めないでください' };
  const chunks = kanaToRomajiChunks(text, new Map(table));
  const unknown = chunks.filter((chunk) => !chunk.fromTable).map((chunk) => chunk.kana);
  if (unknown.length > 0) {
    return { ok: false, problem: `基準の綴りに無い文字があります: ${[...new Set(unknown)].join('')}` };
  }
  return { ok: true, output: chunks.map((chunk) => chunk.roman).join('') };
}

export type ParsedComboKeys = { readonly ok: true; readonly keys: readonly string[] } | { readonly ok: false; readonly problem: string };

/** 押すキーの入力（`st` や `s t`）を読む。英字の文字だけを、入力の順のまま小文字で返す。 */
export function parseComboKeys(text: string): ParsedComboKeys {
  const keys = [...text.replace(/\s+/gu, '').toLowerCase()];
  if (keys.length === 0) return { ok: false, problem: '押すキーを入力してください' };
  if (!keys.every(isComboKey)) return { ok: false, problem: '押すキーは、英字の文字だけで入力してください' };
  if (new Set(keys).size !== keys.length) return { ok: false, problem: '同じキーを重ねないでください' };
  if (keys.length < MIN_COMBO_KEYS) return { ok: false, problem: `押すキーは${MIN_COMBO_KEYS}つ以上を入力してください` };
  return { ok: true, keys };
}

export type BuiltComboEntry = { readonly ok: true; readonly entry: ComboSetEntry } | { readonly ok: false; readonly problem: string };

/** 画面の入力（押すキーの文字と出力のかな）から、保存する1件を作る。 */
export function buildComboEntry(keysText: string, kana: string, table: ReadonlyMap<string, string>): BuiltComboEntry {
  const keys = parseComboKeys(keysText);
  if (!keys.ok) return keys;
  const output = expandComboOutput(kana, table);
  if (!output.ok) return output;
  return { ok: true, entry: { keys: keys.keys, output: output.output } };
}

/** 新規作成。コンボを持たない組から始める。 */
export function createComboSet(sets: readonly ComboSet[], generateId: () => string, name: string, romajiRuleId: string): readonly ComboSet[] {
  return [...sets, { id: generateId(), name, romajiRuleId, combos: [] }];
}

/** 改名。対象が存在しない、または既に同じ名前なら何もしない。 */
export function renameComboSet(sets: readonly ComboSet[], id: string, name: string): readonly ComboSet[] {
  const target = sets.find((set) => set.id === id);
  if (target === undefined || target.name === name) return sets;
  return sets.map((set) => (set.id === id ? { ...set, name } : set));
}

/** 削除。対象が存在しないなら何もしない。 */
export function deleteComboSet(sets: readonly ComboSet[], id: string): readonly ComboSet[] {
  return sets.some((set) => set.id === id) ? sets.filter((set) => set.id !== id) : sets;
}

export type ComboAddResult = { readonly ok: true; readonly sets: readonly ComboSet[] } | { readonly ok: false; readonly problem: string };

/** コンボを1件足す。対象が存在しない時と、同じキーの集合と出力のコンボが既にある時は、足さずに理由を返す。 */
export function addComboToSet(sets: readonly ComboSet[], id: string, entry: ComboSetEntry): ComboAddResult {
  const target = sets.find((set) => set.id === id);
  if (target === undefined) return { ok: false, problem: 'コンボの組が見つかりません' };
  const identity = comboIdentity(entry);
  if (target.combos.some((combo) => comboIdentity(combo) === identity)) {
    return { ok: false, problem: '同じコンボが既にあります' };
  }
  const keySet = comboKeySetKey(entry.keys);
  if (target.combos.some((combo) => comboKeySetKey(combo.keys) === keySet)) {
    return { ok: false, problem: '同じキーの組に別の出力のコンボが既にあります' };
  }
  const added = { keys: [...entry.keys], output: entry.output };
  return { ok: true, sets: sets.map((set) => (set.id === id ? { ...set, combos: [...set.combos, added] } : set)) };
}

/** コンボを1件外す。位置が範囲外なら何もしない。 */
export function removeComboFromSet(sets: readonly ComboSet[], id: string, index: number): readonly ComboSet[] {
  const target = sets.find((set) => set.id === id);
  if (target === undefined || index < 0 || index >= target.combos.length) return sets;
  return sets.map((set) => (set.id === id ? { ...set, combos: set.combos.filter((_, position) => position !== index) } : set));
}
