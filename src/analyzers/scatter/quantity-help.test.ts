import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPARISON_COLUMN_IDS, COMPARISON_UNIT_NOTE, comparisonColumnText } from '../comparison-column-text.ts';
import { axisName, axisPlotTitle, axisShortName, axisTitle, KEY_COUNT_NAME, SCATTER_KANA_SCRIPT } from './axis-names.ts';
import {
  IDENTITIES,
  identityRelation,
  SCATTER_PRESET_AXES,
  scatterPresetDescriptions,
  SCATTER_PRESET_IDS,
  scatterPresetLabels,
  scatterAxisProblem,
  scatterContour,
} from './axes.ts';
import { SCATTER_PANE_META } from './pane-meta.ts';
import { mentionsUnit, readoutAriaLabel, readoutText, scatterCaption, scatterQuantityHelp } from './quantity-help.ts';

const INPUT_CHARS = 100;
const PRESETS = SCATTER_PRESET_IDS.filter((id) => id !== 'free');

type Column = (typeof COMPARISON_COLUMN_IDS)[number];
const tableText = (column: Column) => comparisonColumnText('ja')[column];
const text = (column: Column) => comparisonColumnText('ja', SCATTER_KANA_SCRIPT)[column];
const name = (column: Column) => axisName(column, 'ja');
const title = (column: Column) => axisTitle(column, 'ja');
/** 図の見方の量の一覧の説明。軸の名前から比較表の列を探せるよう、比較表の見出しのとおりの列名を先頭に添え、説明は散布図の単位の語で書く。 */
const itemDescription = (column: Column) => `比較表の列名は「${tableText(column).label}」。${text(column).description}`;

test('どの恒等式も、3つの量を総数の形の名前で並べた式を持つ', () => {
  for (const identity of IDENTITIES) {
    assert.notEqual(identityRelation(identity, 'ja'), '');
    for (const quantity of identity.quantities) {
      const expected = quantity.total !== undefined ? name(quantity.total) : KEY_COUNT_NAME;
      assert.ok(identityRelation(identity, 'ja').includes(expected), `${identityRelation(identity, 'ja')} に ${expected} が無い`);
    }
  }
});

test('細い線を引く用意した組み合わせは、横軸・縦軸・細い線の量の名前と説明と、3つの量の関係の文を出す', () => {
  let checked = 0;
  for (const id of PRESETS) {
    const axes = SCATTER_PRESET_AXES[id as keyof typeof SCATTER_PRESET_AXES];
    const contour = scatterContour(axes.x, axes.y, INPUT_CHARS, 'ja');
    if (contour === undefined || !contour.drawsLines) continue;
    checked += 1;
    const { help } = scatterQuantityHelp(axes, contour, 'ja');
    const columns = [axes.x, axes.y, contour.column];
    assert.deepEqual(
      help.items.map((item) => item.name),
      [`横軸　${title(axes.x)}`, `縦軸　${title(axes.y)}`, `細い線　${title(contour.column)}`],
      id,
    );
    assert.deepEqual(
      help.items.map((item) => item.description),
      columns.map((column) => itemDescription(column)),
      id,
    );
    assert.ok(
      help.notes.some(
        (note) =>
          note.includes(`細い線は、${name(contour.column)}が同じになる位置を結んでいます。`) &&
          note.includes(
            `3つの量の関係は、${contour.relation}です。${contour.conversion === undefined ? '' : `${contour.conversion}です。`}線の上に値を書き、量の名前は凡例に示しています。`,
          ),
      ),
      id,
    );
  }
  assert.equal(checked, 7);
});

test('自由に選ぶ組は、線を引く組にだけ細い線の量と関係の文を出し、軸の量の説明は必ず出す', () => {
  let withContour = 0;
  let withoutLine = 0;
  let withoutContour = 0;
  for (const x of COMPARISON_COLUMN_IDS) {
    for (const y of COMPARISON_COLUMN_IDS) {
      if (scatterAxisProblem(x, y) !== undefined) continue;
      const contour = scatterContour(x, y, INPUT_CHARS, 'ja');
      const { help } = scatterQuantityHelp({ x, y }, contour, 'ja');
      const names = help.items.map((item) => item.name);
      assert.deepEqual(names.slice(0, 2), [`横軸　${title(x)}`, `縦軸　${title(y)}`], `${x} ${y}`);
      if (contour === undefined) {
        withoutContour += 1;
        assert.equal(names.length, 2, `${x} ${y}`);
        assert.ok(!help.notes.some((note) => note.includes('細い線')), `${x} ${y}`);
      } else if (!contour.drawsLines) {
        // 線を引かない組: 3つの量の関係の文は出すが、細い線の文・量の一覧の行は出さない
        withoutLine += 1;
        assert.equal(names.length, 2, `${x} ${y}`);
        assert.ok(
          help.notes.some((note) => note.includes(`${contour.relation}です。`) && note.includes(name(contour.column))),
          `${x} ${y}`,
        );
        assert.ok(!help.notes.some((note) => note.includes('細い線は')), `${x} ${y}`);
        assert.ok(!help.items.some((item) => item.name.startsWith('細い線')), `${x} ${y}`);
      } else {
        withContour += 1;
        assert.equal(names.length, 3, `${x} ${y}`);
        assert.equal(names[2], `細い線　${title(contour.column)}`, `${x} ${y}`);
        assert.ok(
          help.notes.some((note) => note.includes(`${contour.relation}です。`)),
          `${x} ${y}`,
        );
      }
    }
  }
  assert.ok(withContour > 0 && withoutLine > 0 && withoutContour > 0);
});

test('距離の単位の説明は、単位がuか1/uの量がある時だけ出す', () => {
  for (const x of COMPARISON_COLUMN_IDS) {
    for (const y of COMPARISON_COLUMN_IDS) {
      if (scatterAxisProblem(x, y) !== undefined) continue;
      const contour = scatterContour(x, y, INPUT_CHARS, 'ja');
      const { help } = scatterQuantityHelp({ x, y }, contour, 'ja');
      // 線を引かない組も、関係の文に線の量の名前が出るので、その量の単位を説明する
      const columns = [x, y, ...(contour === undefined ? [] : [contour.column])];
      assert.equal(
        help.notes.includes(COMPARISON_UNIT_NOTE),
        columns.some((column) => mentionsUnit(column)),
        `${x} ${y}`,
      );
    }
  }
  assert.ok(mentionsUnit('perPressUnits'));
  assert.ok(mentionsUnit('totalUnits'));
  assert.ok(mentionsUnit('actionsPerUnit'));
  assert.ok(!mentionsUnit('actions'));
  assert.ok(!mentionsUnit('sameFingerRate'));
  assert.ok(!mentionsUnit('physicalBigramCombinations'));
});

test('1かなあたりの列が入る組は、総数を入力かな数で割った値だという換算を関係の文に足す', () => {
  const perPress = scatterContour('perCharPresses', 'perPressUnits', INPUT_CHARS, 'ja')!;
  assert.equal(perPress.relation, '総移動距離 = キー数 × 1キーあたりの距離');
  assert.equal(perPress.conversion, '1カナあたりのキー数はキー数を入力カナ数で割った値、1カナあたりの距離は総移動距離を入力カナ数で割った値');
  const distance = scatterContour('perCharSteps', 'meanPerStroke', INPUT_CHARS, 'ja')!;
  assert.equal(distance.relation, '総移動距離 = アクション数 × 1アクションあたりの距離');
  assert.equal(distance.conversion, '1カナあたりのアクション数はアクション数を入力カナ数で割った値、1カナあたりの距離は総移動距離を入力カナ数で割った値');
  // 総数の形の軸だけの組には換算を足さない
  const hand = scatterContour('handSwitches', 'handContinuations', INPUT_CHARS, 'ja')!;
  assert.equal(hand.relation, identityRelation(IDENTITIES[5]!, 'ja'));
  assert.equal(hand.conversion, undefined);
  assert.equal(scatterContour('actions', 'meanPerStroke', INPUT_CHARS, 'ja')!.conversion, undefined);
});

test('画面に「等位線」の語を出さない', () => {
  for (const id of PRESETS) {
    const axes = SCATTER_PRESET_AXES[id as keyof typeof SCATTER_PRESET_AXES];
    const { description, help } = scatterQuantityHelp(axes, scatterContour(axes.x, axes.y, INPUT_CHARS, 'ja'), 'ja');
    assert.doesNotMatch(
      [description, ...help.notes, help.listLabel, ...help.items.flatMap((item) => [item.name, item.description])].join('\n'),
      /等位線/u,
    );
  }
  const meta = SCATTER_PANE_META;
  assert.doesNotMatch(
    [meta.description, ...meta.help('ja').notes, ...meta.help('ja').items.flatMap((item) => [item.name, item.description])].join('\n'),
    /等位線/u,
  );
});

test('見出しのⓘの組み合わせの一覧は、組み合わせの全部を同じ順で並べ、どれも説明を持つ', () => {
  assert.deepEqual(
    SCATTER_PANE_META.help('ja').items.map((item) => item.name),
    SCATTER_PRESET_IDS.map((id) => scatterPresetLabels('ja')[id]),
  );
  for (const id of SCATTER_PRESET_IDS) assert.notEqual(scatterPresetDescriptions('ja')[id], '', id);
  assert.deepEqual(
    SCATTER_PANE_META.help('ja').items.map((item) => item.description),
    SCATTER_PRESET_IDS.map((id) => scatterPresetDescriptions('ja')[id]),
  );
});

test('移動ありキーの割合と移動ありキー1つあたりの距離: 線を引かず、図の見方にu/キーとの関係の文が出る', () => {
  const axes = SCATTER_PRESET_AXES.movedPress;
  const contour = scatterContour(axes.x, axes.y, INPUT_CHARS, 'ja');
  assert.equal(contour?.drawsLines, false);
  const { help } = scatterQuantityHelp(axes, contour, 'ja');
  assert.deepEqual(help.notes, [
    '1キーあたりの距離を含む3つの量の関係は、1キーあたりの距離 = 移動ありキー率 ÷ 100 × 移動ありキー1つあたりの距離です。',
    COMPARISON_UNIT_NOTE,
  ]);
  assert.deepEqual(
    help.items.map((item) => item.name),
    ['横軸　移動ありキー率（%）', '縦軸　移動ありキー1つあたりの距離（u）'],
  );
});

test('左右のキーと距離の割合: 50%の線と4つの区画、2軸が同じキーから作られていることを書く', () => {
  const axes = SCATTER_PRESET_AXES.handShare;
  const { help } = scatterQuantityHelp(axes, scatterContour(axes.x, axes.y, INPUT_CHARS, 'ja'), 'ja');
  assert.deepEqual(help.notes, [
    '横軸と縦軸の50%の位置に線を引いています。右手と左手が半分ずつになる、左右が均等の位置です。50%が軸の範囲の外にある時は引きません。',
    '50%の線で図が4つの区画に分かれます。右上は押すキーの数も距離も右手寄り、左下はどちらも左手寄り、左上は押すキーの数は左手が多いのに距離は右手が多く、右下は押すキーの数は右手が多いのに距離は左手が多い区画です。',
    '右手キー率は押したキーの数のうち右手の割合、右手距離率は移動距離のうち右手のキーの分の割合で、どちらも同じキーを右手と左手に分けて数えた値から作っています。',
  ]);
  // 自由に選ぶで2軸を入れ替えると、左上と右下の説明が入れ替わる
  const swapped = scatterQuantityHelp({ x: axes.y, y: axes.x }, scatterContour(axes.y, axes.x, INPUT_CHARS, 'ja'), 'ja').help.notes;
  assert.ok(swapped[1]!.includes('右上は距離も押すキーの数も右手寄り、左下はどちらも左手寄り'));
  assert.ok(swapped[1]!.includes('左上は距離は左手が多いのに押すキーの数は右手が多く'));
  assert.ok(swapped[1]!.includes('右下は距離は右手が多いのに押すキーの数は左手が多い区画です'));
});

test('同じ手の続きの割合と同指率: 線を引かず、数え方と分母が違う別の量だという説明を、どちらの順でも出す', () => {
  const axes = SCATTER_PRESET_AXES.handRates;
  const note =
    '同じ手の続きの割合と同指率は、どちらも各アクションをどの手、どの指が打つかから作る割合です。数え方と分母が違い、2つを結ぶ関係式はありません。';
  for (const [x, y] of [
    [axes.x, axes.y],
    [axes.y, axes.x],
  ] as const) {
    const { help } = scatterQuantityHelp({ x, y }, scatterContour(x, y, INPUT_CHARS, 'ja'), 'ja');
    assert.deepEqual(help.notes, [note]);
  }
  // ほかの組には出ない。片方だけがこの2列の組も含む
  const others: ReadonlyArray<readonly [Column, Column]> = [
    ['sameHandContinuationRate', 'perCharSteps'],
    ['perCharSteps', 'sameFingerRate'],
    ['sameHandContinuationRate', 'sameHandContinuationRate'],
    ['actions', 'sameFingerRate'],
  ];
  for (const [x, y] of others) {
    const notes = scatterQuantityHelp({ x, y }, undefined, 'ja').help.notes;
    assert.ok(!notes.some((text) => text.includes('数え方と分母が違い')), `${x} ${y}`);
  }
  for (const id of SCATTER_PRESET_IDS) {
    if (id === 'free' || id === 'handRates') continue;
    const { x, y } = SCATTER_PRESET_AXES[id];
    assert.ok(!scatterQuantityHelp({ x, y }, scatterContour(x, y, INPUT_CHARS, 'ja'), 'ja').help.notes.includes(note), id);
  }
  // 説明と組の説明文は、交互と続きのどちらが良いかを言わず、同指が同じ手の続きに入るとも言わない
  assert.doesNotMatch(`${note}${scatterPresetDescriptions('ja').handRates}`, /速|打ちやす|良い|悪い|入る|入れ子|独立/u);
});

test('50%の線の説明: 軸の片方だけが右手の割合の時は、その軸の線だけを書き、区画と同じキーから作られた説明は出さない', () => {
  const onX = scatterQuantityHelp({ x: 'rightHandPressShare', y: 'perCharUnits' }, undefined, 'ja').help.notes;
  assert.equal(onX.length, 2);
  assert.ok(onX[0]!.startsWith('横軸の50%の位置に線を引いています。'));
  const onY = scatterQuantityHelp({ x: 'perCharUnits', y: 'rightHandDistanceShare' }, undefined, 'ja').help.notes;
  assert.ok(onY[0]!.startsWith('縦軸の50%の位置に線を引いています。'));
  for (const notes of [onX, onY]) assert.ok(!notes.some((note) => note.includes('区画') || note.includes('同じキーを右手と左手に分けて')));
  // ほかの割合の列は50%が左右の均等の位置ではないので、説明しない
  for (const column of ['sameFingerRate', 'sameHandContinuationRate', 'movedPressShare', 'bothHandPairShare', 'alternationCoverage'] as const) {
    assert.deepEqual(
      scatterQuantityHelp({ x: column, y: 'perCharSteps' }, undefined, 'ja').help.notes.filter((note) => note.includes('50%')),
      [],
      column,
    );
  }
});

test('図の下のキャプション: 縦軸の量と横軸の量の関係を、軸の名前から単位を除いた言葉で言い切る', () => {
  assert.equal(scatterCaption(SCATTER_PRESET_AXES.distance, 'ja'), '1アクションあたりの距離と1カナあたりのアクション数の関係');
  assert.equal(scatterCaption(SCATTER_PRESET_AXES.handShare, 'ja'), '右手距離率と右手キー率の関係');
  assert.equal(scatterCaption({ x: 'totalUnits', y: 'sameFinger' }, 'ja'), '同指の回数と総移動距離の関係');
  // 英語のテキストでは、名前の「かな」が「字」になる
  assert.equal(scatterCaption(SCATTER_PRESET_AXES.distance, 'en'), '1アクションあたりの距離と1字あたりのアクション数の関係');
});

test('固定の説明は、線を引かない図があることと食い違わない', () => {
  const meta = SCATTER_PANE_META;
  const notes = meta.help('ja').notes.join('\n');
  assert.doesNotMatch(meta.description, /細い線/u);
  assert.doesNotMatch(notes, /線を結んでいます|位置を結んでいます/u);
  assert.match(notes, /線は、同じテキストを打つ時の距離と取り違えやすいので引きません/u);
});

test('点の読み取り: 名前と「(横, 縦)」に続けて、線を引く組だけ線の量の短い名前と値を出す', () => {
  const values = Object.fromEntries(COMPARISON_COLUMN_IDS.map((column) => [column, 7])) as Parameters<typeof readoutText>[0]['values'];
  const readout = (axes: { x: Column; y: Column }, x: number, y: number, rowValues = values, language: 'ja' | 'en' = 'ja') =>
    readoutText({ label: 'A', fullName: 'QWERTY', x, y, values: rowValues }, axes, scatterContour(axes.x, axes.y, INPUT_CHARS, language), language);
  // 線を引く既定の組: u/かな = アクション数/かな × u/アクション。線の量は軸の名前と同じ縮めた名前で、単位は付けない
  assert.equal(readout(SCATTER_PRESET_AXES.distance, 1.5, 2, { ...values, perCharUnits: 3 }), 'QWERTY　(1.500, 2.000)　距離/カナ 3.000');
  // 線を引かない組: 線の量（u/キー・u/アクション・アクション/u）の名前と値を出さない
  assert.equal(readout(SCATTER_PRESET_AXES.movedPress, 50, 4, { ...values, perPressUnits: 2 }), 'QWERTY　(50.0%, 4.000)');
  assert.equal(
    readout(SCATTER_PRESET_AXES.hand, 520.5, 702.5, { ...values, sameHandContinuationRate: 57.4 }),
    'QWERTY　(520.5, 702.5)　同じ手の続きの割合 57.4%',
  );
  assert.equal(readout({ x: 'perActionPresses', y: 'perPressUnits' }, 2, 1.5), 'QWERTY　(2.000, 1.500)');
  assert.equal(readout({ x: 'textCharsPerAction', y: 'textCharsPerUnit' }, 2, 6), 'QWERTY　(2.000, 6.000)');
  // 割合の軸の値には%が付く
  assert.equal(readout(SCATTER_PRESET_AXES.handShare, 52, 48), 'QWERTY　(52.0%, 48.0%)');
  // 縮めた名前を持たない線の量は、長い名前のまま
  assert.equal(readout({ x: 'actions', y: 'meanPerStroke' }, 10, 2), 'QWERTY　(10, 2.000)　総移動距離 20');
  // 線の量の列が値を持たない対象には、線を引く組でも出さない
  assert.equal(readout(SCATTER_PRESET_AXES.distance, 1.5, 2, { ...values, perCharUnits: Number.NaN }), 'QWERTY　(1.500, 2.000)');
  // 英語のテキストでは、何あたりの語が「字」になる
  assert.equal(readout(SCATTER_PRESET_AXES.distance, 1.5, 2, { ...values, perCharUnits: 3 }, 'en'), 'QWERTY　(1.500, 2.000)　距離/字 3.000');
});

test('点の読み取り: 軸の名前に添える単位と「対数」の印は、線の量の名前に付けない', () => {
  const column = SCATTER_PRESET_AXES.distance;
  const contour = scatterContour(column.x, column.y, INPUT_CHARS, 'ja');
  assert.ok(contour !== undefined);
  assert.equal(axisPlotTitle(contour.column, 'ja', true), '距離/カナ（u、対数）');
  assert.equal(axisShortName(contour.column, 'ja'), '距離/カナ');
});

test('点の読み上げ用の名前は、量の名前を長い形で全て添える', () => {
  const values = Object.fromEntries(COMPARISON_COLUMN_IDS.map((c) => [c, 7])) as Parameters<typeof readoutText>[0]['values'];
  const axes = SCATTER_PRESET_AXES.distance;
  assert.equal(
    readoutAriaLabel(
      { label: 'A', fullName: 'QWERTY', x: 1.5, y: 2, values: { ...values, perCharUnits: 3 } },
      axes,
      scatterContour(axes.x, axes.y, INPUT_CHARS, 'ja'),
      'ja',
    ),
    'QWERTY　1カナあたりのアクション数 1.500　1アクションあたりの距離 2.000　1カナあたりの距離 3.000',
  );
});

test('図の見方の量の説明は、比較表の列名を比較表の見出しのとおり「かな」で引き、続く説明は「カナ」で書く', () => {
  const { help } = scatterQuantityHelp(SCATTER_PRESET_AXES.perPress, scatterContour('perCharPresses', 'perPressUnits', INPUT_CHARS, 'ja'), 'ja');
  assert.deepEqual(
    help.items.map((item) => item.description.slice(0, item.description.indexOf('。') + 1)),
    ['比較表の列名は「キー数/かな」。', '比較表の列名は「u/キー」。', '比較表の列名は「u/かな」。'],
  );
  const [x, , line] = help.items.map((item) => item.description);
  assert.ok(x?.includes('入力1カナあたりに押すキーの数。'), x);
  assert.ok(line?.includes('入力1カナあたりの総移動距離（u/カナ）。カナ数は、'), line);
  // 個々の字を指す「かな」は単位の語でないので、ひらがなのまま
  assert.ok(line?.includes('大半はかなですが'), line);
});

test('図の見方: 対数の目盛りで描いている時だけ、対数の目盛りの説明を出す', () => {
  const { x, y } = SCATTER_PRESET_AXES.distance;
  const contour = scatterContour(x, y, INPUT_CHARS, 'ja');
  const linear = scatterQuantityHelp({ x, y }, contour, 'ja').help.notes;
  assert.deepEqual(scatterQuantityHelp({ x, y }, contour, 'ja', false).help.notes, linear);
  const log = scatterQuantityHelp({ x, y }, contour, 'ja', true).help.notes;
  assert.equal(log.length, linear.length + 1);
  assert.ok(log.some((note) => note.includes('対数の目盛り')));
  assert.ok(!linear.some((note) => note.includes('対数')));
});

test('ペインの図の見方: 目盛りを対数にできる図とできない図の説明を出す', () => {
  const notes = SCATTER_PANE_META.help('ja').notes;
  assert.ok(notes.some((note) => note.includes('目盛りを対数にすると') && note.includes('0以下')));
});
