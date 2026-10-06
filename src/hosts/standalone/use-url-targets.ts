import { useEffect, useMemo, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import type { Setup } from '#input/setup/index.ts';
import { setMultiSelectionCommand, setSingleTargetCommand, type KeydistAssets } from '#engine/commands.ts';
import {
  decodeMultiTargetsFromUrl,
  decodeSingleTargetFromUrl,
  describeSharedTargetsNotice,
  sharedTargetParamNames,
  type SharedTargetsKind,
  type TargetShareSource,
} from './target-share.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';

export interface UseUrlTargetsInput {
  /** Singleの画面（Bigram Flow）か、Multiの画面（比較表・N感度）か。 */
  readonly kind: SharedTargetsKind;
  /** 資産の初回読み込みが済んでいるか。済む前に探すと、保存済みのSetupが「見つからない」になる。 */
  readonly assetsReady: boolean;
  /** 名前を引く手持ち（配列・物理配列・Setup）。 */
  readonly source: TargetShareSource;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
}

/**
 * 共有リンクのURLに載った対象を、開いた側で受け取る（解析設定は`use-url-options.ts`）。
 *
 * - 資産の初回読み込みを待つ。待たずに名前で探すと、保存済みのSetupが無いことになる
 * - 受け取るのは1回だけ。手持ちで解決できた対象で、この画面の対象（Single / Multiの集合）を置き換える。
 *   1操作なのでUndoで受け取る前へ戻る。1つも解決できなければ今の対象を変えない
 * - 見つからない対象は、名前を添えた文で返す。呼び出し側がペインへ渡す
 * - 取り込んだら対象のパラメータをURLから消す（取り込み後はローカルが正）
 */
export function useUrlTargets({ kind, assetsReady, source, dispatch }: UseUrlTargetsInput): readonly string[] {
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const appliedRef = useRef(false);
  const [notices, setNotices] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!assetsReady) return;
    // `assetsReady`がtrueになった最初の1回だけ実行する。
    if (appliedRef.current) return;
    appliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const names = sharedTargetParamNames(kind);
    if (!names.some((name) => params.has(name))) return;

    const diagnostics: CodecDiagnostic[] = [];
    if (kind === 'single') {
      const decoded = decodeSingleTargetFromUrl(params, sourceRef.current, diagnostics);
      if (decoded.target !== undefined) dispatch(setSingleTargetCommand(decoded.target));
      setNotices(describeSharedTargetsNotice(decoded.notice));
    } else {
      const decoded = decodeMultiTargetsFromUrl(params, sourceRef.current, diagnostics);
      if (decoded.targets.length > 0) dispatch(setMultiSelectionCommand(decoded.targets, decoded.baseline));
      setNotices(describeSharedTargetsNotice(decoded.notice));
    }

    // 対象以外のパラメータ（解析設定）は`use-url-options`が消すので、今のURLから対象の分だけ引く。
    const next = new URLSearchParams(window.location.search);
    for (const name of names) next.delete(name);
    const query = next.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, [assetsReady, kind, dispatch]);

  return notices;
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
