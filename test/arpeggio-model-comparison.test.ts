import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentWithHomeKeys,
  buildGeometry,
} from '../src/geometry.ts';
import { DEFAULT_OPTIONS, evaluate } from '../src/evaluate.ts';
import { LAYOUTS, LAYOUTS_JA, type Layout } from '../src/layouts/index.ts';
import { SAMPLE_TEXT } from '../src/sample-text.ts';
import { SAMPLE_TEXT_JA } from '../src/sample-text-ja.ts';
import { playbackArpeggioSpans } from '../src/playback-arpeggio.ts';
import { analyzeStrokeArpeggios } from '../src/analysis-arpeggio.ts';

interface Measurement {
  mode: 'en' | 'ja';
  layout: string;
  strokes: number;
  legacySpans: number;
  legacyUniqueStrokes: number;
  legacyCoverage: number;
  newSpans: number;
  newUniqueStrokes: number;
  newCoverage: number;
}

const uniqueStrokeCount = (
  spans: readonly { start: number; end: number }[],
): number => {
  const indexes = new Set<number>();
  for (const span of spans) {
    for (let index = span.start; index < span.end; index++) indexes.add(index);
  }
  return indexes.size;
};

const uniqueNewStrokeCount = (
  spans: readonly { startStrokeIndex: number; endStrokeIndex: number }[],
): number => {
  const indexes = new Set<number>();
  for (const span of spans) {
    for (
      let index = span.startStrokeIndex;
      index < span.endStrokeIndex;
      index++
    ) indexes.add(index);
  }
  return indexes.size;
};

function measure(
  mode: 'en' | 'ja',
  layout: Layout,
  text: string,
): Measurement {
  const baseGeometry = buildGeometry('row-staggered');
  const geometry = buildGeometry(
    'row-staggered',
    assignmentWithHomeKeys(baseGeometry.assignment, layout.homeKeys),
  );
  const trace = evaluate(text, layout, geometry, DEFAULT_OPTIONS);
  const legacy = playbackArpeggioSpans(trace.strokes);
  const current = analyzeStrokeArpeggios(trace.strokes).arpeggioSpans;
  const legacyUniqueStrokes = uniqueStrokeCount(legacy);
  const newUniqueStrokes = uniqueNewStrokeCount(current);
  const denominator = Math.max(1, trace.strokes.length);
  return {
    mode,
    layout: layout.id,
    strokes: trace.strokes.length,
    legacySpans: legacy.length,
    legacyUniqueStrokes,
    legacyCoverage: legacyUniqueStrokes / denominator,
    newSpans: current.length,
    newUniqueStrokes,
    newCoverage: newUniqueStrokes / denominator,
  };
}

test('一時測定: built-in全layoutのlegacy/new Arpeggio比較', () => {
  const rows = [
    ...LAYOUTS.map((layout) =>
      measure('en', layout, SAMPLE_TEXT.replace(/\s+/g, ' ').trim())),
    ...LAYOUTS_JA.map((layout) =>
      measure('ja', layout, SAMPLE_TEXT_JA.replace(/\s+/g, ''))),
  ];

  assert.equal(rows.length, LAYOUTS.length + LAYOUTS_JA.length);
  console.log('ARPEGGIO_COMPARISON_JSON=' + JSON.stringify(rows));
});
