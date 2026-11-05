import assert from 'node:assert/strict';
import test from 'node:test';
import type { TextLanguage } from '#input/text/language.ts';
import { COMPARISON_COLUMN_FORMAT, COMPARISON_COLUMN_IDS, comparisonColumnText } from '../comparison-column-text.ts';
import { SCATTER_PRESET_AXES, SCATTER_PRESET_IDS, scatterAxisProblem, scatterContour, scatterPresetDescriptions, scatterPresetLabels } from './axes.ts';
import { axisName, axisShortTitle, axisTitle, axisUnit, hasShortAxisName } from './axis-names.ts';
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
  assert.equal(axisTitle('meanPerStroke', 'ja'), '1アクションの距離（u）');
  assert.equal(axisTitle('sameFingerRate', 'ja'), '同指率（%）');
  assert.equal(axisTitle('actionsPerUnit', 'ja'), '1uのアクション数（1/u）');
  assert.equal(axisTitle('perCharSteps', 'ja'), '1かなのアクション数');
  assert.equal(axisTitle('perCharSteps', 'en'), '1字のアクション数');
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
      const width = estimateTextWidth(axisShortTitle(column, language));
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
    const text = comparisonColumnText(language);
    // 比較表の列名のうち、軸の名前に使わない書き方（u/アクション、アクション数/かな など）
    const columnLabels = COMPARISON_COLUMN_IDS.map((column) => text[column].label).filter((label) => label.includes('/'));
    const sentences: string[] = [];
    for (const id of SCATTER_PRESET_IDS) {
      sentences.push(scatterPresetLabels(language)[id], scatterPresetDescriptions(language)[id]);
      if (id === 'free') continue;
      const axes = SCATTER_PRESET_AXES[id];
      assert.equal(scatterPresetLabels(language)[id], `${axisName(axes.x, language)}と${axisName(axes.y, language)}`, id);
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

test('軸の名前の短い名前は、長い名前と同じ単位で、何あたりかを表す語を含まない', () => {
  const perWords = /1(かな|字|アクション|キー|文字|u)の|1つの/u;
  let declared = 0;
  for (const language of LANGUAGES) {
    for (const column of COMPARISON_COLUMN_IDS) {
      const long = axisTitle(column, language);
      const short = axisShortTitle(column, language);
      const unit = axisUnit(column);
      const suffix = unit === undefined ? '' : `（${unit}）`;
      assert.ok(short.endsWith(suffix), `${column} ${language}`);
      if (hasShortAxisName(column)) {
        declared += 1;
        const name = unit === undefined ? short : short.slice(0, -suffix.length);
        assert.ok(!perWords.test(name), `${column} ${language} 「${short}」`);
        assert.ok(short.length < long.length, `${column} ${language}`);
      } else {
        assert.equal(short, long, `${column} ${language}`);
      }
    }
  }
  assert.ok(declared > 0);
});

test('凡例とキャプションは、短い名前を宣言した列でも長い名前のまま', () => {
  assert.equal(axisTitle('meanPerStroke', 'ja'), '1アクションの距離（u）');
  assert.equal(axisShortTitle('meanPerStroke', 'ja'), '距離（u）');
  assert.equal(axisShortTitle('perCharSteps', 'en'), 'アクション数');
  assert.equal(axisShortTitle('sameFingerRate', 'ja'), '同指率（%）');
  assert.equal(scatterCaption({ x: 'perCharSteps', y: 'meanPerStroke' }, 'ja'), '1アクションの距離と1かなのアクション数の関係');
});
