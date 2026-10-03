import { useMemo } from 'react';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { decodeStoredAnalyzerOptions, type DecodableAnalyzerDefinition } from '#hosts/shared/decode-analyzer-options.ts';
import { useOptionsDraft } from '#hosts/shared/use-options-draft.ts';

/**
 * ペイン1枚の解析設定。保存した値（`WorkspacePane.options`）をAnalyzerのdecodeで読み、
 * 見た目は即座に反映しつつ（下書き）、資産への書き込みは間引いてから行う（`commit`）。
 * 個別画面の`useOptionsDraft`と同じ形で、値の持ち主だけがペインの中にある。
 */
export function usePaneOptions<Options>(
  definition: DecodableAnalyzerDefinition<Options>,
  stored: unknown,
  paneId: string,
  commit: (options: Options) => void,
): {
  readonly options: Options;
  readonly onOptionsChange: (next: Options) => void;
  readonly diagnostics: readonly CodecDiagnostic[];
} {
  const decoded = useMemo(() => decodeStoredAnalyzerOptions(definition, stored), [definition, stored]);
  const [draft, setDraft] = useOptionsDraft<Options>(decoded.options, paneId);
  return {
    options: draft,
    onOptionsChange: (next) => {
      setDraft(next);
      commit(next);
    },
    diagnostics: decoded.diagnostics,
  };
}
