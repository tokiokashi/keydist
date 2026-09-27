import * as v from 'valibot';
import { defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';

/**
 * N感度Analyzerの解析設定（#544 Phase 3「N感度」）。
 *
 * `scale`は縦軸の見せ方だけを切り替える（`relative`: N=0を100%とした相対値、
 * `absolute`: 距離[u]の実測値）。どちらも抽出結果（`extract.ts`の`points`。
 * 生の`totalUnits`/`totalMm`）はそのまま計算し、縦軸への変換は可視化
 * （`definition.tsx`）側で行う（AGENTS.md「表示だけが変わるなら`ui`、出力される
 * 数値が動くなら`conditions`」の帰結。抽出は変えない）ため`affects: 'view'`。
 *
 * Nの範囲（0〜10）は旧実装（`src/legacy/analyzer-metrics-content.tsx`の
 * `AnalyzerSensitivityResults`）に合わせて固定にし、設定にはしない
 * （AGENTS.md「割れる人を想像できるが実例が無いものは今は設定にしない」・
 * 「先回りして足さない」）。
 */
const SCALES = ['relative', 'absolute'] as const;
export type NSensitivityScale = (typeof SCALES)[number];

export const nSensitivityOptions = defineOptions({
  scale: defineOption<NSensitivityScale>({
    schema: v.picklist(SCALES),
    default: 'relative',
    affects: 'view',
    url: picklistUrlCodec('scale', SCALES),
    label: '縦軸',
  }),
});

export type NSensitivityOptions = typeof nSensitivityOptions.defaultOptions;

export const DEFAULT_N_SENSITIVITY_OPTIONS: NSensitivityOptions = nSensitivityOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_N_SENSITIVITY_OPTIONS: NSensitivityOptions = {
  scale: 'absolute',
};
