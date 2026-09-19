import { test } from 'node:test';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { computeMetrics } from '../src/metrics.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';
import { SAMPLE_TEXT_JA_LEGACY } from '../src/sample-text-ja.ts';

const geometry = buildGeometry('row-staggered');
const opts = { windowSize: 3, sfbHomeCost: true };
const text = SAMPLE_TEXT_JA_LEGACY.replace(/\s+/g, '');

test('temporary rate ordering survey', () => {
  for (const id of [
    'qwerty',
    'tsuki-2-263',
    'shin-jis-prefix',
    'shin-jis-simultaneous',
    'asuka',
    'shingeta',
    'naginata-v18',
    'kawasemi-plus',
    'shin-koume',
  ]) {
    const layout = LAYOUT_BY_ID.get(id);
    if (!layout) {
      console.log('RATE_SURVEY', id, 'MISSING');
      continue;
    }
    const metrics = computeMetrics(evaluate(text, layout, geometry, opts), geometry);
    console.log(
      'RATE_SURVEY',
      id,
      JSON.stringify({
        baseLayerRate: Number(metrics.baseLayerRate.toFixed(3)),
        singleTapRate: Number(metrics.singleTapRate.toFixed(3)),
        singleKeyRate: Number(metrics.singleKeyRate.toFixed(3)),
        inputChars: metrics.inputChars,
        actions: metrics.actions,
        strokes: metrics.strokes,
      }),
    );
  }
});
