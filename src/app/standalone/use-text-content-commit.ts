import { useRef } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setTextContentCommand, type KeydistAssets } from '#engine/commands.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import type { TextRef } from '#input/text/selection.ts';
import type { TextContentCommit } from '#hosts/shared/TextChip.tsx';
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
 * 自作の複製へ移った直後の打鍵の宛先を直す処理を足したもの。直すのは「複製を2つ作る」ことだけ。
 *
 * タイマーが書き込む経路はReactのイベントの外なので、描画が次のタスクまで遅れる。その間に
 * 届いた打鍵はまだ描画前の宛先（組み込み）を持っていて、そのまま書くと別の複製を作る（#707）。
 * 描画のタイミングに依らないよう、書き込みで選択が組み込みから複製へ移ったことをここで覚え、
 * 打鍵の時点で、その組み込み宛ての値を複製へ向け直す。
 * 向け直すのは、打鍵の時点の最新の資産が今もその複製を選んでいる時だけ。ユーザーが組み込みを
 * 選び直した後の打鍵は、宛先が本当にその組み込みなので向け直さない。判定を書き込みの時点に
 * 遅らせると、打鍵の後に選択が動いた場合に別のテキストの本文を上書きする。
 * 下書き側（TextChip）が「自分の書き込みで移った」かを知る必要もあるので、覚えた移行は`wasRedirected`で
 * 返す。判定の元をここ1つにして、TextChipは近似で判定しない（他タブが作った複製へ選択が移った場合と
 * 区別するため。#711）。
 */
export function useTextContentCommit(
  dispatch: (command: Command<KeydistAssets>) => void,
  getAssets: () => KeydistAssets,
  generateTextId: TextIdGenerator,
): DebouncedCommit<TextContentValue> & TextContentCommit {
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

  const commit = useDebouncedCommit<TextContentValue>(dispatchAndRemember, {
    commandFor: ({ ref, text }) => setTextContentCommand('standalone', ref, text, generateTextId),
  });

  const retargetRef = useRef((value: TextContentValue): TextContentValue => value);
  retargetRef.current = (value) => {
    const redirect = redirectRef.current;
    if (redirect === undefined || !sameRef(redirect.from, value.ref) || !sameRef(redirect.to, resolvedRef())) {
      return value;
    }
    return { ref: redirect.to, text: value.text };
  };

  // 参照を変えない。`flush`は元のものをそのまま使う。
  const stableRef = useRef<(DebouncedCommit<TextContentValue> & TextContentCommit) | undefined>(undefined);
  if (stableRef.current === undefined) {
    stableRef.current = Object.assign(
      (value: TextContentValue) => commit(retargetRef.current(value)),
      {
        flush: commit.flush,
        wasRedirected: (from: TextRef, to: TextRef) => {
          const redirect = redirectRef.current;
          return redirect !== undefined && sameRef(redirect.from, from) && sameRef(redirect.to, to);
        },
      },
    );
  }
  return stableRef.current;
}
