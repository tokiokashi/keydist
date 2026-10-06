import type {
  AssetValues,
  Command,
  CommandHistory,
  CommandOutcome,
  CommandStepResult,
  HistoryEntry,
} from './types.ts';

/** 履歴の上限（既定値は100）。超えたら古い方から捨てる。 */
export const DEFAULT_MAX_HISTORY_ENTRIES = 100;

export function emptyCommandHistory<A extends AssetValues>(): CommandHistory<A> {
  return { undoStack: [], redoStack: [] };
}

/**
 * `changes` のうち、現在値と実際に異なるキーだけを残す。`Object.is` で比較する
 * （参照が同じなら「何も変えなかった」とみなす。純関数が同じ参照を返したことを
 * 資産1つずつの粒度で見る）。
 */
function diffChanges<A extends AssetValues>(
  current: A,
  changes: Readonly<Partial<A>>,
): { before: Partial<A>; after: Partial<A> } {
  const before: Partial<A> = {};
  const after: Partial<A> = {};
  for (const key of Object.keys(changes) as (keyof A & string)[]) {
    const nextValue = changes[key];
    if (Object.is(nextValue, current[key])) continue;
    before[key] = current[key];
    after[key] = nextValue;
  }
  return { before, after };
}

/** `patch` が空なら参照をそのまま返す（無駄な新規オブジェクト生成と、無用な再レンダーを避ける）。 */
function withPatch<A extends AssetValues>(current: A, patch: Readonly<Partial<A>>): A {
  if (Object.keys(patch).length === 0) return current;
  return { ...current, ...patch };
}

function capUndoStack<A extends AssetValues>(
  stack: readonly HistoryEntry<A>[],
  maxEntries: number,
): readonly HistoryEntry<A>[] {
  return stack.length > maxEntries ? stack.slice(stack.length - maxEntries) : stack;
}

/**
 * コマンドを1つ適用する。
 *
 * - `no-op` / `rejected` は履歴に積まず、資産・履歴とも元のまま返す
 * - `applied` でも、触れた資産キーの値が実際には現在値と変わっていなければ（`diffChanges`
 *   が空を返せば）同じく履歴に積まない
 * - 新しいコマンドを積んだら redo側は捨てる
 */
export function applyCommand<A extends AssetValues>(
  assets: A,
  history: CommandHistory<A>,
  command: Command<A>,
  maxEntries: number = DEFAULT_MAX_HISTORY_ENTRIES,
): CommandStepResult<A> {
  const outcome = command(assets);
  if (outcome.kind === 'quiet') return applyQuietly(assets, history, outcome);
  if (outcome.kind !== 'applied') {
    return { assets, history, outcome };
  }

  const { before, after } = diffChanges(assets, outcome.changes);
  if (Object.keys(after).length === 0) {
    return { assets, history, outcome: { kind: 'no-op' } };
  }

  const entry: HistoryEntry<A> = { label: outcome.label, before, after };
  const nextHistory: CommandHistory<A> = {
    undoStack: capUndoStack([...history.undoStack, entry], maxEntries),
    redoStack: [],
  };
  return { assets: withPatch(assets, after), history: nextHistory, outcome };
}

/**
 * 履歴に積まない書き込み。現在値と履歴の各項目のbefore/afterへ同じ変換を掛ける
 * （`CommandOutcome`の`quiet`参照）。変換で何も変わらなければ何もしない。
 */
function applyQuietly<A extends AssetValues>(
  assets: A,
  history: CommandHistory<A>,
  outcome: Extract<CommandOutcome<A>, { kind: 'quiet' }>,
): CommandStepResult<A> {
  const keys = Object.keys(outcome.transforms) as (keyof A & string)[];
  const changes: Partial<A> = {};
  for (const key of keys) {
    const next = outcome.transforms[key]!(assets[key]);
    if (!Object.is(next, assets[key])) changes[key] = next;
  }
  if (Object.keys(changes).length === 0) return { assets, history, outcome: { kind: 'no-op' } };

  const mapSnapshot = (snapshot: Readonly<Partial<A>>): Readonly<Partial<A>> => {
    let mapped: Partial<A> | undefined;
    for (const key of keys) {
      if (!Object.hasOwn(snapshot, key)) continue;
      const next = outcome.transforms[key]!(snapshot[key] as A[typeof key]);
      if (Object.is(next, snapshot[key])) continue;
      mapped ??= { ...snapshot };
      mapped[key] = next;
    }
    return mapped ?? snapshot;
  };
  const mapEntry = (entry: HistoryEntry<A>): HistoryEntry<A> => {
    const before = mapSnapshot(entry.before);
    const after = mapSnapshot(entry.after);
    return before === entry.before && after === entry.after ? entry : { ...entry, before, after };
  };
  return {
    assets: { ...assets, ...changes },
    history: { undoStack: history.undoStack.map(mapEntry), redoStack: history.redoStack.map(mapEntry) },
    outcome: { kind: 'applied', label: outcome.label, changes },
  };
}

const NO_OP_OUTCOME: CommandOutcome<AssetValues> = { kind: 'no-op' };

/** 履歴が空の時に返す、変化なしの結果。 */
function unchanged<A extends AssetValues>(assets: A, history: CommandHistory<A>): CommandStepResult<A> {
  return { assets, history, outcome: NO_OP_OUTCOME as CommandOutcome<A> };
}

/** 直近の項目を1つ戻す。Ctrl+Zは「最後にやったこと」を戻す、という要件をそのまま実装する。 */
export function undo<A extends AssetValues>(assets: A, history: CommandHistory<A>): CommandStepResult<A> {
  if (history.undoStack.length === 0) return unchanged(assets, history);

  const entry = history.undoStack[history.undoStack.length - 1]!;
  const nextHistory: CommandHistory<A> = {
    undoStack: history.undoStack.slice(0, -1),
    redoStack: [...history.redoStack, entry],
  };
  return {
    assets: withPatch(assets, entry.before),
    history: nextHistory,
    outcome: { kind: 'applied', label: entry.label, changes: entry.before },
  };
}

/** 直前にundoした項目を1つやり直す。 */
export function redo<A extends AssetValues>(assets: A, history: CommandHistory<A>): CommandStepResult<A> {
  if (history.redoStack.length === 0) return unchanged(assets, history);

  const entry = history.redoStack[history.redoStack.length - 1]!;
  const nextHistory: CommandHistory<A> = {
    undoStack: [...history.undoStack, entry],
    redoStack: history.redoStack.slice(0, -1),
  };
  return {
    assets: withPatch(assets, entry.after),
    history: nextHistory,
    outcome: { kind: 'applied', label: entry.label, changes: entry.after },
  };
}

/**
 * 他のタブが同じ資産を書き換えたことを取り込む。
 * 他のタブが同じ資産を書き換えたら、その資産に触れる履歴の項目を捨てる。
 *
 * その資産キーに触れる履歴項目は、undo側・redo側の両方から捨てる。「最後の書き込みが勝つ」
 * 規則と矛盾させないため（例: このタブでSetupを削除→他のタブが手持ちを丸ごと書き換え→
 * このタブでundoすると消したはずのSetupが復活してしまう、という食い違いを防ぐ）。
 * その資産に触れない項目はそのまま残る（他の資産のUndoは引き続き効く）。
 */
export function applyExternalChange<A extends AssetValues, K extends keyof A & string>(
  assets: A,
  history: CommandHistory<A>,
  assetKey: K,
  value: A[K],
): { readonly assets: A; readonly history: CommandHistory<A> } {
  const touchesAssetKey = (entry: HistoryEntry<A>): boolean =>
    Object.hasOwn(entry.before, assetKey) || Object.hasOwn(entry.after, assetKey);

  return {
    assets: { ...assets, [assetKey]: value },
    history: {
      undoStack: history.undoStack.filter((entry) => !touchesAssetKey(entry)),
      redoStack: history.redoStack.filter((entry) => !touchesAssetKey(entry)),
    },
  };
}
