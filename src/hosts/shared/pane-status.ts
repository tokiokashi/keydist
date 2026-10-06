import type { EngineRequestError, EngineRequestState } from '#engine/request.ts';
import { describeResolvedInputError } from '#engine/resolved-input-errors.ts';

export { describeResolvedInputError } from '#engine/resolved-input-errors.ts';

/**
 * ペインの状態。
 *
 * `engine/request.ts` の `EngineRequestState` をそのまま採用する。ペイン固有の型へ
 * 包み直さない理由: 状態の名前（idle/computing/stale/ready/failed）も打ち切りの規則も
 * すでにengine側が確定しているので、ここで別の型に変換すると「何が最新か」の判断を
 * 2箇所（`request.ts`とここ）に分けて持つことになる。ここが持つのは、その状態を
 * **ペインでどう見せるか**（文言・エラーの説明文）だけにする。
 */
export type PaneEngineState<T> = EngineRequestState<T>;

/**
 * 本体の値（抽出）と、描画に一緒に要る値（Trace）の2チャンネルを、ペインの状態1つに畳む。
 * 2つは別チャンネルで解決するので、片方だけ揃った瞬間がありうる。バッジを抽出だけで決めると
 * 「ready なのに本文は計算中」という食い違いが出るため、両方が揃うまでは揃っていない側に合わせる。
 * 失敗はどちらのものでもそのまま出す（同じ解決済み入力なので、原因は通常同じ）。
 */
export function combinePaneStates<T>(
  primary: PaneEngineState<T>,
  companion: PaneEngineState<unknown>,
): PaneEngineState<T> {
  if (primary.status === 'failed') return primary;
  if (companion.status === 'failed') return companion;
  if (primary.status === 'idle' || primary.status === 'computing') return primary;
  if (companion.status === 'idle' || companion.status === 'computing') return { status: 'computing' };
  if (companion.status === 'stale') return { status: 'stale', value: primary.value };
  return primary;
}

/** ペインの見出し脇に出す、状態そのものの短い文言。値（`ready`/`stale`）は別途描く。 */
export function paneStatusLabel(status: PaneEngineState<unknown>['status']): string {
  switch (status) {
    // idleは最初のeffectが依頼を出すまでの描画にしかならない。依頼が出る前の状態を「未計算」と出しても、
    // 利用者が見て取れる意味が無い
    case 'idle': return '';
    case 'computing': return '計算中…';
    case 'stale': return '計算中…（直前の結果を表示）';
    case 'ready': return '';
    case 'failed': return '失敗';
  }
}

/** `EngineRequestError`（依頼そのものの失敗と計算中の例外の2種）の、利用者向けの1文。 */
export function describeEngineRequestError(error: EngineRequestError): string {
  if (error.kind === 'resolution') return describeResolvedInputError(error.error);
  return '計算中にエラーが発生した。条件を変えて試してほしい';
}

/** 例外の原文（メッセージとstack）。不具合報告用に折りたたんで出す。 */
export function describeErrorDetail(error: unknown): string[] {
  if (error instanceof Error) {
    return [error.stack && error.stack.includes(error.message) ? error.stack : `${error.name}: ${error.message}`];
  }
  return [String(error)];
}

/** `describeEngineRequestError`の1文に添える詳細。原文が無い失敗（参照切れ等）は空。 */
export function engineRequestErrorDetail(error: EngineRequestError): string[] {
  if (error.kind === 'exception') return describeErrorDetail(error.error);
  if (error.error.kind === 'geometry') return [error.error.message];
  return [];
}

/** Trace生成の診断（キーidを含む）につける、利用者向けの1文。 */
export const TRACE_ERRORS_SENTENCE = '配列と物理配列が噛み合わず、一部の文字を計算に含められなかった';
