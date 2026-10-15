import type { ItemScope } from '#input/commands/index.ts';
import { withLevelOverrides, type CascadeLevel, type LevelOverrides } from '#input/settings/index.ts';
import type { SetupLibrary } from './collection.ts';
import type { Setup } from './types.ts';

/**
 * 元に戻す・やり直すで、`SetupLibrary`を件ごとに照らし合わせるための`ItemScope`。
 *
 * `SetupLibrary`は、Setupの手持ちと、全体・物理配列・打ち方・配列・Setupの各レベルの条件の上書きを
 * 1つの資産に持つ。資産ごとまるごと照らし合わせると、別の画面で全体の条件を変えただけで、
 * Setupを作る・名前を変える操作が戻せなくなる。そのため次の単位を1件として照らし合わせる。
 *
 * - `setup:<id>`: Setup本体（配列・物理配列・番号・ラベル）
 * - `setup-number:<番号>`: その番号を持つSetupのid。番号の重なりを見つけるための件で、書き戻しには使わない
 * - `global` / `shape:<id>` / `inputMethod:<打ち方>` / `layout:<id>` / `override-setup:<id>`:
 *   各レベルの条件の上書き（1レベルで1件。別のレベルの変更とは干渉しない）
 *
 * Setupのレベルの条件（`override-setup:<id>`）は、そのSetup自身（`setup:<id>`）が今あることも条件にする
 * （戻す向きでもやり直す向きでも。Setupの無い条件の上書きを残さない）。Setupの削除を戻す時のように、
 * Setupと条件が同じ操作で一緒に戻る場合は満たす。
 *
 * 件の追加・削除も項目単位で戻せる（`'free'`）。Setupの番号は作った時に手持ちの最大＋1で固定されるので、
 * 作る操作を戻した後に別のSetupを作ると、同じ番号が付く。戻した操作をやり直す時に、その番号を別のSetupが
 * 使っていれば、`setup-number`の件が食い違い、やり直せなくなる（番号の重なる状態を作らない）。
 * 手持ちの並びは番号の昇順なので、件を戻す位置は番号で決める。
 */
export function setupLibraryItemScope<V>(): ItemScope<SetupLibrary<V>> {
  return {
    items: (library) => {
      const items = new Map<string, unknown>();
      for (const setup of library.setups) {
        items.set(`setup:${setup.id}`, setup);
        items.set(`setup-number:${setup.number}`, setup.id);
      }
      const { overrides } = library;
      if (overrides.global !== undefined) items.set('global', overrides.global);
      for (const [key, value] of Object.entries(overrides.shape ?? {})) items.set(`shape:${key}`, value);
      for (const [key, value] of Object.entries(overrides.inputMethod ?? {})) items.set(`inputMethod:${key}`, value);
      for (const [key, value] of Object.entries(overrides.layout ?? {})) items.set(`layout:${key}`, value);
      for (const [key, value] of Object.entries(overrides.setup ?? {})) items.set(`override-setup:${key}`, value);
      return items;
    },
    withItem: (library, id, item) => {
      const separator = id.indexOf(':');
      const kind = separator < 0 ? id : id.slice(0, separator);
      const key = separator < 0 ? '' : id.slice(separator + 1);
      switch (kind) {
        case 'setup': return { ...library, setups: withSetup(library.setups, key, item as Setup | undefined) };
        case 'setup-number': return library;
        default: {
          const level = levelOf(kind, key);
          if (level === undefined) return library;
          return { ...library, overrides: withLevelOverrides(library.overrides, level, item as LevelOverrides<V> | undefined) };
        }
      }
    },
    membership: 'free',
    requires: (id) => (id.startsWith('override-setup:') ? `setup:${id.slice('override-setup:'.length)}` : undefined),
  };
}

function levelOf(kind: string, key: string): CascadeLevel | undefined {
  switch (kind) {
    case 'global': return { kind: 'global' };
    case 'shape': return { kind: 'shape', shapeId: key };
    case 'inputMethod': return { kind: 'inputMethod', inputMethod: key as never };
    case 'layout': return { kind: 'layout', layoutId: key };
    case 'override-setup': return { kind: 'setup', setupId: key };
    default: return undefined;
  }
}

/** `id`のSetupを`item`に差し替える。`undefined`なら外し、手持ちに無ければ番号の昇順の位置に足す。 */
function withSetup(setups: readonly Setup[], id: string, item: Setup | undefined): readonly Setup[] {
  if (item === undefined) return setups.filter((setup) => setup.id !== id);
  if (setups.some((setup) => setup.id === id)) return setups.map((setup) => (setup.id === id ? item : setup));
  const next = setups.findIndex((setup) => setup.number > item.number);
  return next < 0 ? [...setups, item] : [...setups.slice(0, next), item, ...setups.slice(next)];
}
