import { useEffect, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setStandaloneAnalyzerOptionsCommand, type KeydistAssets } from '#engine/commands.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import type { OptionsUrlDecodeResult } from '#analyzers/options.ts';

/** URLから読む側だけを要求する最小形（`defineOptions`の戻り値がこれを満たす）。 */
export interface UrlDecodableOptions<Options> {
  decodeOptionsFromUrl(
    params: URLSearchParams,
    diagnostics: CodecDiagnostic[],
  ): OptionsUrlDecodeResult<Options>;
}

export interface UseUrlOptionsInput<Options> {
  readonly analyzerId: string;
  readonly optionsDefinition: UrlDecodableOptions<Options>;
  /** 資産から読んだ現在の解析設定。URLで指定されなかった項目はこれを保つ。 */
  readonly currentOptions: Options;
  /** 資産の初回読み込みが済んでいるか。済む前に取り込むと既存の設定を初期値へ巻き戻す。 */
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  /** 画面上の下書きも取り込んだ値へ揃える。 */
  readonly setOptionsDraft: (next: Options) => void;
}

/**
 * 共有リンクのURLに載った解析設定を、開いた側で受け取る（#544 Phase 3「URLでの受け取り」、
 * #644で3つの単体ページ共通にした）。取り込む対象は解析設定だけで、対象（配列・Setup）は載せない。
 *
 * - 資産の初回読み込み（`assetsReady`）を待つ。待たずに`currentOptions`をベースへマージすると、
 *   読み込み前の初期値で既存の設定を巻き戻す（#544レビューで見つかった競合）
 * - URLで指定された項目だけを現在の設定へ上書きする部分マージ。指定しなかった項目まで既定値へ
 *   戻ると、リンクを開いただけで自分の設定が丸ごと消える。誤って開いてもUndoで戻せる
 * - 取り込んだら該当パラメータをURLから消す（取り込み後はローカルが正）
 * - 壊れた値は診断として返す。呼び出し側がペインの`settingsDiagnostics`へ渡す
 */
export function useUrlOptions<Options>({
  analyzerId,
  optionsDefinition,
  currentOptions,
  assetsReady,
  dispatch,
  setOptionsDraft,
}: UseUrlOptionsInput<Options>): readonly CodecDiagnostic[] {
  const currentRef = useRef(currentOptions);
  currentRef.current = currentOptions;
  const definitionRef = useRef(optionsDefinition);
  definitionRef.current = optionsDefinition;
  const setDraftRef = useRef(setOptionsDraft);
  setDraftRef.current = setOptionsDraft;
  const appliedRef = useRef(false);
  const [diagnostics, setDiagnostics] = useState<readonly CodecDiagnostic[]>([]);

  useEffect(() => {
    if (!assetsReady) return;
    // `assetsReady`がtrueになった最初の1回だけ実行する。
    if (appliedRef.current) return;
    appliedRef.current = true;
    const found: CodecDiagnostic[] = [];
    const result = definitionRef.current.decodeOptionsFromUrl(new URLSearchParams(window.location.search), found);
    if (found.length > 0) setDiagnostics(found);
    if (result.consumedParamNames.length === 0) return;

    if (Object.keys(result.values).length > 0) {
      const merged = { ...currentRef.current, ...result.values };
      dispatch(setStandaloneAnalyzerOptionsCommand(analyzerId, merged));
      setDraftRef.current(merged);
    }

    const nextParams = new URLSearchParams(window.location.search);
    for (const name of result.consumedParamNames) nextParams.delete(name);
    const nextQuery = nextParams.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [assetsReady, analyzerId, dispatch]);

  return diagnostics;
}
