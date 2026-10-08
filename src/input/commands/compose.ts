import type { AssetValues, Command } from './types.ts';

/**
 * 複数のコマンドを順に当てて、履歴に積む1項目のコマンドにまとめる。Undoを1回押すと全部が戻る。
 *
 * - 各コマンドには、直前までの変更を反映した資産を渡す（同じ資産キーに触れる続きのコマンドが、前の結果を読める）
 * - `applied` の変更は1つにまとめる。同じキーへは後のコマンドの値が勝つ
 * - `no-op` と `rejected` のコマンドは飛ばして残りを当てる。1つも `applied` が無ければ `no-op`
 * - `quiet`（履歴に積まない書き込み）は1項目にまとめられないので、このコマンドの対象にしない。渡したら例外にする
 */
export function composeCommands<A extends AssetValues>(
  label: string,
  commands: readonly Command<A>[],
): Command<A> {
  return (current) => {
    let working: Readonly<A> = current;
    let changes: Partial<A> = {};
    let any = false;
    for (const command of commands) {
      const outcome = command(working);
      if (outcome.kind === 'quiet') throw new Error('composeCommands: quietなコマンドはまとめられない');
      if (outcome.kind !== 'applied') continue;
      any = true;
      changes = { ...changes, ...outcome.changes };
      working = { ...working, ...outcome.changes };
    }
    return any ? { kind: 'applied', label, changes } : { kind: 'no-op' };
  };
}
