import assert from 'node:assert/strict';
import test from 'node:test';
import type { TextLanguage } from '#input/text/language.ts';
import { COMPARISON_COLUMN_IDS, comparisonColumnText } from './comparison-column-text.ts';
import { comparisonColumns } from './comparison/options.ts';
import { fingerMatrixCell } from './finger-matrix/display.ts';
import type { FingerMatrixOkRow } from './finger-matrix/extract.ts';
import { FINGER_MATRIX_SURFACE_IDS, type FingerMatrixSurfaceId } from './finger-matrix/options.ts';
import { fingerMatrixSurfaceText } from './finger-matrix/surface-text.ts';
import { sharedMetricText } from './metric-labels.ts';
import {
  axisTitle as nSensitivityAxisTitle,
  deltaUnit,
  N_SENSITIVITY_METRIC_IDS,
  nSensitivityMetrics,
  relativeChoiceLabel,
} from './n-sensitivity/metric-catalog.ts';
import { formatRate, rateChartReadout } from './playback/rate-chart-model.ts';
import { axisTitle as runChartAxisTitle, RUN_CHART_METRIC_IDS, runChartMetrics } from './run-chart/metric-catalog.ts';
import { IDENTITIES, identityRelation, SCATTER_PRESET_IDS, scatterContour, scatterPresetDescriptions, scatterPresetLabels } from './scatter/axes.ts';
import { inputUnitNoteOf, kanaUnitOf } from './unit-words.ts';

/**
 * 「かな」と「字」の出し分けを、言語を受け取って文字を作る関数ごとに確かめる。
 * 日本語のテキストでは「かな」が出て、英語のテキストでは「かな」が出ず、日本語の文の「かな」を「字」に置き換えた文になる。
 */
/**
 * 単位としての「かな」。「続かない」のようにひらがなの語の一部になった「かな」は単位でないので、前後がひらがなでないか、直後が「あたり」「数」の時だけ数える。「かな漢字変換」の「かな」も単位でない。
 */
const KANA_UNIT = /(?<![ぁ-ゟ])かな(?![ぁ-ゟ]|漢字変換)|かな(?=あたり|数)/gu;
const toEnglishWord = (text: string): string => text.replaceAll(KANA_UNIT, '字');
const hasKanaUnit = (text: string): boolean => text.search(KANA_UNIT) >= 0;
const LANGUAGES: readonly TextLanguage[] = ['ja', 'en'];

/** 英語の文字列に「かな」が出ない。日本語の文字列に「かな」が出る時は、英語の文字列が日本語の文字列の「かな」を「字」にしたものと一致する。 */
function assertUnitWord(ja: string, en: string, where: string): void {
  assert.ok(!hasKanaUnit(en), `${where}: 英語のテキストに「かな」が出ている: ${en}`);
  if (hasKanaUnit(ja)) assert.equal(en, toEnglishWord(ja), where);
}

test('数える単位の呼び名は日本語で「かな」、英語で「字」', () => {
  assert.equal(kanaUnitOf('ja'), 'かな');
  assert.equal(kanaUnitOf('en'), '字');
});

test('入力かな数の説明は、日本語で「かな数」、英語で「字数」から始まる', () => {
  assert.ok(inputUnitNoteOf('ja').startsWith('かな数は'));
  assert.ok(inputUnitNoteOf('en').startsWith('字数は'));
  assert.ok(!hasKanaUnit(inputUnitNoteOf('en')));
});

test('比較表の列名と説明は、英語のテキストで「かな」が出ない', () => {
  const ja = comparisonColumnText('ja');
  const en = comparisonColumnText('en');
  for (const column of COMPARISON_COLUMN_IDS) {
    assertUnitWord(ja[column].label, en[column].label, `${column} label`);
    assert.ok(!hasKanaUnit(en[column].description), `${column} description: ${en[column].description}`);
  }
  assert.equal(ja.perCharUnits.label, 'u/かな');
  assert.equal(en.perCharUnits.label, 'u/字');
});

test('「表示する列」の選択肢の列定義は、比較表の列名と同じ言語で出る', () => {
  for (const language of LANGUAGES) {
    const columns = comparisonColumns(language);
    const text = comparisonColumnText(language);
    for (const column of COMPARISON_COLUMN_IDS) {
      assert.equal(columns[column].label, text[column].label, `${column} ${language}`);
      assert.equal(columns[column].description, text[column].description, `${column} ${language}`);
    }
  }
});

test('散布図の恒等式の文と、1字あたりの列を換算する文は、英語のテキストで「かな」が出ない', () => {
  for (const identity of IDENTITIES) {
    assertUnitWord(identityRelation(identity, 'ja'), identityRelation(identity, 'en'), identityRelation(identity, 'ja'));
  }
  let converted = 0;
  for (const x of COMPARISON_COLUMN_IDS) {
    for (const y of COMPARISON_COLUMN_IDS) {
      const ja = scatterContour(x, y, 100, 'ja');
      const en = scatterContour(x, y, 100, 'en');
      assert.equal(en === undefined, ja === undefined, `${x}/${y}`);
      if (ja === undefined || en === undefined) continue;
      assertUnitWord(ja.relation, en.relation, `${x}/${y} relation`);
      if (ja.conversion === undefined) {
        assert.equal(en.conversion, undefined, `${x}/${y}`);
        continue;
      }
      converted += 1;
      assert.ok(hasKanaUnit(ja.conversion), `${x}/${y}: ${ja.conversion}`);
      assertUnitWord(ja.conversion, en.conversion ?? '', `${x}/${y} conversion`);
    }
  }
  assert.ok(converted > 0, '換算の文を持つ軸の組が無い');
});

test('散布図の組み合わせの名前と説明は、英語のテキストで「かな」が出ない', () => {
  const labels = { ja: scatterPresetLabels('ja'), en: scatterPresetLabels('en') };
  const descriptions = { ja: scatterPresetDescriptions('ja'), en: scatterPresetDescriptions('en') };
  for (const preset of SCATTER_PRESET_IDS) {
    assertUnitWord(labels.ja[preset], labels.en[preset], `${preset} label`);
    assertUnitWord(descriptions.ja[preset], descriptions.en[preset], `${preset} description`);
  }
});

test('複数のAnalyzerが縦軸に描く指標の名前と単位は、英語のテキストで「字」になる', () => {
  const ja = sharedMetricText('ja');
  const en = sharedMetricText('en');
  for (const key of Object.keys(ja) as (keyof typeof ja)[]) {
    assertUnitWord(ja[key].label, en[key].label, `${key} label`);
    assertUnitWord(ja[key].unit, en[key].unit, `${key} unit`);
  }
  assert.deepEqual(ja.perCharUnits, { label: '1かなあたりの距離', unit: 'u/かな' });
  assert.deepEqual(en.perCharUnits, { label: '1字あたりの距離', unit: 'u/字' });
  assert.deepEqual(en.perCharSteps, { label: '1字あたりのアクション数', unit: 'アクション/字' });
});

test('N感度の指標名・単位・軸の見出しは、英語のテキストで「かな」が出ない', () => {
  const ja = nSensitivityMetrics('ja');
  const en = nSensitivityMetrics('en');
  for (const metric of N_SENSITIVITY_METRIC_IDS) {
    assertUnitWord(ja[metric].label, en[metric].label, `${metric} label`);
    assertUnitWord(ja[metric].unit, en[metric].unit, `${metric} unit`);
    assertUnitWord(deltaUnit(metric, 'ja'), deltaUnit(metric, 'en'), `${metric} deltaUnit`);
    assertUnitWord(relativeChoiceLabel(metric, 'ja'), relativeChoiceLabel(metric, 'en'), `${metric} relativeChoice`);
    for (const kind of ['ratio', 'delta', 'value'] as const) {
      assertUnitWord(nSensitivityAxisTitle(metric, kind, 'ja'), nSensitivityAxisTitle(metric, kind, 'en'), `${metric} ${kind} axisTitle`);
    }
  }
  assert.equal(ja.perCharUnits.unit, 'u/かな');
  assert.equal(en.perCharUnits.unit, 'u/字');
});

test('推移の指標名と縦軸の見出しは、英語のテキストで「字」になる', () => {
  const ja = runChartMetrics('ja');
  const en = runChartMetrics('en');
  for (const metric of RUN_CHART_METRIC_IDS) {
    assertUnitWord(ja[metric].label, en[metric].label, `${metric} label`);
    assertUnitWord(ja[metric].unit, en[metric].unit, `${metric} unit`);
    assertUnitWord(runChartAxisTitle(metric, 50, 'ja'), runChartAxisTitle(metric, 50, 'en'), `${metric} axisTitle`);
  }
  assert.equal(runChartAxisTitle('perCharUnits', 50, 'ja'), '1かなあたりの距離 [u/かな]（直近50かな）');
  assert.equal(runChartAxisTitle('perCharUnits', 50, 'en'), '1字あたりの距離 [u/字]（直近50字）');
});

test('指ごとの比較の面の名前・単位・説明は、英語のテキストで「かな」が出ない', () => {
  const ja = fingerMatrixSurfaceText('ja');
  const en = fingerMatrixSurfaceText('en');
  for (const surface of FINGER_MATRIX_SURFACE_IDS) {
    for (const field of ['label', 'unit', 'description'] as const) {
      assertUnitWord(ja[surface][field], en[surface][field], `${surface} ${field}`);
    }
  }
  assert.equal(ja.distance.unit, 'u/かな');
  assert.equal(en.presses.unit, 'キー/字');
  assert.equal(en.distance.unit, 'u/字');
});

test('指ごとの比較のセルの吹き出しは、英語のテキストで「入力N字」になる', () => {
  const zeros = (): number[] => Array.from({ length: 10 }, () => 0);
  const surfaces = {} as Record<FingerMatrixSurfaceId, readonly number[]>;
  for (const id of FINGER_MATRIX_SURFACE_IDS) surfaces[id] = id === 'pairMean' || id === 'pairStdDev' ? [0, 0, 0, 0, 0, 0] : zeros();
  const row: FingerMatrixOkRow = { kind: 'ok', targetKey: 'k', inputChars: 100, surfaces, fingerPressEvents: zeros() };
  for (const surface of FINGER_MATRIX_SURFACE_IDS) {
    assertUnitWord(fingerMatrixCell(surface, row, 0, 'ja').tip, fingerMatrixCell(surface, row, 0, 'en').tip, surface);
  }
  assert.equal(fingerMatrixCell('presses', row, 0, 'ja').tip, 'キー数0 / 入力100かな');
  assert.equal(fingerMatrixCell('presses', row, 0, 'en').tip, 'キー数0 / 入力100字');
});

test('打鍵再生の推移グラフの読み上げは、英語のテキストで「字/秒」になる', () => {
  const point = { cursor: 3, inputText: 'ab', kanaPerSecond: 2.5, actionsPerSecond: 3 };
  assert.equal(rateChartReadout(point, 'ja'), `3ステップ目、集計入力「ab」、かな/秒は${formatRate(2.5)}、アクション/秒は${formatRate(3)}`);
  assert.equal(rateChartReadout(point, 'en'), `3ステップ目、集計入力「ab」、字/秒は${formatRate(2.5)}、アクション/秒は${formatRate(3)}`);
});
