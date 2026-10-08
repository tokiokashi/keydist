import { useEffect, useMemo, useRef, useState } from 'react';
import { composeCommands, type Command } from '#input/commands/index.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import type { Setup } from '#input/setup/index.ts';
import {
  setMultiSelectionCommand,
  setSingleTargetCommand,
  setStandaloneAnalyzerOptionsCommand,
  type KeydistAssets,
} from '#engine/commands.ts';
import type { OptionsUrlDecodeResult } from '#analyzers/options.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import {
  decodeMultiTargetsFromUrl,
  decodeSingleTargetFromUrl,
  describeSharedTargetsNotice,
  sharedTargetParamNames,
  type SharedTargetsKind,
  type TargetShareSource,
} from './target-share.ts';

/** URLから読む側だけを要求する最小形（`defineOptions`の戻り値がこれを満たす）。 */
export interface UrlDecodableOptions<Options> {
  decodeOptionsFromUrl(
    params: URLSearchParams,
    diagnostics: CodecDiagnostic[],
  ): OptionsUrlDecodeResult<Options>;
}

export interface UseSharedLinkInput<Options> {
  readonly analyzerId: string;
  readonly optionsDefinition: UrlDecodableOptions<Options>;
  /** 資産から読んだ現在の解析設定。URLで指定されなかった項目はこれを保つ。 */
  readonly currentOptions: Options;
  /** Singleの画面（Bigram Flow）か、Multiの画面（比較表・N感度）か。 */
  readonly kind: SharedTargetsKind;
  /** 資産の初回読み込みが済んでいるか。済む前に取り込むと、既存の設定を初期値へ巻き戻し、保存済みのSetupも「見つからない」になる。 */
  readonly assetsReady: boolean;
  /** 対象を名前で引く手持ち（配列・物理配列・Setup）。 */
  readonly source: TargetShareSource;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  /** 画面上の下書きも取り込んだ解析設定へ揃える。 */
  readonly setOptionsDraft: (next: Options) => void;
}

export interface SharedLinkResult {
  /** 解析設定に読み取れない値があった時の診断。`urlOptionsNotices`で文にする。 */
  readonly optionDiagnostics: readonly CodecDiagnostic[];
  /** 見つからない対象などの、名前を添えた文。 */
  readonly targetNotices: readonly string[];
}

/**
 * 共有リンクの解析設定に読み取れない値があった時にペインへ出す文。
 * 保存済みの設定の読み直し（「既定値へ戻した」）とは事実が違う。URLでは、集合の要素を落とした時は
 * 残りを取り込み、値全体を捨てた時は今の値が残る。どちらも「取り込まなかった」は正しい。
 */
export function urlOptionsNotices(diagnostics: readonly CodecDiagnostic[]): readonly string[] {
  return diagnostics.length === 0 ? [] : [`共有リンクの解析設定のうち、読み取れない値は取り込みませんでした（${diagnostics.length}件）`];
}

/**
 * 共有リンクのURLに載った解析設定と対象を、開いた側で受け取る。3つの単体ページで共通。
 *
 * - 資産の初回読み込み（`assetsReady`）を待つ。待たずに取り込むと、読み込み前の初期値で既存の設定を巻き戻し、
 *   保存済みのSetupが無いことになる
 * - 受け取るのは1回だけ。解析設定と対象の書き込みは1つのコマンドにまとめて`dispatch`するので、履歴は1項目で、
 *   Undo 1回でリンクを開く前の解析設定と対象へ戻る
 * - 解析設定は、URLで指定された項目だけを現在の設定へ上書きする部分マージ。指定しなかった項目まで既定値へ
 *   戻ると、リンクを開いただけで自分の設定が丸ごと消える
 * - 対象は、手持ちで解決できたものでこの画面の対象（Single / Multiの集合）を置き換える。1つも解決できなければ今の対象を変えない。
 *   見つからない対象は、名前を添えた文で返す
 * - 取り込んだら該当パラメータをURLから消す（取り込み後はローカルが正）
 */
export function useSharedLink<Options>({
  analyzerId,
  optionsDefinition,
  currentOptions,
  kind,
  assetsReady,
  source,
  dispatch,
  setOptionsDraft,
}: UseSharedLinkInput<Options>): SharedLinkResult {
  const currentRef = useRef(currentOptions);
  currentRef.current = currentOptions;
  const definitionRef = useRef(optionsDefinition);
  definitionRef.current = optionsDefinition;
  const setDraftRef = useRef(setOptionsDraft);
  setDraftRef.current = setOptionsDraft;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const appliedRef = useRef(false);
  const [optionDiagnostics, setOptionDiagnostics] = useState<readonly CodecDiagnostic[]>([]);
  const [targetNotices, setTargetNotices] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!assetsReady) return;
    // `assetsReady`がtrueになった最初の1回だけ実行する。
    if (appliedRef.current) return;
    appliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const commands: Command<KeydistAssets>[] = [];
    const consumed: string[] = [];

    const optionDiagnosticsFound: CodecDiagnostic[] = [];
    const optionsResult = definitionRef.current.decodeOptionsFromUrl(params, optionDiagnosticsFound);
    if (optionDiagnosticsFound.length > 0) setOptionDiagnostics(optionDiagnosticsFound);
    if (optionsResult.consumedParamNames.length > 0) {
      consumed.push(...optionsResult.consumedParamNames);
      if (Object.keys(optionsResult.values).length > 0) {
        const merged = { ...currentRef.current, ...optionsResult.values };
        commands.push(setStandaloneAnalyzerOptionsCommand(analyzerId, merged));
        setDraftRef.current(merged);
      }
    }

    const targetNames = sharedTargetParamNames(kind);
    if (targetNames.some((name) => params.has(name))) {
      consumed.push(...targetNames);
      const targetDiagnostics: CodecDiagnostic[] = [];
      if (kind === 'single') {
        const decoded = decodeSingleTargetFromUrl(params, sourceRef.current, targetDiagnostics);
        if (decoded.target !== undefined) commands.push(setSingleTargetCommand(decoded.target));
        setTargetNotices(describeSharedTargetsNotice(decoded.notice));
      } else {
        const decoded = decodeMultiTargetsFromUrl(params, sourceRef.current, targetDiagnostics);
        if (decoded.targets.length > 0) commands.push(setMultiSelectionCommand(decoded.targets, decoded.baseline));
        setTargetNotices(describeSharedTargetsNotice(decoded.notice));
      }
    }

    if (commands.length > 0) dispatch(composeCommands('共有リンクの内容を取り込む', commands));
    if (consumed.length === 0) return;

    const nextParams = new URLSearchParams(window.location.search);
    for (const name of consumed) nextParams.delete(name);
    const nextQuery = nextParams.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`);
  }, [assetsReady, analyzerId, kind, dispatch]);

  return { optionDiagnostics, targetNotices };
}

/** 共有リンクの対象を名前で引く・作るための手持ち。ページの再描画ごとに作り直さない。 */
export function useTargetShareSource(catalog: PaneCatalog, setups: readonly Setup[]): TargetShareSource {
  return useMemo(() => ({
    layouts: catalog.setupCatalog.layouts,
    userLayoutIds: new Set(catalog.userLayouts.keys()),
    shapes: catalog.setupCatalog.shapes,
    setups,
  }), [catalog, setups]);
}
