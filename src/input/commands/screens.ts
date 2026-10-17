import { applyOutcome, applyQuietlyToAll, DEFAULT_MAX_HISTORY_ENTRIES, emptyCommandHistory, redo, undo, withoutEntriesTouching } from './history.ts';
import type { AssetValues, Command, CommandHistory, CommandOutcome, HistoryStepOutcome, ItemScopes, ScreenHistories } from './types.ts';

/**
 * 画面ごとの履歴を持つ側（`ScreenHistories`）の操作。履歴は画面ごとに分かれていて、
 * 資産の値はタブに1つなので、書き込みと取り込みは全部の画面の履歴に関わる。
 */

export function emptyScreenHistories<A extends AssetValues>(): ScreenHistories<A> {
  return new Map();
}

function withHistory<A extends AssetValues>(histories: ScreenHistories<A>, screen: string, history: CommandHistory<A>): ScreenHistories<A> {
  return new Map(histories).set(screen, history);
}

/**
 * コマンドを1つ適用する。`screen`の履歴にだけ項目を積む。`screen`が`undefined`なら履歴を持たない
 * 画面からの書き込みで、資産は書くが、どの履歴にも積まない（他の画面の項目は、触れた資産が
 * 変わった分だけ、戻す時に当てられなくなる）。
 *
 * 履歴に積まない書き込み（`quiet`）は、取っておく全部の画面の履歴に同じ変換を掛ける。
 */
export function applyCommandInScreen<A extends AssetValues>(
  assets: A,
  histories: ScreenHistories<A>,
  screen: string | undefined,
  command: Command<A>,
  maxEntries: number = DEFAULT_MAX_HISTORY_ENTRIES,
): { readonly assets: A; readonly histories: ScreenHistories<A>; readonly outcome: CommandOutcome<A> } {
  const outcome = command(assets);
  if (outcome.kind === 'quiet') {
    const screens = [...histories.keys()];
    const result = applyQuietlyToAll(
      assets,
      screens.map((key) => histories.get(key)!),
      outcome,
    );
    if (result.outcome.kind !== 'applied') return { assets, histories, outcome: result.outcome };
    return {
      assets: result.assets,
      histories: new Map(screens.map((key, index) => [key, result.histories[index]!] as const)),
      outcome: result.outcome,
    };
  }
  const own = screen === undefined ? emptyCommandHistory<A>() : (histories.get(screen) ?? emptyCommandHistory<A>());
  const result = applyOutcome(assets, own, outcome, maxEntries);
  if (screen === undefined || result.history === own) {
    return { assets: result.assets, histories, outcome: result.outcome };
  }
  return { assets: result.assets, histories: withHistory(histories, screen, result.history), outcome: result.outcome };
}

/** `screen`の履歴を1段戻す・やり直す。当てられない項目は`conflict`を返し、その画面の履歴から捨てる。 */
export function stepInScreen<A extends AssetValues>(
  assets: A,
  histories: ScreenHistories<A>,
  screen: string,
  direction: 'undo' | 'redo',
  scopes: ItemScopes<A> = {},
): { readonly assets: A; readonly histories: ScreenHistories<A>; readonly outcome: HistoryStepOutcome<A> } {
  const own = histories.get(screen);
  if (own === undefined) return { assets, histories, outcome: { kind: 'no-op' } };
  const result = (direction === 'undo' ? undo : redo)(assets, own, scopes);
  if (result.history === own) return { assets, histories, outcome: result.outcome };
  return { assets: result.assets, histories: withHistory(histories, screen, result.history), outcome: result.outcome };
}

/**
 * 他のタブが`assetKey`の資産を書き換えたことを取り込む。その資産に触れる項目を、取っておく全部の画面の
 * 履歴から捨てる（別のタブの値は保存データから読み直した新しい参照で、参照では照らし合わせられないため）。
 */
export function applyExternalChangeToScreens<A extends AssetValues, K extends keyof A & string>(
  assets: A,
  histories: ScreenHistories<A>,
  assetKey: K,
  value: A[K],
): { readonly assets: A; readonly histories: ScreenHistories<A> } {
  return {
    assets: { ...assets, [assetKey]: value },
    histories: new Map([...histories].map(([screen, history]) => [screen, withoutEntriesTouching(history, assetKey)] as const)),
  };
}

/** `screen`の履歴を捨てる（画面そのものが無くなった時）。 */
export function discardScreenHistory<A extends AssetValues>(histories: ScreenHistories<A>, screen: string): ScreenHistories<A> {
  if (!histories.has(screen)) return histories;
  const next = new Map(histories);
  next.delete(screen);
  return next;
}
