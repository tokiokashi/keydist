import { useEffect, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import { createSetupCommand, type KeydistAssets } from '#engine/commands.ts';
import type { Setup, SetupIdGenerator } from '#input/setup/index.ts';
import { DEFAULT_STANDALONE_SETUP_SPEC, selectInitialSetupId } from './setup-selection.ts';

/**
 * 単体ページが対象Setupを1つ選ぶ・手持ちが空なら初期値を1つ作る、という定型の配線
 * （#544 §6「単体ページはAnalyzer 1つ×対象。対象はSetup 1つ」）。
 *
 * レビュー対応: 初期Setup作成の効果は、資産（storage）からの初回読み込みが終わる
 * （`assetsReady`）前に走ると、まだ空の初期値しか見えていない`setups`を「本当に空」と
 * 誤認して新しいSetupを作ってしまい、保存済みのSetup（複数件も含む）をデフォルト1件で
 * 置き換えてしまう（#544レビュー: Playwrightで実際に2件のSetupが1件に消えること、
 * 1件でもリロードのたびにidが変わることを再現）。`assetsReady`を待ってから
 * 「本当に空か」を判定することでこの事故を防ぐ。
 *
 * 単体ページごとに同じ効果を手書きすると、次の単体ページを作る時に同じ事故を
 * 持ち込む（`assetsReady`を待つのを忘れる）ので、ここに1回だけ実装して
 * `hosts/standalone`配下の各ページが呼ぶ形にする。
 */
export function useEnsureSetup(
  setups: readonly Setup[],
  assetsReady: boolean,
  dispatch: (command: Command<KeydistAssets>) => void,
  generateSetupId: SetupIdGenerator,
  spec: { readonly layoutId: string; readonly shapeId: string } = DEFAULT_STANDALONE_SETUP_SPEC,
): {
  readonly selectedSetupId: string | undefined;
  readonly setSelectedSetupId: (id: string | undefined) => void;
} {
  const [selectedSetupId, setSelectedSetupId] = useState<string | undefined>(
    () => selectInitialSetupId(setups),
  );

  useEffect(() => {
    // `assetsReady`前は「まだ読み込み中で空に見えているだけ」の可能性があり、
    // 本当に空かどうか判定できない。読み込みが終わるまで何もしない。
    if (!assetsReady) return;
    if (setups.length > 0) return;
    dispatch(createSetupCommand(spec.layoutId, spec.shapeId, generateSetupId));
    // `setups`自体を依存に含めると、作成直後（setups.length===1）でまたこの効果が走ってしまう
    // ため、「空かどうか」という条件だけを依存にする。
  }, [assetsReady, setups.length === 0, dispatch, generateSetupId, spec.layoutId, spec.shapeId]);

  // 選んでいたSetupが手持ちから消えたら（削除・初回作成直後）選び直す。
  useEffect(() => {
    setSelectedSetupId((current) => selectInitialSetupId(setups, current));
  }, [setups]);

  return { selectedSetupId, setSelectedSetupId };
}
