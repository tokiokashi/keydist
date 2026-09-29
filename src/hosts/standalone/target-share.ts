import * as v from 'valibot';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import { decodeDroppingInvalid, type CodecDiagnostic } from '#input/codec/index.ts';
import { analysisTargetKey, effectiveLabel, type AnalysisTarget, type Setup } from '#input/setup/index.ts';

/**
 * 個別画面の共有リンクに載せる対象の読み書き（#719）。純粋な部分だけを持ち、URLやhistoryには触らない。
 *
 * 対象は次の形の参照文字列で運ぶ。
 * - `layout:<id>`: 組み込みの配列。idは組み込みの定義そのもので、どの端末でも同じ配列を指すので、そのまま開く
 * - `user-layout:<名前>` / `setup:<名前>`: 自作の配列・Setup。idは端末ごとの値で受け取った側には意味が無いので、
 *   名前だけを載せて、受け取った側で同じ名前のものを探す（無ければ「見つからない」と示す）
 *
 * パラメータは Single が `target`、Multi が `targets`（対象ごとに繰り返す。並び順ごと運ぶ。色は並びから決まる）と
 * `baseline`（比較表の基準）。Multiの対象を1つの値へカンマで詰めないのは、名前がカンマを含みうるため。
 *
 * 外から来る値なので、資産と同じcodecの境界（valibot + `decodeDroppingInvalid`）を通し、
 * 件数と1件の長さに上限を置く（共有リンクのサイズ上限。#544 §8-3）。
 */

export const SHARE_TARGET_PARAM = 'target';
export const SHARE_TARGETS_PARAM = 'targets';
export const SHARE_BASELINE_PARAM = 'baseline';

/** 1つのリンクが運ぶ対象の件数の上限。組み込みの配列を全部並べても収まる数にしてある。 */
export const SHARE_MAX_TARGETS = 40;
/** 参照1件の長さの上限（名前の長さを含む）。 */
export const SHARE_MAX_REF_LENGTH = 200;

export type TargetRef =
  | { readonly kind: 'layout'; readonly layoutId: string }
  | { readonly kind: 'user-layout'; readonly name: string }
  | { readonly kind: 'setup'; readonly name: string };

/** 参照を探す・作るのに要る手持ち。 */
export interface TargetShareSource {
  readonly layouts: ReadonlyMap<string, Layout>;
  /** `layouts`のうち自作の配列のid。 */
  readonly userLayoutIds: ReadonlySet<string>;
  readonly shapes: ReadonlyMap<string, PhysicalShape>;
  readonly setups: readonly Setup[];
}

const refSchema = v.pipe(
  v.string(),
  v.maxLength(SHARE_MAX_REF_LENGTH),
  v.regex(/^(?:layout|user-layout|setup):\S.*$/),
);

/** 壊れていれば`undefined`（診断を積んで、その参照だけを捨てる）。 */
export function decodeTargetRef(raw: string, path: string, diagnostics: CodecDiagnostic[]): TargetRef | undefined {
  const checked = decodeDroppingInvalid(refSchema, raw, path, diagnostics);
  if (checked === undefined) return undefined;
  const colon = checked.indexOf(':');
  const prefix = checked.slice(0, colon);
  const rest = checked.slice(colon + 1);
  if (prefix === 'layout') return { kind: 'layout', layoutId: rest };
  return prefix === 'user-layout' ? { kind: 'user-layout', name: rest } : { kind: 'setup', name: rest };
}

/** Setupを名前で指す時の名前。ユーザーが付けたラベルがあればそれ、無ければ「配列名/物理配列名」。 */
function setupShareName(setup: Setup, source: TargetShareSource): string {
  return effectiveLabel(setup.label)
    ?? `${source.layouts.get(setup.layoutId)?.name ?? ''}/${source.shapes.get(setup.shapeId)?.name ?? ''}`;
}

/** 対象を参照へ。手持ちに無い対象（削除されたSetup等）は載せる名前が無いので`undefined`。 */
export function encodeTargetRef(target: AnalysisTarget, source: TargetShareSource): string | undefined {
  if (target.kind === 'layout') {
    const layout = source.layouts.get(target.layoutId);
    if (layout === undefined) return undefined;
    return source.userLayoutIds.has(target.layoutId) ? `user-layout:${layout.name}` : `layout:${target.layoutId}`;
  }
  const setup = source.setups.find((s) => s.id === target.setupId);
  return setup === undefined ? undefined : `setup:${setupShareName(setup, source)}`;
}

export type TargetRefResolution =
  | { readonly ok: true; readonly target: AnalysisTarget }
  /** `name`は画面に出せる名前。組み込みのidはこの版に無いだけで名前を持たないので`undefined`。 */
  | { readonly ok: false; readonly kind: TargetRef['kind']; readonly name: string | undefined };

/** 参照を、この端末の手持ちの対象へ。同じ名前が複数あれば一覧の先頭のもの。 */
export function resolveTargetRef(ref: TargetRef, source: TargetShareSource): TargetRefResolution {
  if (ref.kind === 'layout') {
    const found = source.layouts.has(ref.layoutId) && !source.userLayoutIds.has(ref.layoutId);
    return found
      ? { ok: true, target: { kind: 'layout', layoutId: ref.layoutId } }
      : { ok: false, kind: 'layout', name: undefined };
  }
  if (ref.kind === 'user-layout') {
    for (const layout of source.layouts.values()) {
      if (source.userLayoutIds.has(layout.id) && layout.name === ref.name) {
        return { ok: true, target: { kind: 'layout', layoutId: layout.id } };
      }
    }
    return { ok: false, kind: 'user-layout', name: ref.name };
  }
  const setup = source.setups.find((s) => setupShareName(s, source) === ref.name);
  return setup === undefined
    ? { ok: false, kind: 'setup', name: ref.name }
    : { ok: true, target: { kind: 'setup', setupId: setup.id } };
}

/** Singleの対象をURLへ。載せられなければ何も足さない。 */
export function encodeSingleTargetToUrl(target: AnalysisTarget, source: TargetShareSource): URLSearchParams {
  const params = new URLSearchParams();
  const ref = encodeTargetRef(target, source);
  if (ref !== undefined) params.set(SHARE_TARGET_PARAM, ref);
  return params;
}

/**
 * Multiの集合をURLへ。`targets`は加えた順（`MultiTargetSelection.targets`の順）で運ぶ。
 * `baseline`は効いている基準（集合に含まれるもの。`effectiveMultiBaseline`）を渡す。
 */
export function encodeMultiTargetsToUrl(
  targets: readonly AnalysisTarget[],
  baseline: AnalysisTarget | undefined,
  source: TargetShareSource,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const target of targets.slice(0, SHARE_MAX_TARGETS)) {
    const ref = encodeTargetRef(target, source);
    if (ref !== undefined) params.append(SHARE_TARGETS_PARAM, ref);
  }
  if (baseline !== undefined) {
    const ref = encodeTargetRef(baseline, source);
    if (ref !== undefined) params.set(SHARE_BASELINE_PARAM, ref);
  }
  return params;
}

export interface SharedTargetsNotice {
  /** 手持ちに無かった自作の配列・Setupの名前（画面に出す）。 */
  readonly notFound: readonly { readonly kind: 'user-layout' | 'setup'; readonly name: string }[];
  /** 読み取れなかった・この版に無い参照の件数。 */
  readonly unreadable: number;
}

export type SharedTargetsKind = 'single' | 'multi';

/** この画面が読むパラメータ名（取り込んだ後にURLから消す）。 */
export function sharedTargetParamNames(kind: SharedTargetsKind): readonly string[] {
  return kind === 'single' ? [SHARE_TARGET_PARAM] : [SHARE_TARGETS_PARAM, SHARE_BASELINE_PARAM];
}

/** 共有リンクにこの画面の対象を運ぶパラメータがあるか。 */
export function hasSharedTargetParams(search: string, kind: SharedTargetsKind): boolean {
  const params = new URLSearchParams(search);
  return sharedTargetParamNames(kind).some((name) => params.has(name));
}

interface NoticeBuilder {
  readonly notFound: { kind: 'user-layout' | 'setup'; name: string }[];
  unreadable: number;
}

function resolveAll(
  raws: readonly string[],
  path: string,
  source: TargetShareSource,
  diagnostics: CodecDiagnostic[],
  notice: NoticeBuilder,
): AnalysisTarget[] {
  const found: AnalysisTarget[] = [];
  raws.forEach((raw, index) => {
    const ref = decodeTargetRef(raw, `${path}[${index}]`, diagnostics);
    if (ref === undefined) {
      notice.unreadable += 1;
      return;
    }
    const resolution = resolveTargetRef(ref, source);
    if (resolution.ok) {
      found.push(resolution.target);
    } else if (resolution.kind === 'layout') {
      notice.unreadable += 1;
    } else if (!notice.notFound.some((item) => item.kind === resolution.kind && item.name === resolution.name)) {
      notice.notFound.push({ kind: resolution.kind, name: resolution.name! });
    }
  });
  return found;
}

export interface DecodedSingleTarget {
  readonly present: boolean;
  readonly target: AnalysisTarget | undefined;
  readonly notice: SharedTargetsNotice;
}

export function decodeSingleTargetFromUrl(
  params: URLSearchParams,
  source: TargetShareSource,
  diagnostics: CodecDiagnostic[],
): DecodedSingleTarget {
  const notice: NoticeBuilder = { notFound: [], unreadable: 0 };
  const raw = params.get(SHARE_TARGET_PARAM);
  if (raw === null) return { present: false, target: undefined, notice };
  const [target] = resolveAll([raw], `url.${SHARE_TARGET_PARAM}`, source, diagnostics, notice);
  return { present: true, target, notice };
}

export interface DecodedMultiTargets {
  readonly present: boolean;
  /** 手持ちで解決できた対象。リンクの並びのまま、重複は先に出たものだけ。 */
  readonly targets: readonly AnalysisTarget[];
  /** 集合に含まれる時だけ持つ。 */
  readonly baseline: AnalysisTarget | undefined;
  readonly notice: SharedTargetsNotice;
}

export function decodeMultiTargetsFromUrl(
  params: URLSearchParams,
  source: TargetShareSource,
  diagnostics: CodecDiagnostic[],
): DecodedMultiTargets {
  const notice: NoticeBuilder = { notFound: [], unreadable: 0 };
  const rawTargets = params.getAll(SHARE_TARGETS_PARAM);
  const rawBaseline = params.get(SHARE_BASELINE_PARAM);
  if (rawTargets.length === 0 && rawBaseline === null) return { present: false, targets: [], baseline: undefined, notice };

  if (rawTargets.length > SHARE_MAX_TARGETS) {
    diagnostics.push({ path: `url.${SHARE_TARGETS_PARAM}`, message: `対象は${SHARE_MAX_TARGETS}件までのため超過分を捨てた` });
    notice.unreadable += rawTargets.length - SHARE_MAX_TARGETS;
  }
  const resolved = resolveAll(rawTargets.slice(0, SHARE_MAX_TARGETS), `url.${SHARE_TARGETS_PARAM}`, source, diagnostics, notice);
  const seen = new Set<string>();
  const targets = resolved.filter((target) => {
    const key = analysisTargetKey(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 集合に含まれない基準は効かないので捨てる（集合の外の対象を基準にしない。`withMultiBaseline`と同じ規則）。
  let baseline: AnalysisTarget | undefined;
  if (rawBaseline !== null) {
    const [resolvedBaseline] = resolveAll([rawBaseline], `url.${SHARE_BASELINE_PARAM}`, source, diagnostics, notice);
    if (resolvedBaseline !== undefined && seen.has(analysisTargetKey(resolvedBaseline))) baseline = resolvedBaseline;
  }
  return { present: true, targets, baseline, notice };
}

const MAX_NAMES_SHOWN = 3;

/**
 * 取り込めなかった対象を伝える文（画面に出す）。何も無ければ空。
 * 名前は先頭の数件だけ出し、残りは件数にする。
 */
export function describeSharedTargetsNotice(notice: SharedTargetsNotice): readonly string[] {
  const lines: string[] = [];
  if (notice.notFound.length > 0) {
    const names = notice.notFound.slice(0, MAX_NAMES_SHOWN).map((item) =>
      item.kind === 'setup' ? `Setup「${item.name}」` : `自作の配列「${item.name}」`);
    const rest = notice.notFound.length - names.length;
    lines.push(`共有された${names.join('・')}${rest > 0 ? `ほか${rest}件` : ''}は、この端末に見つからなかった`);
  }
  if (notice.unreadable > 0) {
    lines.push(`共有リンクの対象のうち、読み取れないものがあった（${notice.unreadable}件）`);
  }
  return lines;
}
