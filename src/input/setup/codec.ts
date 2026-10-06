import * as v from 'valibot';
import { decodeDroppingInvalid, defineAssetCodec, isRecord, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import { decodeCascadeOverrides, encodeCascadeOverrides, type CascadeOverrides, type ItemSchemaMap } from '#input/settings/index.ts';
import { dropSetupOverrides } from './overrides.ts';
import type { Setup } from './types.ts';
import type { SetupLibrary } from './collection.ts';

/**
 * Setupの手持ち（`SetupLibrary<V>`）のcodec。
 * `Setup`本体（id・番号・配列id・物理配列id・ラベル）と、カスケードの`setup`レベルを
 * 含む全レベルの上書きをまとめて1つの資産として運ぶ（overrides.ts「Setup固有の上書きは
 * カスケードのsetupレベルに置く」）。
 *
 * 項目のschemaは`ItemSchemaMap<V>`として呼び出し側（engine層。
 * カスケード項目のschemaはengineが持つ）から渡してもらう。ここは`Setup`自体の形だけを知る。
 */

/**
 * `Setup`の各fieldの寛容さ:
 * - id / layoutId / shapeId: この3つが無いとSetupとして機能しない（`resolveSetup`が
 *   参照できない・Setupを一覧に出せない）。1つでも欠けたり型が違えば**Setup全体を
 *   捨てる**（`decodeDroppingInvalid`を要素単位で使う。既存の`decodeUserLayouts`と
 *   同じ「壊れた要素だけ捨てて残りを読む」方針）
 * - label: 無くても自動命名（naming.ts）に落ちるだけなので、無効なら**フィールドだけ
 *   落として省略**（Setup自体は残す）
 */
const setupSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  // 無い・不正な時はSetupを捨てず、読み込み後に配り直す（`assignMissingNumbers`）
  number: v.optional(v.unknown()),
  layoutId: v.pipe(v.string(), v.minLength(1)),
  shapeId: v.pipe(v.string(), v.minLength(1)),
  label: v.optional(v.pipe(v.string(), v.minLength(1))),
});

type RawSetup = Omit<Setup, 'number'> & { readonly number?: unknown };

/** 入力配列での位置を持たせる。診断のpathは、捨てた要素を除いた後の位置ではなく入力の位置で作るため。 */
interface IndexedRawSetup {
  readonly raw: RawSetup;
  readonly index: number;
}

function isSetupNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

/**
 * 番号が無い・不正・他と重複するSetupに、並びの順で「その時点の最大＋1」を配る。
 * 番号を持つ最初のSetupはそのまま残す。保存済みの番号を動かさないので、読み込みで既存の番号は変わらない。
 * 番号が無いだけ（旧い保存値）なら診断は積まない。不正な値・重複を置き換えた時は積む（捨てた値には診断）。
 */
function assignMissingNumbers(indexed: readonly IndexedRawSetup[], path: string, diagnostics: CodecDiagnostic[]): Setup[] {
  const used = new Set<number>();
  const kept = indexed.map(({ raw, index }) => {
    if (raw.number === undefined) return undefined;
    if (!isSetupNumber(raw.number)) {
      diagnostics.push({ path: `${path}[${index}].number`, message: '番号として読めないため、振り直した' });
      return undefined;
    }
    if (used.has(raw.number)) {
      diagnostics.push({ path: `${path}[${index}].number`, message: `番号「${raw.number}」が重複しているため、振り直した` });
      return undefined;
    }
    used.add(raw.number);
    return raw.number;
  });
  let next = Math.max(0, ...used) + 1;
  return indexed.map(({ raw }, i) => ({ ...raw, number: kept[i] ?? next++ }));
}

function decodeSetups(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): Setup[] {
  if (!Array.isArray(raw)) {
    // 値があって配列でない時は、全件が消えることを診断で示す（無い時は空の手持ちで正しい）
    if (raw !== undefined) diagnostics.push({ path, message: '配列形式でないためSetupを捨てた' });
    return [];
  }
  const seen = new Set<string>();
  const setups: IndexedRawSetup[] = [];
  raw.forEach((candidate, index) => {
    const decoded = decodeDroppingInvalid(setupSchema, candidate, `${path}[${index}]`, diagnostics);
    if (decoded === undefined) return;
    if (seen.has(decoded.id)) {
      diagnostics.push({ path: `${path}[${index}]`, message: `id「${decoded.id}」が重複しているため捨てた` });
      return;
    }
    seen.add(decoded.id);
    setups.push({ raw: decoded as RawSetup, index });
  });
  return assignMissingNumbers(setups, path, diagnostics);
}

/**
 * decodeSetups側で捨てた（壊れていた・idが重複していた）、あるいは元々setups配列に
 * 存在しないSetup idの`overrides.setup[id]`は孤児になる（`resolveSetup`から二度と
 * 参照されない上書き）。`deleteSetup`（collection.ts）が生きているSetupを消す時に
 * `dropSetupOverrides`で一緒に消しているのと同じ理由で、decode時にも同じ整合を取る
 * （Setup固有の上書きはカスケードのsetupレベルに置くので、Setup本体と
 * 上書きの対応が取れていないと`resolveSetup`後の解決やUIの一覧表示が食い違う）。
 * 捨てる時は必ず診断を積む（「捨てた値には必ず診断」）。
 */
function dropOrphanSetupOverrides<V>(
  overrides: CascadeOverrides<V>,
  survivingSetupIds: ReadonlySet<string>,
  diagnostics: CodecDiagnostic[],
): CascadeOverrides<V> {
  let result = overrides;
  for (const setupId of Object.keys(overrides.setup ?? {})) {
    if (survivingSetupIds.has(setupId)) continue;
    diagnostics.push({
      path: `overrides.setup.${setupId}`,
      message: `Setup「${setupId}」の手持ちが無いため、対応する上書きを孤児として捨てた`,
    });
    result = dropSetupOverrides(result, setupId);
  }
  return result;
}

export function setupLibraryCodec<V>(
  itemSchemas: ItemSchemaMap<V>,
  currentVersion: number,
): AssetCodec<SetupLibrary<V>> {
  return defineAssetCodec<SetupLibrary<V>>({
    currentVersion,
    decodePayload: (payload, diagnostics) => {
      if (!isRecord(payload)) return undefined;
      const setups = decodeSetups(payload.setups, 'setups', diagnostics);
      const overrides = decodeCascadeOverrides(itemSchemas, payload.overrides, 'overrides', diagnostics);
      const survivingSetupIds = new Set(setups.map((setup) => setup.id));
      return {
        setups,
        overrides: dropOrphanSetupOverrides(overrides, survivingSetupIds, diagnostics),
      };
    },
    encodePayload: (value) => ({
      setups: value.setups.map((setup) => ({ ...setup })),
      overrides: encodeCascadeOverrides(value.overrides),
    }),
  });
}
