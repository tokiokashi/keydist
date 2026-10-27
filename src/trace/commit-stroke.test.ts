import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { faceFromEntries, fromFaces, SINGLE_LAYER_ID, type Face, type Layout } from '#input/layouts/index.ts';
import { compileSequenceInputAlternative } from '#input/semantics/index.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { analyzeChains, DEFAULT_CHAIN_INTERPRETATION } from '#interpretation/structure/chain.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { countBigramCombinations } from '#interpretation/bigram-combinations.ts';
import { strokeOverheadSide } from '#interpretation/timing/stroke-structure.ts';
import { playbackStrokeDisplay } from '#interpretation/timing/playback.ts';
import { generateTrace, type Stroke, type TracePolicy } from './generate.ts';
import { commitStrokeRulesOf, needsCommitStroke } from './commit-stroke.ts';

const geometry = buildGeometry('row-staggered');
const opts = (o: Partial<TracePolicy> = {}): TracePolicy => ({ windowSize: 3, sfbHomeCost: true, ...o });

const single = (entries: Record<string, string>): Face => ({ ...faceFromEntries([], 'simultaneous', entries), inputRole: 'layer' });
const prefix2 = (trigger: string, entries: Record<string, string>, persistence: 'single' | 'hold-capable' = 'single'): Face => ({
  ...faceFromEntries([trigger], 'prefix', entries),
  inputRole: 'layer',
  triggerPersistence: persistence,
});
const suffix2 = (trigger: string, entries: Record<string, string>): Face => ({
  ...faceFromEntries([trigger], 'suffix', entries),
  inputRole: 'layer',
  triggerPersistence: 'single',
});
const prefix3 = (prefix: string, suffix: string, entries: Record<string, string>): Face => ({ ...prefix2(prefix, entries), suffixTrigger: [suffix] });

const keysOf = (stroke: Stroke): string[] => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).sort();
const typed = (text: string, layout: Layout, o: Partial<TracePolicy> = {}) => generateTrace(text, layout, geometry, opts(o));
const keyLists = (text: string, layout: Layout, o: Partial<TracePolicy> = {}) => typed(text, layout, o).strokes.map((stroke) => keysOf(stroke).join('+'));

/** 後置トリガー `f` が単打の `。` でもある配列。`w` の `か` の後に `f` を打つと、2打の後置の面の `ほ` として読まれる。 */
const postfix = () =>
  fromFaces('postfix', '後置', [single({ w: 'か', k: 'き', e: '、', f: '。', a: 'あ' }), suffix2('f', { w: 'ほ' }), prefix2('f', { x: 'だ' })]);

/** 前置トリガー `j` が単打の `っ` でもある配列。 */
const prefixSingle = () => fromFaces('prefix', '前置', [single({ j: 'っ', d: 'ば', a: 'あ', k: 'か' }), prefix2('j', { d: 'みゅ' })]);

/** 前置トリガー `d` `k` が単打の句読点でもある配列。 */
const punctuation = () =>
  fromFaces('punctuation', '句読点', [single({ d: '、', k: '。', a: 'あ', f: 'い' }), prefix2('d', { f: 'ゆ' }), prefix2('k', { a: 'ぞ' })]);

/** 前置 `j`・出力キー `k`・後置 `e` の3打の面と、前置 `j` の2打の面を持つ配列。 */
const threeStroke = () =>
  fromFaces('three', '3打', [single({ k: 'ひ', e: '。', a: 'あ', j: 'っ' }), prefix2('j', { k: 'ぃ' }), prefix3('j', 'e', { k: 'ひゃ' })]);

/** 3打の面だけを持つ配列。 */
const threeOnly = () => fromFaces('three-only', '3打のみ', [single({ j: 'っ', k: 'ひ', e: '。' }), prefix3('j', 'e', { k: 'ひゃ' })]);

test('後置の側: 後置の面の出力キーで出すかなの次に後置トリガーの単打が続くと、確定の打鍵が1つ入り3打になる', () => {
  const trace = typed('か。', postfix());
  assert.deepEqual(
    trace.strokes.map((stroke) => keysOf(stroke).join('+')),
    ['w', 'thumb-r', 'f'],
  );
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.commit === true),
    [false, true, false],
  );
});

test('後置の側: Aの最後のキーが後置の面に無い時は、確定が入らない', () => {
  assert.deepEqual(keyLists('き。', postfix()), ['k', 'f']);
  assert.deepEqual(keyLists('あ。', postfix()), ['a', 'f']);
});

test('後置の側: Bの最初のキーが後置トリガーでも、Bがそのトリガーの単打だけでなければ確定が入らない', () => {
  assert.deepEqual(keyLists('かだ', postfix()), ['w', 'f', 'x']);
});

test('前置の側: Aが前置トリガーの単打で、Bの最初のキーがその前置の面の出力キーなら確定が入る', () => {
  assert.deepEqual(keyLists('っば', prefixSingle()), ['j', 'thumb-r', 'd']);
  assert.deepEqual(keyLists('あっば', prefixSingle()), ['a', 'j', 'thumb-r', 'd']);
});

test('前置の側: Bの最初のキーがその前置の面に無い時は確定が入らない', () => {
  assert.deepEqual(keyLists('っか', prefixSingle()), ['j', 'k']);
  assert.deepEqual(keyLists('ばっ', prefixSingle()), ['d', 'j']);
});

test('前置の側: 前置トリガーを兼ねる句読点の後に、その前置の面の出力キーで始まるかなが続く時に確定が入る', () => {
  assert.deepEqual(keyLists('、い', punctuation()), ['d', 'thumb-r', 'f']);
  assert.deepEqual(keyLists('。あ', punctuation()), ['k', 'thumb-r', 'a']);
  assert.deepEqual(keyLists('、あ', punctuation()), ['d', 'a']);
  assert.deepEqual(keyLists('。い', punctuation()), ['k', 'f']);
});

test('後置トリガーを3打の面だけが持つ時、Aが単打 `k` なら確定が入らず、Aが前置の2打の面 `j` `k` なら入る', () => {
  assert.deepEqual(keyLists('ひ。', threeStroke()), ['k', 'e']);
  assert.deepEqual(keyLists('ぃ。', threeStroke()), ['j', 'k', 'thumb-r', 'e']);
});

test('Aの最後の打鍵が後置トリガーの時、後置の面の出力キーではないので確定が入らない', () => {
  const layout = fromFaces('tail', '末尾', [single({ r: 'ふ', e: '、' }), suffix2('e', { r: 'ふぁ' })]);
  assert.deepEqual(keyLists('ふぁ、', layout), ['r', 'e', 'e']);
  assert.deepEqual(keyLists('ふ、', layout), ['r', 'thumb-r', 'e']);
});

test('3打の面の末尾の後置トリガーの後にも、同じ文面で判定する', () => {
  assert.deepEqual(keyLists('ひゃ。', threeStroke()), ['j', 'k', 'e', 'e']);
});

test('前置の側: Bの最初のキーが、同じ前置トリガーを持つ3打の面の出力キーの時に確定が入る', () => {
  assert.deepEqual(keyLists('っひ', threeOnly()), ['j', 'thumb-r', 'k']);
  assert.deepEqual(keyLists('っ。', threeOnly()), ['j', 'e']);
});

test('AとBの間に打てない文字がある時は、確定が入らない', () => {
  const trace = typed('か漢。', postfix());
  assert.equal(trace.skipped, 1);
  assert.deepEqual(
    trace.strokes.map((stroke) => keysOf(stroke).join('+')),
    ['w', 'f'],
  );
});

test('前置の側と後置の側の両方に当たる継ぎ目でも、確定は1つだけ入る', () => {
  const rules = {
    suffixHeads: new Map([['e', [['j']]]]),
    prefixOutputs: new Map([['j', new Set(['e'])]]),
  };
  const alternative = (output: string, keys: string[]) =>
    compileSequenceInputAlternative(
      output,
      keys.map((key) => [key]),
      SINGLE_LAYER_ID,
    );
  assert.equal(needsCommitStroke(rules, alternative('っ', ['j']), alternative('、', ['e'])), true);
  assert.equal(needsCommitStroke({ suffixHeads: rules.suffixHeads, prefixOutputs: new Map() }, alternative('っ', ['j']), alternative('、', ['e'])), true);
  assert.equal(
    needsCommitStroke({ suffixHeads: new Map(), prefixOutputs: rules.prefixOutputs }, alternative('っ', ['j']), alternative('、', ['e'])),
    true,
  );
});

test('同時押しの打鍵と、トリガーが2キー以上の面は規則の対象にしない', () => {
  const simultaneous = fromFaces('sim', '同時', [
    single({ w: 'か', f: '。' }),
    { ...faceFromEntries(['f'], 'simultaneous', { w: 'ほ' }), inputRole: 'layer', triggerPersistence: 'single' },
  ]);
  const rules = commitStrokeRulesOf(simultaneous.canonicalInputs);
  assert.equal(rules.suffixHeads.size, 0);
  assert.equal(rules.prefixOutputs.size, 0);
  assert.deepEqual(keyLists('か。', simultaneous), ['w', 'f']);
  const multiKeyTrigger = fromFaces('multi', '複数', [
    single({ w: 'か', f: '。', d: 'お' }),
    { ...faceFromEntries(['f', 'd'], 'prefix', { w: 'ほ' }), inputRole: 'layer', triggerPersistence: 'single' },
  ]);
  assert.deepEqual(keyLists('。ほ', multiKeyTrigger), ['f', 'd+f', 'w']);
  assert.equal(commitStrokeRulesOf(multiKeyTrigger.canonicalInputs).prefixOutputs.size, 0);
});

test('確定の打鍵は右親指（thumb-r）の1打で、出力もトリガーも持たず、Bの入力単位に属する', () => {
  const trace = typed('か。', postfix());
  const [a, commit, b] = trace.strokes as [Stroke, Stroke, Stroke];
  assert.deepEqual(
    commit.presses.map((press) => [press.finger, press.keys.map((key) => key.id)]),
    [['RT', ['thumb-r']]],
  );
  assert.deepEqual(
    commit.participations.map((participation) => participation.roles),
    [[]],
  );
  assert.deepEqual(commit.triggerKeys, []);
  assert.equal(commit.inputIndex, b.inputIndex);
  assert.notEqual(commit.inputIndex, a.inputIndex);
  assert.equal(commit.selectionIndex, b.selectionIndex);
  assert.equal(commit.char, '。');
  assert.equal(commit.inputChar, '。');
  assert.equal(commit.kanaStart, b.kanaStart);
  assert.equal(commit.kanaEnd, b.kanaEnd);
  assert.equal(commit.aggregationGroupId, SINGLE_LAYER_ID);
  assert.equal(trace.inputChars, 2);
});

test('確定の打鍵は打鍵数・押下数・単打の層に数え、コンボには入らない', () => {
  const trace = typed('か。', postfix());
  const metrics = computeMetrics(trace, geometry);
  assert.equal(metrics.actions, 3);
  assert.equal(metrics.presses, 3);
  assert.equal(metrics.comboPresses, 0);
  assert.equal(metrics.combos.hits, 0);
  const single = metrics.layers.find((layer) => layer.id === SINGLE_LAYER_ID)!;
  assert.equal(single.presses, 3);
  assert.equal(single.keyCounts.get('thumb-r'), 1);
  assert.equal(single.triggerKeyCounts.get('thumb-r') ?? 0, 0);
});

test('確定が入ったBは、単打面率・単打率の分子に入らない。1キー率の分子には確定の打鍵が入る', () => {
  const metrics = computeMetrics(typed('か。', postfix()), geometry);
  // 入力は2文字で、直接入力に数えられるのは確定の打鍵の無い「か」だけ
  assert.equal(metrics.singleTapLayerRate, 50);
  assert.equal(metrics.singleTapRate, (1 / 3) * 100);
  assert.equal(metrics.singleKeyRate, 100);
  const plain = computeMetrics(typed('き。', postfix()), geometry);
  assert.equal(plain.singleTapLayerRate, 100);
  assert.equal(plain.singleTapRate, 100);
});

test('押し方の内訳では、確定の打鍵は役なしに数え、前の文字はAの文字になる', () => {
  const details = computeKeyDetails(typed('か。', postfix()), geometry);
  const thumb = details.merged.get('thumb-r')!;
  assert.equal(thumb.presses, 1);
  assert.equal(thumb.roles.get('none'), 1);
  assert.equal(thumb.previousChars.get('か'), 1);
});

test('Bigramの組の種類数は、確定の打鍵を1打にも、Bのトリガーのキーにも数えない', () => {
  // 確定の打鍵が入る「か。」と、打てない文字を挟んで入らない「か。」は、同じ組として数える
  const trace = typed('か。か漢。', postfix());
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.commit === true),
    [false, true, false, false, false],
  );
  assert.deepEqual(countBigramCombinations(trace), { physical: 2, withTriggers: 2 });
});

test('構造解析では、既定で確定の打鍵がAnalysis Chainの境界になる', () => {
  // 右手の `h` と `o` の間に右親指の確定の打鍵が入る
  const layout = fromFaces('chain', '連鎖', [single({ h: 'か', o: '。' }), suffix2('o', { h: 'ほ' })]);
  const { strokes } = typed('か。', layout);
  assert.deepEqual(
    strokes.map((stroke) => stroke.commit === true),
    [false, true, false],
  );
  const covers = (chains: readonly { startStrokeIndex: number; endStrokeIndex: number }[]) =>
    chains.some((chain) => chain.startStrokeIndex === 0 && chain.endStrokeIndex === 3);
  assert.equal(covers(analyzeChains(strokes).chains), false);
  assert.equal(covers(analyzeChains(strokes, { ...DEFAULT_CHAIN_INTERPRETATION, breakOnThumbOnly: false }).chains), true);
});

test('構造解析では、左手のChainは確定の打鍵で途切れる', () => {
  const { strokes } = typed('か。', postfix());
  assert.deepEqual(
    strokes.map((stroke) => keysOf(stroke).join('+')),
    ['w', 'thumb-r', 'f'],
  );
  const spans = (policy = DEFAULT_CHAIN_INTERPRETATION) => analyzeChains(strokes, policy).chains.filter((chain) => chain.hand === 'left');
  assert.ok(spans().every((chain) => chain.endStrokeIndex - chain.startStrokeIndex === 1));
  assert.ok(spans({ ...DEFAULT_CHAIN_INTERPRETATION, breakOnThumbOnly: false }).every((chain) => chain.endStrokeIndex - chain.startStrokeIndex === 1));
});

test('再生の時間では、Aから確定へはかなの境目、確定からBへはかなの中になる', () => {
  const { strokes } = typed('か。', postfix());
  assert.deepEqual(
    strokes.map((_, index) => strokeOverheadSide(strokes, index)),
    ['boundary', 'boundary', 'within'],
  );
});

test('再生の表示では、確定の打鍵を「確定」と出し、配列図の刻印は変えない', () => {
  const layout = postfix();
  const [, commit, b] = typed('か。', layout).strokes as [Stroke, Stroke, Stroke];
  assert.equal(playbackStrokeDisplay(layout, commit).character, '確定');
  assert.equal(playbackStrokeDisplay(layout, commit).keyLabels.size, 0);
  assert.notEqual(playbackStrokeDisplay(layout, b).character, '確定');
});

test('保持できる前置トリガーでも、確定の打鍵が入る継ぎ目で保持が切れる', () => {
  const layout = fromFaces('hold', '保持', [single({ f: '、', d: 'ば', k: 'か' }), prefix2('f', { d: 'ゅ', k: 'ょ' }, 'hold-capable')]);
  const trace = typed('ゅょ、ば', layout, { triggerRealizationPolicy: { useHold: true } });
  assert.deepEqual(
    trace.strokes.map((stroke) => keysOf(stroke).join('+')),
    ['f', 'd', 'k', 'f', 'thumb-r', 'd'],
  );
  const commitAt = trace.strokes.findIndex((stroke) => stroke.commit === true);
  assert.ok(commitAt > 0);
  const commit = trace.strokes[commitAt]!;
  assert.deepEqual(
    commit.participations.flatMap((participation) => participation.roles),
    [],
  );
  const next = trace.strokes[commitAt + 1]!;
  assert.deepEqual(keysOf(next), ['d']);
  assert.ok(next.participations.every((participation) => !participation.roles.includes('held-trigger')));
});

test('前置の側: Aが2打以上で、最後の打鍵が前置トリガーと同じキーでも、確定が入らない', () => {
  const layout = fromFaces('u9-shape', 'U9形', [
    single({ d: '、', k: '。', f: 'い', a: 'あ' }),
    prefix2('d', { f: 'ゆ' }),
    prefix2('k', { d: 'ぞ', a: 'ざ' }),
  ]);
  assert.deepEqual(keyLists('ぞい', layout), ['k', 'd', 'f']);
  assert.deepEqual(keyLists('、い', layout), ['d', 'thumb-r', 'f']);
});
