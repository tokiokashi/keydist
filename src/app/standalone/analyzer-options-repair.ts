import type { CodecDiagnostic } from '#input/codec/index.ts';
import type { StandaloneAnalyzerOptionsState } from '#engine/standalone-analyzer-options.ts';
import type { OptionSet, WorkspaceLibrary, WorkspacePane } from '#engine/workspace.ts';
import { ANALYZER_OPTIONS_DECODERS } from './analyzer-options-decoders.ts';

/**
 * 保存した解析設定のうち、今のAnalyzerが読めない項目を捨てる。
 *
 * 資産のcodec（`engine/`）はAnalyzerの個別の宣言を読めないので、解析設定は外側の形だけを見て値をそのまま残す。
 * 項目ごとに読むのは画面の側で、読めない項目を既定値に置き換えても保存値は変わらない。そのままだと、
 * 開くたびに同じ項目が読めない。ここでは`app`（全Analyzerを読める層）で各Analyzerの`decodeOptions`を通し、
 * 起動時の読み込み（`loadAssetsAndRepair`）が読めた形を書き戻せるようにする。
 *
 * 読めない項目は古い版が残したもので、利用者が直せるものではないので、知らせずに捨てる。
 * 読み直した結果を使うのは、読めない項目があった解析設定だけ。他は保存した形のまま残す。
 * 知らないAnalyzerの解析設定と、値の無い解析設定（既定値のまま）も触らない。
 */
function repairOptions(analyzerId: string, raw: unknown): unknown {
  if (raw === undefined) return raw;
  const decodeOptions = ANALYZER_OPTIONS_DECODERS.get(analyzerId);
  if (decodeOptions === undefined) return raw;
  const diagnostics: CodecDiagnostic[] = [];
  const decoded = decodeOptions(raw, diagnostics);
  return diagnostics.length === 0 ? raw : decoded;
}

/** 読めない項目を含む解析設定だけを読める形に置き換える。何も変えなければ同じ参照を返す。 */
export function repairStandaloneAnalyzerOptions(state: StandaloneAnalyzerOptionsState): StandaloneAnalyzerOptionsState {
  let result: Record<string, unknown> | undefined;
  for (const [analyzerId, raw] of Object.entries(state)) {
    const repaired = repairOptions(analyzerId, raw);
    if (repaired === raw) continue;
    result ??= { ...state };
    result[analyzerId] = repaired;
  }
  return result ?? state;
}

/** Workspaceのペインと解析設定の組で、読めない項目を含む解析設定だけを置き換える。何も変えなければ同じ参照を返す。 */
export function repairWorkspaceAnalyzerOptions(library: WorkspaceLibrary): WorkspaceLibrary {
  let changed = false;
  const next = library.map((workspace) => {
    const optionSets = workspace.optionSets.map((set): OptionSet => {
      const options = repairOptions(set.analyzerId, set.options);
      return options === set.options ? set : { ...set, options };
    });
    const panes = workspace.panes.map((pane): WorkspacePane => {
      const options = repairOptions(pane.analyzerId, pane.options);
      return options === pane.options ? pane : { ...pane, options };
    });
    if (optionSets.every((set, index) => set === workspace.optionSets[index]) && panes.every((pane, index) => pane === workspace.panes[index])) {
      return workspace;
    }
    changed = true;
    return { ...workspace, optionSets, panes };
  });
  return changed ? next : library;
}
