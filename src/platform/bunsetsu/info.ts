import type { SegmenterInfo } from '#input/text/segmentation.ts';
import pkg from '../../../package.json' with { type: 'json' };

/**
 * 文節の分割器の名前と版。版は `package.json` の `budoux` の版（固定した版）をそのまま読むので、依存の更新に自動で追従する。
 * 分割器本体を読み込まずに、数値の条件へ記録できるよう別のファイルに置く。
 */
export const BUNSETSU_SPLITTER: SegmenterInfo = { name: 'BudouX', version: pkg.dependencies.budoux };
