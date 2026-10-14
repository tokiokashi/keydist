import type {
  AssetValues,
  Command,
  CommandHistory,
  CommandOutcome,
  CommandStepResult,
  HistoryEntry,
  HistoryStepResult,
  ItemScopes,
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
  return applyOutcome(assets, history, command(assets), maxEntries);
}

/** `applyCommand`の、コマンドを呼んだ後の半分。画面ごとの履歴を持つ側が、結果の種類を見てから履歴を選ぶために分けてある。 */
export function applyOutcome<A extends AssetValues>(
  assets: A,
  history: CommandHistory<A>,
  outcome: CommandOutcome<A>,
  maxEntries: number = DEFAULT_MAX_HISTORY_ENTRIES,
): CommandStepResult<A> {
  if (outcome.kind === 'quiet') {
    const result = applyQuietlyToAll(assets, [history], outcome);
    return { assets: result.assets, history: result.histories[0]!, outcome: result.outcome };
  }
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
 * 履歴に積まない書き込み。現在値と、渡した全部の履歴の各項目のbefore/afterへ同じ変換を掛ける
 * （`CommandOutcome`の`quiet`参照）。変換で何も変わらなければ何もしない。
 *
 * 変換前が同じ参照の値には同じ変換後の値を使う（キーごとに結果を覚える）。現在値と履歴の項目が
 * 同じ参照を持っていれば、変換の後も同じ参照のまま残り、戻せるかの照らし合わせ（参照の同一性）が通る。
 * 項目単位で照らし合わせる資産（`ItemScopes`）の変換は、変わらない件の参照を保つこと。
 */
export function applyQuietlyToAll<A extends AssetValues>(
  assets: A,
  histories: readonly CommandHistory<A>[],
  outcome: Extract<CommandOutcome<A>, { kind: 'quiet' }>,
): { readonly assets: A; readonly histories: readonly CommandHistory<A>[]; readonly outcome: CommandOutcome<A> } {
  const keys = Object.keys(outcome.transforms) as (keyof A & string)[];
  const memo = new Map<keyof A, Map<unknown, unknown>>();
  const transform = <K extends keyof A & string>(key: K, value: A[K]): A[K] => {
    let known = memo.get(key);
    if (known === undefined) {
      known = new Map();
      memo.set(key, known);
    }
    if (known.has(value)) return known.get(value) as A[K];
    const next = outcome.transforms[key]!(value);
    known.set(value, next);
    return next;
  };

  const changes: Partial<A> = {};
  for (const key of keys) {
    const next = transform(key, assets[key]);
    if (!Object.is(next, assets[key])) changes[key] = next;
  }
  if (Object.keys(changes).length === 0) return { assets, histories, outcome: { kind: 'no-op' } };

  const mapSnapshot = (snapshot: Readonly<Partial<A>>): Readonly<Partial<A>> => {
    let mapped: Partial<A> | undefined;
    for (const key of keys) {
      if (!Object.hasOwn(snapshot, key)) continue;
      const next = transform(key, snapshot[key] as A[typeof key]);
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
    histories: histories.map((history) => ({
      undoStack: history.undoStack.map(mapEntry),
      redoStack: history.redoStack.map(mapEntry),
    })),
    outcome: { kind: 'applied', label: outcome.label, changes },
  };
}

const NO_OP_OUTCOME: CommandOutcome<AssetValues> = { kind: 'no-op' };

/** 履歴が空の時に返す、変化なしの結果。 */
function unchanged<A extends AssetValues>(assets: A, history: CommandHistory<A>): HistoryStepResult<A> {
  return { assets, history, outcome: NO_OP_OUTCOME as CommandOutcome<A> };
}

type Direction = 'undo' | 'redo';

/**
 * 項目を今の資産へ当てられるかを照らし合わせ、当てられるなら書き換えるキーの値を返す。
 *
 * 戻す時は項目が積まれた時の変更後の値、やり直す時は変更前の値が、今の資産に残っているかを見る
 * （`from`）。値は参照の同一性（`Object.is`）で比べる。別の画面などで書き換わっていれば参照が変わっている。
 * 1つのキーでも合わなければ全体を当てない（項目は原子的に1つ）。
 *
 * `scopes`に挙げたキーは、項目が既にある件の中身だけを変えている時（件の追加・削除・並べ替えをしていない時）、
 * 変わった件だけを照らし合わせて、その件だけを書き換える。他の件が今変わっていても当てられる。
 */
function reconcile<A extends AssetValues>(
  assets: A,
  entry: HistoryEntry<A>,
  direction: Direction,
  scopes: ItemScopes<A>,
): Partial<A> | undefined {
  const from = direction === 'undo' ? entry.after : entry.before;
  const to = direction === 'undo' ? entry.before : entry.after;
  const patch: Partial<A> = {};
  const keys = new Set([...Object.keys(entry.before), ...Object.keys(entry.after)]) as Set<keyof A & string>;
  for (const key of keys) {
    const current = assets[key];
    const scope = scopes[key];
    if (scope !== undefined && Object.hasOwn(from, key) && Object.hasOwn(to, key)) {
      const fromItems = scope.items(from[key] as A[typeof key]);
      const toItems = scope.items(to[key] as A[typeof key]);
      const sameLayout = scope.membership === 'free'
        || (fromItems.size === toItems.size && [...fromItems.keys()].every((id, index) => id === [...toItems.keys()][index]));
      if (sameLayout) {
        const changedIds = [...new Set([...fromItems.keys(), ...toItems.keys()])]
          .filter((id) => !Object.is(fromItems.get(id), toItems.get(id)));
        if (changedIds.length > 0) {
          const currentItems = scope.items(current);
          if (!changedIds.every((id) => Object.is(currentItems.get(id), fromItems.get(id)))) return undefined;
          patch[key] = changedIds.reduce((value, id) => scope.withItem(value, id, toItems.get(id)), current);
          continue;
        }
      }
    }
    if (!Object.hasOwn(from, key) || !Object.is(current, from[key])) return undefined;
    patch[key] = to[key] as A[typeof key];
  }
  return patch;
}

/**
 * 直近の項目を1つ戻す。Ctrl+Zは「最後にやったこと」を戻す、という要件をそのまま実装する。
 * 今の資産に当てられない項目（照らし合わせは`reconcile`）は、資産を変えずに履歴から捨てて`conflict`を返す。
 * 次の呼び出しは、その下の項目を戻す。
 */
export function undo<A extends AssetValues>(
  assets: A,
  history: CommandHistory<A>,
  scopes: ItemScopes<A> = {},
): HistoryStepResult<A> {
  if (history.undoStack.length === 0) return unchanged(assets, history);

  const entry = history.undoStack[history.undoStack.length - 1]!;
  const rest = history.undoStack.slice(0, -1);
  const patch = reconcile(assets, entry, 'undo', scopes);
  if (patch === undefined) {
    return {
      assets,
      history: { undoStack: rest, redoStack: history.redoStack },
      outcome: { kind: 'conflict', label: entry.label },
    };
  }
  return {
    assets: withPatch(assets, patch),
    history: { undoStack: rest, redoStack: [...history.redoStack, entry] },
    outcome: { kind: 'applied', label: entry.label, changes: patch },
  };
}

/** 直前にundoした項目を1つやり直す。当てられない時の扱いは`undo`と同じ（`redoStack`から捨てる）。 */
export function redo<A extends AssetValues>(
  assets: A,
  history: CommandHistory<A>,
  scopes: ItemScopes<A> = {},
): HistoryStepResult<A> {
  if (history.redoStack.length === 0) return unchanged(assets, history);

  const entry = history.redoStack[history.redoStack.length - 1]!;
  const rest = history.redoStack.slice(0, -1);
  const patch = reconcile(assets, entry, 'redo', scopes);
  if (patch === undefined) {
    return {
      assets,
      history: { undoStack: history.undoStack, redoStack: rest },
      outcome: { kind: 'conflict', label: entry.label },
    };
  }
  return {
    assets: withPatch(assets, patch),
    history: { undoStack: [...history.undoStack, entry], redoStack: rest },
    outcome: { kind: 'applied', label: entry.label, changes: patch },
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
  return {
    assets: { ...assets, [assetKey]: value },
    history: withoutEntriesTouching(history, assetKey),
  };
}

/** その資産キーに触れる項目を、undo側・redo側の両方から捨てた履歴。 */
export function withoutEntriesTouching<A extends AssetValues>(
  history: CommandHistory<A>,
  assetKey: keyof A & string,
): CommandHistory<A> {
  const touchesAssetKey = (entry: HistoryEntry<A>): boolean =>
    Object.hasOwn(entry.before, assetKey) || Object.hasOwn(entry.after, assetKey);
  return {
    undoStack: history.undoStack.filter((entry) => !touchesAssetKey(entry)),
    redoStack: history.redoStack.filter((entry) => !touchesAssetKey(entry)),
  };
}
