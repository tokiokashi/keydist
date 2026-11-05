import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPARISON_COLUMN_IDS, COMPARISON_COLUMN_TEXT, COMPARISON_UNIT_NOTE } from '../comparison-column-text.ts';
import {
  IDENTITIES,
  SCATTER_PRESET_AXES,
  SCATTER_PRESET_DESCRIPTIONS,
  SCATTER_PRESET_IDS,
  SCATTER_PRESET_LABELS,
  scatterAxisProblem,
  scatterContour,
} from './axes.ts';
import { SCATTER_PANE_META } from './pane-meta.ts';
import { mentionsUnit, scatterQuantityHelp } from './quantity-help.ts';

const INPUT_CHARS = 100;
const PRESETS = SCATTER_PRESET_IDS.filter((id) => id !== 'free');

const text = (column: (typeof COMPARISON_COLUMN_IDS)[number]) => COMPARISON_COLUMN_TEXT[column];

test('どの恒等式も、3つの量を総数の形の名前で並べた式を持つ', () => {
  for (const identity of IDENTITIES) {
    assert.notEqual(identity.relation, '');
    for (const quantity of identity.quantities) {
      const name = quantity.total !== undefined ? text(quantity.total).label : text(quantity.perChar!).label.replace(/\/文字$/u, '');
      assert.ok(identity.relation.includes(name), `${identity.relation} に ${name} が無い`);
    }
  }
});

test('用意する組み合わせは、横軸・縦軸・細い線の量の名前と説明と、3つの量の関係の文を出す', () => {
  for (const id of PRESETS) {
    const axes = SCATTER_PRESET_AXES[id as keyof typeof SCATTER_PRESET_AXES];
    const contour = scatterContour(axes.x, axes.y, INPUT_CHARS);
    assert.ok(contour, id);
    const { help } = scatterQuantityHelp(axes, contour);
    const columns = [axes.x, axes.y, contour.column];
    assert.deepEqual(
      help.items.map((item) => item.name),
      [`横軸　${text(axes.x).label}`, `縦軸　${text(axes.y).label}`, `細い線　${text(contour.column).label}`],
      id,
    );
    assert.deepEqual(
      help.items.map((item) => item.description),
      columns.map((column) => text(column).description),
      id,
    );
    assert.ok(
      help.notes.some(
        (note) => note.includes(`細い線は、${text(contour.column).label}が同じになる位置を結んでいます。`) && note.includes(`${contour.relation}です。`),
      ),
      id,
    );
  }
});

test('自由に選ぶ組は、線を引く組にだけ細い線の量と関係の文を出し、軸の量の説明は必ず出す', () => {
  let withContour = 0;
  let withoutContour = 0;
  for (const x of COMPARISON_COLUMN_IDS) {
    for (const y of COMPARISON_COLUMN_IDS) {
      if (scatterAxisProblem(x, y) !== undefined) continue;
      const contour = scatterContour(x, y, INPUT_CHARS);
      const { help } = scatterQuantityHelp({ x, y }, contour);
      const names = help.items.map((item) => item.name);
      assert.deepEqual(names.slice(0, 2), [`横軸　${text(x).label}`, `縦軸　${text(y).label}`], `${x} ${y}`);
      if (contour === undefined) {
        withoutContour += 1;
        assert.equal(names.length, 2, `${x} ${y}`);
        assert.ok(!help.notes.some((note) => note.includes('細い線')), `${x} ${y}`);
      } else {
        withContour += 1;
        assert.equal(names.length, 3, `${x} ${y}`);
        assert.equal(names[2], `細い線　${text(contour.column).label}`, `${x} ${y}`);
        assert.ok(
          help.notes.some((note) => note.includes(`${contour.relation}です。`)),
          `${x} ${y}`,
        );
      }
    }
  }
  assert.ok(withContour > 0 && withoutContour > 0);
});

test('距離の単位の説明は、名前か説明にuが出る量がある時だけ出す', () => {
  for (const x of COMPARISON_COLUMN_IDS) {
    for (const y of COMPARISON_COLUMN_IDS) {
      if (scatterAxisProblem(x, y) !== undefined) continue;
      const contour = scatterContour(x, y, INPUT_CHARS);
      const { help } = scatterQuantityHelp({ x, y }, contour);
      const columns = [x, y, ...(contour === undefined ? [] : [contour.column])];
      assert.equal(help.notes.includes(COMPARISON_UNIT_NOTE), columns.some(mentionsUnit), `${x} ${y}`);
    }
  }
  assert.ok(mentionsUnit('perPressUnits'));
  assert.ok(mentionsUnit('totalUnits'));
  assert.ok(!mentionsUnit('actions'));
  assert.ok(!mentionsUnit('physicalBigramCombinations'));
});

test('1文字あたりの列が入る組は、総数を入力文字数で割った値だという換算を関係の文に足す', () => {
  const perPress = scatterContour('perCharPresses', 'perPressUnits', INPUT_CHARS)!;
  assert.equal(perPress.relation, '距離 = 押下数 × u/押下。押下数/文字は押下数を入力文字数で割った値、u/文字は距離を入力文字数で割った値');
  const distance = scatterContour('perCharSteps', 'meanPerStroke', INPUT_CHARS)!;
  assert.equal(distance.relation, '距離 = 動作数 × u/打鍵。動作数/文字は動作数を入力文字数で割った値、u/文字は距離を入力文字数で割った値');
  // 総数の形の軸だけの組には換算を足さない
  assert.equal(scatterContour('handSwitches', 'handContinuations', INPUT_CHARS)!.relation, IDENTITIES[5]!.relation);
  assert.equal(scatterContour('actions', 'meanPerStroke', INPUT_CHARS)!.relation, IDENTITIES[0]!.relation);
});

test('画面に「等位線」の語を出さない', () => {
  for (const id of PRESETS) {
    const axes = SCATTER_PRESET_AXES[id as keyof typeof SCATTER_PRESET_AXES];
    const { description, help } = scatterQuantityHelp(axes, scatterContour(axes.x, axes.y, INPUT_CHARS));
    assert.doesNotMatch(
      [description, ...help.notes, help.listLabel, ...help.items.flatMap((item) => [item.name, item.description])].join('\n'),
      /等位線/u,
    );
  }
  const meta = SCATTER_PANE_META;
  assert.doesNotMatch([meta.description, ...meta.help.notes, ...meta.help.items.flatMap((item) => [item.name, item.description])].join('\n'), /等位線/u);
});

test('見出しのⓘの組み合わせの一覧は、組み合わせの全部を同じ順で並べ、どれも説明を持つ', () => {
  assert.deepEqual(
    SCATTER_PANE_META.help.items.map((item) => item.name),
    SCATTER_PRESET_IDS.map((id) => SCATTER_PRESET_LABELS[id]),
  );
  for (const id of SCATTER_PRESET_IDS) assert.notEqual(SCATTER_PRESET_DESCRIPTIONS[id], '', id);
  assert.deepEqual(
    SCATTER_PANE_META.help.items.map((item) => item.description),
    SCATTER_PRESET_IDS.map((id) => SCATTER_PRESET_DESCRIPTIONS[id]),
  );
});
