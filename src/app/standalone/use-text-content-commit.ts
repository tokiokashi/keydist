import { useRef } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setTextContentCommand, type KeydistAssets } from '#engine/commands.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import type { TextRef } from '#input/text/selection.ts';
import { useDebouncedCommit, type DebouncedCommit } from './use-debounced-commit.ts';

export interface TextContentValue {
  readonly ref: TextRef;
  readonly text: string;
}

function sameRef(a: TextRef, b: TextRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * テキスト本文の間引き書き込み。`useDebouncedCommit`に、組み込みテキストを書き換えて
 * 自作の複製へ移った直後の打鍵の宛先を直す処理を足したもの。
 *
 * タイマーが書き込む経路はReactのイベントの外なので、描画が次のタスクまで遅れる。その間に
 * 届いた打鍵はまだ描画前の宛先（組み込み）を持っていて、そのまま書くと別の複製を作り、
 * 打鍵も1つ消える（#707）。描画のタイミングに依らないよう、書き込みで選択が組み込みから
 * 複製へ移ったことをここで覚え、その組み込み宛ての打鍵は複製へ向け直す。
 * 向け直すのは、最新の資産が今もその複製を選んでいる間だけ。選択が他へ移っていれば
 * 打鍵時点の宛先のまま書く（`setTextContentCommand`の説明のとおり、複製として残る）。
 */
export function useTextContentCommit(
  dispatch: (command: Command<KeydistAssets>) => void,
  getAssets: () => KeydistAssets,
  generateTextId: TextIdGenerator,
): DebouncedCommit<TextContentValue> {
  const redirectRef = useRef<{ readonly from: TextRef; readonly to: TextRef } | undefined>(undefined);

  const resolvedRef = (): TextRef => {
    const assets = getAssets();
    return resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary).ref;
  };

  // 書き込みの前後で解決後の選択が組み込みから自作へ移っていたら、その組み込み宛ての
  // 以後の打鍵の向け先として覚える。
  const dispatchAndRemember = (command: Command<KeydistAssets>) => {
    const before = resolvedRef();
    dispatch(command);
    const after = resolvedRef();
    if (before.kind === 'builtin' && after.kind === 'user') redirectRef.current = { from: before, to: after };
  };

  // 書く時点で向け直す。打鍵の値は描画前の宛先を持っていることがあるため。
  const commandFor = (value: TextContentValue): Command<KeydistAssets> => {
    const redirect = redirectRef.current;
    const target =
      redirect !== undefined && sameRef(redirect.from, value.ref) && sameRef(redirect.to, resolvedRef())
        ? redirect.to
        : value.ref;
    return setTextContentCommand('standalone', target, value.text, generateTextId);
  };

  return useDebouncedCommit<TextContentValue>(dispatchAndRemember, { commandFor });
}
