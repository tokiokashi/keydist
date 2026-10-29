import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { defaultRomajiRuleId, isRomajiBase, isUserRomajiRule, recommendedRomajiRuleId, tableForRule } from '../romaji/rules.ts';
import { buildGeometry, THUMB_KEY } from '../shapes/geometry.ts';
import { prepareEvaluationText } from '../text/evaluation-text.ts';
import { faceCells, LAYOUT_BY_ID, LAYOUTS, LAYOUTS_JA, withRomaji, type Layout } from './index.ts';
import { SEOTO_FACES } from './seoto.ts';

const geometry = buildGeometry('row-staggered');
const seotoJa = LAYOUTS_JA.find((layout) => layout.id === 'seoto')!;
const seotoEn = LAYOUTS.find((layout) => layout.id === 'seoto')!;
const LAYER_ID = 'layer:左親指';

/** 3段×10列の配列図。QWERTYの `q`〜`p`・`a`〜`;`・`z`〜`/` の位置に左から右へ置く。空白は文字の無いキー（`←` `→`） */
const QWERTY_POSITIONS = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
const FIGURE_ROWS = ['pzhf  qowx', 'dsntglaiue', 'brmcky,j.v'];

const prepare = (text: string, layout: Layout) =>
  prepareEvaluationText(text, {
    language: 'ja',
    keepSymbols: false,
    layoutHasChar: (char) => layout.map.has(char),
    layoutHasHeading: (heading) => layout.map.has(heading),
    maxKatakanaHeadingLength: 1,
  });

/** 打鍵ごとの、出力の文字・層・同時に押したキー */
const typed = (text: string, layout: Layout) => {
  const trace = generateTrace(prepare(text, layout), layout, geometry, DEFAULT_TRACE_POLICY);
  assert.deepEqual(trace.errors, []);
  assert.equal(trace.skipped, 0);
  return trace.strokes.map((stroke) => ({
    char: stroke.char,
    layer: stroke.aggregationGroupId,
    keys: stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).join('+'),
  }));
};

test('並びは配列図の3段×10列で、矢印のキーには文字が無い', () => {
  const base = SEOTO_FACES[0]!;
  const cells = faceCells(base);
  QWERTY_POSITIONS.forEach((positions, row) => {
    [...positions].forEach((key, col) => {
      const output = FIGURE_ROWS[row]![col]!;
      if (output === ' ') {
        assert.equal(cells.has(key), false, `${key} は文字の無いキー`);
        return;
      }
      assert.equal(cells.get(key), output, `${key} の位置`);
      assert.deepEqual(seotoEn.map.get(output), [[key]]);
    });
  });
  // `←` `→` の位置（QWERTYのtとy）は、どの出力の経路にも現れない
  const usedKeys = new Set(
    [...seotoEn.canonicalInputs.values()].flatMap((alternatives) =>
      alternatives.flatMap((alternative) => alternative.baseRealizations.flatMap((realization) => realization.actions.flat())),
    ),
  );
  assert.equal(usedKeys.has('t'), false);
  assert.equal(usedKeys.has('y'), false);
});

test('3段×10列の外はQWERTYのまま残し、; と / は置かない', () => {
  const cells = faceCells(SEOTO_FACES[0]!);
  for (const key of [..."1234567890-=[]'"]) assert.equal(cells.get(key), key);
  for (const output of [';', '/', ':', '?']) assert.equal(seotoEn.canonicalInputs.has(output), false, output);
  // 置いた記号はShiftで打てる
  assert.equal(seotoEn.canonicalInputs.has('<'), true);
  assert.equal(seotoEn.canonicalInputs.has('E'), true);
});

test('左親指の層は ん ー っ を右手の中指・薬指・小指の位置に持ち、BackSpaceは置かない', () => {
  const layer = SEOTO_FACES[1]!;
  assert.deepEqual(layer.trigger, [THUMB_KEY.LT]);
  assert.deepEqual(Object.fromEntries(faceCells(layer)), { k: 'ん', l: 'ー', ';': 'っ' });
});

test('組み込みの配列は、英文の一覧と日本語の一覧の両方に入り、推奨の規則はせおと配列の綴りである', () => {
  assert.equal(seotoEn.name, 'せおと配列');
  assert.equal(LAYOUT_BY_ID.get('seoto')?.id, 'seoto');
  assert.equal(recommendedRomajiRuleId('seoto'), 'seoto');
  assert.equal(defaultRomajiRuleId('seoto'), 'seoto');
  assert.equal(seotoJa.romajiTable?.get('か'), 'ca');
});

test('日本語は ん っ ー を左親指との同時押しの1打で打ち、子音の重ね・nn・- のキーを使わない', () => {
  const spelled = (text: string) => typed(text, seotoJa).map(({ char, layer, keys }) => `${char}:${layer === LAYER_ID ? 'L' : 'S'}:${keys}`);
  assert.deepEqual(spelled('きょう'), ['c:S:v', 'q:S:u', 'u:S:l']);
  assert.deepEqual(spelled('しゅっぱつ'), ['s:S:s', 'j:S:,', 'っ:L:thumb-l+;', 'p:S:q', 'a:S:j', 't:S:f', 'u:S:l']);
  assert.deepEqual(spelled('じゃあ'), ['z:S:w', 'x:S:p', 'a:S:j']);
  assert.deepEqual(spelled('やっぱり'), ['x:S:p', 'っ:L:thumb-l+;', 'p:S:q', 'a:S:j', 'r:S:x', 'i:S:k']);
  assert.deepEqual(spelled('ゆうき'), ['j:S:,', 'u:S:l', 'c:S:v', 'i:S:k']);
  assert.deepEqual(spelled('ほんとう'), ['h:S:e', 'o:S:i', 'ん:L:thumb-l+k', 't:S:f', 'o:S:i', 'u:S:l']);
  // 片仮名の ー は前処理でひらがなの文と同じ ー のまま残る
  assert.deepEqual(spelled('スーパー'), ['s:S:s', 'u:S:l', 'ー:L:thumb-l+l', 'p:S:q', 'a:S:j', 'ー:L:thumb-l+l']);
  // 子音の重ね（pp）とnnの綴りにならず、- のキーも使わない
  const all = typed('しゅっぱつ。ほんとうにすーぱー、ゆうき', seotoJa);
  assert.equal(
    all.some((stroke) => stroke.char === '-' || stroke.keys === 'q+q'),
    false,
  );
  assert.equal(all.filter((stroke) => stroke.char === 'n').length, 1);
});

test('記号の綴り（v. v, v-）は打て、v/ の・は / を出すキーが無いので打てない文字に数える', () => {
  const keys = (text: string) =>
    generateTrace(text, seotoJa, geometry, DEFAULT_TRACE_POLICY).strokes.map((stroke) =>
      stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).join('+'),
    );
  assert.deepEqual(keys('…'), ['/', '.']);
  assert.deepEqual(keys('‥'), ['/', 'm']);
  assert.deepEqual(keys('〜'), ['/', '-']);
  const dot = generateTrace('あ・', seotoJa, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(dot.skipped, 1);
  assert.deepEqual(
    dot.strokes.map((stroke) => stroke.char),
    ['a', 'v'],
  );
});

test('『』はテーブルの綴り（v[ v]）で打たれ、打てない文字に数えない', () => {
  const trace = generateTrace('『あ』', seotoJa, geometry, DEFAULT_TRACE_POLICY);
  assert.deepEqual(trace.errors, []);
  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['v', '[', 'a', 'v', ']'],
  );
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.inputChar),
    ['『', '『', 'あ', '』', '』'],
  );
});

test('英文は層を使わない（nが続く語も - も英字のキーで打つ）', () => {
  const trace = generateTrace('nnn-nn sound-', seotoEn, geometry, DEFAULT_TRACE_POLICY);
  assert.deepEqual(trace.errors, []);
  assert.equal(trace.skipped, 0);
  const strokes = trace.strokes.map((stroke) => ({
    char: stroke.char,
    layer: stroke.aggregationGroupId,
    keys: stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).join('+'),
  }));
  assert.equal(
    strokes.some((stroke) => stroke.layer === LAYER_ID),
    false,
  );
  assert.deepEqual(
    strokes.filter((stroke) => stroke.char === '-').map((stroke) => stroke.keys),
    ['-', '-'],
  );
});

test('せおと配列に別の規則を組むと、nnなどで打てるが層は使われない', () => {
  const kunrei = withRomaji(seotoJa, tableForRule('kunrei'));
  const strokes = typed('ほんとう', kunrei);
  assert.equal(
    strokes.some((stroke) => stroke.layer === LAYER_ID),
    false,
  );
  assert.equal(strokes.filter((stroke) => stroke.char === 'n').length, 2);
});

test('せおと配列の規則を別の配列と組むと、ん っ ー は打てない文字に数えられる', () => {
  const qwerty = LAYOUTS_JA.find((layout) => layout.id === 'qwerty')!;
  const trace = generateTrace('かんっー', withRomaji(qwerty, tableForRule('seoto')), geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 3);
});

test('せおと配列の規則は、利用者が作る規則の基底にしない', () => {
  assert.equal(isRomajiBase('seoto'), false);
  assert.equal(isRomajiBase('kunrei'), true);
  assert.equal(isUserRomajiRule({ id: 'user', name: 'テスト', base: 'seoto', overrides: {}, generateSokuon: false }), false);
  assert.equal(isUserRomajiRule({ id: 'user', name: 'テスト', base: 'kunrei', overrides: {}, generateSokuon: false }), true);
});
