import type { EngineRequestError, EngineRequestState } from '#engine/request.ts';
import type { ResolvedInputError } from '#engine/resolved-input.ts';
import type { SetupReferenceError } from '#input/setup/index.ts';

/**
 * ペインの状態（#544 §8-1「計算中 / 古い結果を表示中 / 失敗」）。
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
    case 'idle': return '未計算';
    case 'computing': return '計算中…';
    case 'stale': return '計算中…（直前の結果を表示）';
    case 'ready': return '';
    case 'failed': return '失敗';
  }
}

function describeSetupReferenceError(error: SetupReferenceError): string {
  switch (error.kind) {
    case 'layout-missing': return `配列「${error.layoutId}」が見つからない（削除された可能性）`;
    case 'shape-missing': return `物理形状「${error.shapeId}」が見つからない（削除された可能性）`;
  }
}

/**
 * 解決済み入力の失敗（#544 §6「残る例外表示はSetup・配列・形状が削除された時だけ」・
 * §4「このテキストには使えないSetup」・§3「形状で実現できない値」）を、ペインに出す
 * 日本語の説明へ変換する。
 */
export function describeResolvedInputError(error: ResolvedInputError): string {
  switch (error.kind) {
    case 'reference':
      return error.errors.map(describeSetupReferenceError).join(' / ');
    case 'incompatible-text':
      return `このテキスト（${error.language === 'ja' ? '日本語' : '英語'}）には「${error.layout.name}」を使えない`;
    case 'geometry':
      return `形状を組み立てられない: ${error.message}`;
  }
}

/** `EngineRequestError`（依頼そのものの失敗と計算中の例外の2種）の説明文。 */
export function describeEngineRequestError(error: EngineRequestError): string {
  if (error.kind === 'resolution') return describeResolvedInputError(error.error);
  const message = error.error instanceof Error ? error.error.message : String(error.error);
  return `計算中にエラーが発生した: ${message}`;
}
