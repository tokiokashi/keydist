import type { ModeId } from './layout-selection.ts';
import { SAMPLE_TEXT } from '../sample-text.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from '../sample-text-ja.ts';

export const ANALYZER_SAMPLES: Record<ModeId, Record<string, string>> = {
  en: { default: SAMPLE_TEXT.replace(/\s+/g, ' ').trim() },
  ja: {
    modern: SAMPLE_TEXT_JA.replace(/\s+/g, ''),
    legacy: SAMPLE_TEXT_JA_LEGACY.replace(/\s+/g, ''),
  },
};

export const ANALYZER_SAMPLE_NAMES: Record<ModeId, Record<string, string>> = {
  en: { default: '英文（既定）' },
  ja: { modern: '現代文', legacy: '旧文「吾輩は猫である」（既定）' },
};

const FALLBACK_SAMPLE_ID: Record<ModeId, string> = {
  en: 'default',
  ja: 'modern',
};

export function analyzerSampleText(mode: ModeId, sampleId: string): string {
  return ANALYZER_SAMPLES[mode][sampleId]
    ?? ANALYZER_SAMPLES[mode][FALLBACK_SAMPLE_ID[mode]]
    ?? '';
}

export function isAnalyzerSampleText(text: string): boolean {
  return Object.values(ANALYZER_SAMPLES)
    .some((samples) => Object.values(samples).includes(text));
}
