import assert from 'node:assert/strict';
import test from 'node:test';
import type { TextLanguage } from '#input/text/language.ts';
import { COMPARISON_COLUMN_FORMAT, COMPARISON_COLUMN_IDS, type ComparisonColumnId, comparisonColumnText } from '../comparison-column-text.ts';
import { SCATTER_PRESET_AXES, SCATTER_PRESET_IDS, scatterAxisProblem, scatterContour, scatterPresetDescriptions, scatterPresetLabels } from './axes.ts';
import { axisName, axisPlotTitle, axisTitle, axisUnit, SCATTER_KANA_SCRIPT } from './axis-names.ts';
import { estimateTextWidth, PLOT_HEIGHT, PLOT_MARGIN, PLOT_WIDTH, scatterPlotModel } from './plot-model.ts';
import { scatterCaption } from './quantity-help.ts';

const LANGUAGES: readonly TextLanguage[] = ['ja', 'en'];
const PLOT_INNER_WIDTH = PLOT_WIDTH - PLOT_MARGIN.left - PLOT_MARGIN.right;
const PLOT_INNER_HEIGHT = PLOT_HEIGHT - PLOT_MARGIN.top - PLOT_MARGIN.bottom;
/** 説明に距離の単位uが出るか。英字の一部の`u`は数えない。 */
const mentionsDistanceUnit = (description: string): boolean => /(^|[^A-Za-z])u($|[^A-Za-z])/u.test(description);

test('率の列（値に%が付く列）の単位はちょうど%で、ほかの列は%でない', () => {
  for (const column of COMPARISON_COLUMN_IDS) {
    const isPercent = COMPARISON_COLUMN_FORMAT[column](0).endsWith('%');
    for (const language of LANGUAGES) {
      assert.equal(axisUnit(column) === '%', isPercent, `${column} ${language}`);
      assert.equal(axisTitle(column, language).endsWith('（%）'), isPercent, `${column} ${language}`);
    }
  }
});

test('単位uと1/uを宣言した列は比較表の説明に単位uが出て、単位を宣言しない列の説明には出ない', () => {
  for (const language of LANGUAGES) {
    const text = comparisonColumnText(language);
    for (const column of COMPARISON_COLUMN_IDS) {
      const unit = axisUnit(column);
      const declaresDistance = unit === 'u' || unit === '1/u';
      assert.equal(mentionsDistanceUnit(text[column].description), declaresDistance, `${column} ${language}`);
    }
  }
});

test('単位は名前の直後に全角のカッコで囲んで付け、単位が無い列は名前だけにする', () => {
  assert.equal(axisTitle('meanPerStroke', 'ja'), '1アクションで動く距離（u）');
  assert.equal(axisTitle('sameFingerRate', 'ja'), '同指率（%）');
  assert.equal(axisTitle('actionsPerUnit', 'ja'), '1u動く間に打つアクション数（1/u）');
  assert.equal(axisTitle('perCharSteps', 'ja'), '1カナを打つアクション数');
  assert.equal(axisTitle('perCharSteps', 'en'), '1字を打つアクション数');
  for (const column of COMPARISON_COLUMN_IDS) {
    for (const language of LANGUAGES) {
      const unit = axisUnit(column);
      assert.equal(axisTitle(column, language), unit === undefined ? axisName(column, language) : `${axisName(column, language)}（${unit}）`);
      // 名前に単位を含めない。単位は付ける時だけ足す
      assert.ok(!axisName(column, language).includes('（%）'), column);
    }
  }
});

test('軸に取れる全ての列の軸の名前は、日本語と英語のテキストのどちらでも互いに異なる', () => {
  for (const language of LANGUAGES) {
    const names = COMPARISON_COLUMN_IDS.map((column) => axisName(column, language));
    const titles = COMPARISON_COLUMN_IDS.map((column) => axisTitle(column, language));
    assert.equal(new Set(names).size, COMPARISON_COLUMN_IDS.length, language);
    assert.equal(new Set(titles).size, COMPARISON_COLUMN_IDS.length, language);
  }
});

test('軸の名前の推定幅は、横軸なら横の描画領域に、縦軸なら縦の描画領域の高さに収まる', () => {
  for (const language of LANGUAGES) {
    for (const column of COMPARISON_COLUMN_IDS) {
      const width = estimateTextWidth(axisPlotTitle(column, language));
      assert.ok(width <= PLOT_INNER_WIDTH, `横軸 ${column} ${language} ${width}`);
      assert.ok(width <= PLOT_INNER_HEIGHT, `縦軸 ${column} ${language} ${width}`);
    }
  }
});

test('細い線の量の名前を入れた凡例は、軸に取れる全ての組で描画領域の幅に収まる', () => {
  let checked = 0;
  for (const language of LANGUAGES) {
    for (const x of COMPARISON_COLUMN_IDS) {
      for (const y of COMPARISON_COLUMN_IDS) {
        if (scatterAxisProblem(x, y) !== undefined) continue;
        const contour = scatterContour(x, y, 100, language);
        if (contour === undefined || !contour.drawsLines) continue;
        const model = scatterPlotModel({
          points: [
            { targetKey: 'a', label: 'A', x: 1, y: 2 },
            { targetKey: 'b', label: 'B', x: 2, y: 1 },
          ],
          contour,
          legendRows: ['かな配列', '英字の配列'],
          contourName: axisTitle(contour.column, language),
          contourSuffix: '',
        });
        if (model.legend === undefined || model.contours.length === 0) continue;
        checked += 1;
        assert.ok(model.legend.x1 - model.legend.x0 <= PLOT_INNER_WIDTH, `${x} ${y} ${language}`);
      }
    }
  }
  assert.ok(checked > 0);
});

test('キャプション・組み合わせの名前と説明・関係式と換算の文は、比較表の列名でなく軸の名前で組み立てる', () => {
  for (const language of LANGUAGES) {
    // 比較表の列名のうち、軸の名前に使わない書き方（u/アクション、アクション数/かな など）。単位の語は「かな」と「カナ」の両方の書き方で探す
    const columnLabels = [comparisonColumnText(language), comparisonColumnText(language, SCATTER_KANA_SCRIPT)].flatMap((text) =>
      COMPARISON_COLUMN_IDS.map((column) => text[column].label).filter((label) => label.includes('/')),
    );
    const sentences: string[] = [];
    for (const id of SCATTER_PRESET_IDS) {
      sentences.push(scatterPresetLabels(language)[id], scatterPresetDescriptions(language)[id]);
      if (id === 'free') continue;
      const axes = SCATTER_PRESET_AXES[id];
      // コスパの組だけ、横軸の量を呼び慣れた名前（コスパ）を前に付けた名前にする。ほかの組は軸の長い名前をつなぐ
      const expectedLabel =
        id === 'charsPerAction'
          ? `コスパ（${axisPlotTitle(axes.x, language)}）と${axisName(axes.y, language)}`
          : `${axisName(axes.x, language)}と${axisName(axes.y, language)}`;
      assert.equal(scatterPresetLabels(language)[id], expectedLabel, id);
      assert.equal(scatterCaption(axes, language), `${axisName(axes.y, language)}と${axisName(axes.x, language)}の関係`, id);
      sentences.push(scatterCaption(axes, language));
    }
    for (const x of COMPARISON_COLUMN_IDS) {
      for (const y of COMPARISON_COLUMN_IDS) {
        if (scatterAxisProblem(x, y) !== undefined) continue;
        const contour = scatterContour(x, y, 100, language);
        if (contour === undefined) continue;
        sentences.push(contour.relation, contour.conversion ?? '', scatterCaption({ x, y }, language));
      }
    }
    for (const sentence of sentences) {
      for (const label of columnLabels) assert.ok(!sentence.includes(label), `${language} 「${sentence}」に列名 ${label} が残っている`);
    }
  }
});

const AXIS_PLOT_TITLES: Readonly<Record<string, readonly [string, string]>> = {
  meanPerStroke: ['距離/アクション（u）', '距離/アクション（u）'],
  perCharUnits: ['距離/カナ（u）', '距離/字（u）'],
  perPressUnits: ['距離/キー（u）', '距離/キー（u）'],
  perMovedPressUnits: ['距離/移動ありキー（u）', '距離/移動ありキー（u）'],
  unitsPerTextChar: ['距離/文字（u）', '距離/文字（u）'],
  perCharSteps: ['アクション数/カナ', 'アクション数/字'],
  perCharPresses: ['キー数/カナ', 'キー数/字'],
  perActionPresses: ['キー数/アクション', 'キー数/アクション'],
  textCharsPerAction: ['文字数/アクション', '文字数/アクション'],
  actionsPerTextChar: ['アクション数/文字', 'アクション数/文字'],
  actionsPerUnit: ['アクション数/距離（1/u）', 'アクション数/距離（1/u）'],
  textCharsPerUnit: ['文字数/距離（1/u）', '文字数/距離（1/u）'],
};

test('組み合わせの名前: コスパの組だけ「コスパ（文字数/アクション）と1u動く間に打つアクション数」で、ほかの組は軸の長い名前をつなぐ。軸の名前と凡例は変えない', () => {
  const labels = scatterPresetLabels('ja');
  assert.equal(labels.charsPerAction, 'コスパ（文字数/アクション）と1u動く間に打つアクション数');
  assert.equal(labels.handRates, '同じ手が続く割合と同指率');
  assert.equal(labels.distance, '1カナを打つアクション数と1アクションで動く距離');
  assert.equal(labels.textDistance, '1文字を打つアクション数と1アクションで動く距離');
  assert.equal(labels.press, '1アクションで押すキー数と1カナを打つアクション数');
  assert.equal(labels.perPress, '1カナで押すキー数と1キーで動く距離');
  assert.equal(labels.sameFinger, 'アクション数と同指率');
  assert.equal(labels.hand, '手を切り替える回数と同じ手が続く回数');
  assert.equal(labels.handShare, '右手キー率と右手距離率');
  assert.equal(labels.movedPress, '移動ありキー率と移動ありキー1つで動く距離');
  assert.equal(labels.free, '自由に選ぶ');
  assert.equal(axisName('textCharsPerAction', 'ja'), '1アクションで打つ文字数');
  assert.equal(axisTitle('actionsPerUnit', 'ja'), '1u動く間に打つアクション数（1/u）');
  assert.equal(axisPlotTitle('textCharsPerAction', 'ja'), '文字数/アクション');
  assert.equal(axisPlotTitle('actionsPerTextChar', 'ja'), 'アクション数/文字');
  assert.equal(scatterCaption(SCATTER_PRESET_AXES.textDistance, 'ja'), '1アクションで動く距離と1文字を打つアクション数の関係');
  assert.equal(scatterCaption(SCATTER_PRESET_AXES.charsPerAction, 'ja'), '1u動く間に打つアクション数と1アクションで打つ文字数の関係');
});

test('軸の名前は「量/何あたり（単位）」の形で、「かな」はテキストの言語で出し分ける', () => {
  for (const [column, [ja, en]] of Object.entries(AXIS_PLOT_TITLES)) {
    assert.equal(axisPlotTitle(column as ComparisonColumnId, 'ja'), ja, `${column} ja`);
    assert.equal(axisPlotTitle(column as ComparisonColumnId, 'en'), en, `${column} en`);
  }
});

test('軸の名前は、長い名前と同じ単位で、宣言の無い列は長い名前のまま、全列で互いに異なる', () => {
  for (const language of LANGUAGES) {
    for (const column of COMPARISON_COLUMN_IDS) {
      const unit = axisUnit(column);
      const suffix = unit === undefined ? '' : `（${unit}）`;
      const plot = axisPlotTitle(column, language);
      assert.ok(plot.endsWith(suffix), `${column} ${language}`);
      if (column in AXIS_PLOT_TITLES) assert.notEqual(plot, axisTitle(column, language), `${column} ${language}`);
      else assert.equal(plot, axisTitle(column, language), `${column} ${language}`);
    }
    const plots = COMPARISON_COLUMN_IDS.map((column) => axisPlotTitle(column, language));
    assert.equal(new Set(plots).size, COMPARISON_COLUMN_IDS.length, language);
  }
});

test('凡例とキャプションは、軸の名前を宣言した列でも長い名前のまま', () => {
  assert.equal(axisTitle('meanPerStroke', 'ja'), '1アクションで動く距離（u）');
  assert.equal(axisPlotTitle('meanPerStroke', 'ja'), '距離/アクション（u）');
  assert.equal(axisPlotTitle('sameFingerRate', 'ja'), '同指率（%）');
  assert.equal(scatterCaption({ x: 'perCharSteps', y: 'meanPerStroke' }, 'ja'), '1アクションで動く距離と1カナを打つアクション数の関係');
});

test('長い名前は「1〜あたりの」の形で、日本語と英語のテキストで表のとおりになる', () => {
  const expected: ReadonlyArray<readonly [ComparisonColumnId, string, string]> = [
    ['meanPerStroke', '1アクションで動く距離', '1アクションで動く距離'],
    ['perCharUnits', '1カナで動く距離', '1字で動く距離'],
    ['perCharSteps', '1カナを打つアクション数', '1字を打つアクション数'],
    ['perCharPresses', '1カナで押すキー数', '1字で押すキー数'],
    ['perActionPresses', '1アクションで押すキー数', '1アクションで押すキー数'],
    ['perPressUnits', '1キーで動く距離', '1キーで動く距離'],
    ['perMovedPressUnits', '移動ありキー1つで動く距離', '移動ありキー1つで動く距離'],
    ['textCharsPerAction', '1アクションで打つ文字数', '1アクションで打つ文字数'],
    ['actionsPerTextChar', '1文字を打つアクション数', '1文字を打つアクション数'],
    ['actionsPerUnit', '1u動く間に打つアクション数', '1u動く間に打つアクション数'],
    ['textCharsPerUnit', '1u動く間に打つ文字数', '1u動く間に打つ文字数'],
    ['unitsPerTextChar', '1文字で動く距離', '1文字で動く距離'],
  ];
  for (const [column, ja, en] of expected) {
    assert.equal(axisName(column, 'ja'), ja, column);
    assert.equal(axisName(column, 'en'), en, column);
  }
});

test('どの列の名前にも、1の直後の単位語に「の」が続く形は残らない', () => {
  const leftover = /1(アクション|かな|カナ|字|キー|文字|u|つ)の/u;
  for (const column of COMPARISON_COLUMN_IDS) {
    for (const language of LANGUAGES) {
      assert.doesNotMatch(axisName(column, language), leftover, `${column} ${language}`);
    }
  }
});

test('対数の目盛りの軸の名前: 単位がある列は単位と並べて括弧に入れ、無い列は「対数」だけを括弧に入れ、通常の目盛りでは変えない', () => {
  assert.equal(axisPlotTitle('meanPerStroke', 'ja'), '距離/アクション（u）');
  assert.equal(axisPlotTitle('meanPerStroke', 'ja', true), '距離/アクション（u、対数）');
  assert.equal(axisPlotTitle('actionsPerUnit', 'ja', true), 'アクション数/距離（1/u、対数）');
  assert.equal(axisPlotTitle('sameFingerRate', 'ja', true), '同指率（%、対数）');
  assert.equal(axisPlotTitle('actions', 'ja', true), `${axisName('actions', 'ja')}（対数）`);
  for (const column of COMPARISON_COLUMN_IDS) {
    assert.equal(axisPlotTitle(column, 'ja', false), axisPlotTitle(column, 'ja'));
    assert.ok(axisPlotTitle(column, 'ja', true).endsWith('対数）'), column);
  }
  // 組み合わせの名前・キャプション・点の読み取りに使う名前には、目盛りの種類を添えない
  assert.ok(!axisTitle('meanPerStroke', 'ja').includes('対数'));
  assert.ok(!axisName('meanPerStroke', 'ja').includes('対数'));
});

test('対数の目盛りの軸の名前の推定幅も、横の描画領域と縦の描画領域の高さに収まる', () => {
  for (const language of LANGUAGES) {
    for (const column of COMPARISON_COLUMN_IDS) {
      const width = estimateTextWidth(axisPlotTitle(column, language, true));
      assert.ok(width <= PLOT_INNER_WIDTH && width <= PLOT_INNER_HEIGHT, `${column} ${language} ${width}`);
    }
  }
});
