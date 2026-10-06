import type { ModeId } from './layout-selection.ts';
import {
  isSampleText,
  sampleText,
  SAMPLE_TEXT_NAMES,
  SAMPLE_TEXTS,
} from '#input/text/samples.ts';

// 本体は #input/text/samples.ts にある。standalone/Workspaceどちらのhostからも
// 同じサンプルが要るため。legacyはModeIdキーの旧名で薄く再輸出するだけにする。
// ModeId と TextLanguage は値集合が同じ（'en' | 'ja'）なのでキーはそのまま流用できる。

export const ANALYZER_SAMPLES: Record<ModeId, Record<string, string>> = SAMPLE_TEXTS;
export const ANALYZER_SAMPLE_NAMES: Record<ModeId, Record<string, string>> = SAMPLE_TEXT_NAMES;

export function analyzerSampleText(mode: ModeId, sampleId: string): string {
  return sampleText(mode, sampleId);
}

export function isAnalyzerSampleText(text: string): boolean {
  return isSampleText(text);
}
