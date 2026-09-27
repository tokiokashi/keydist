import assert from 'node:assert/strict';
import test from 'node:test';
import * as v from 'valibot';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { defineSetAnalyzer, defineSingleAnalyzer, type SetAnalyzerDefinition, type SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import { defineOption, defineOptions } from '#analyzers/options.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from './settings-items.ts';
import { resolveEngineInput, type ResolvedInput, type ResolvedInputResult } from './resolved-input.ts';
import type { EngineSetMemberInput } from './request.ts';
import { createEngineCache } from './cache.ts';

// `SingleAnalyzerDefinition`はブランド付きの型で、`defineSingleAnalyzer`経由でしか作れない
// （#544レビュー対応A）。ここでも実物のAnalyzerと同じ作法（`defineOptions`宣言 +
// `defineSingleAnalyzer`）でフィクスチャを組み立てる。
const fixtureOptions = defineOptions({
  scale: defineOption<number>({ schema: v.number(), default: 1, affects: 'extract' }),
  // highlightColorは見た目だけなので抽出キーに含めない。
  highlightColor: defineOption<string>({ schema: v.string(), default: 'red', affects: 'view' }),
});

type FixtureOptions = typeof fixtureOptions.defaultOptions;

let fixtureCalls = 0;

/** `getExtraction`のテスト専用フィクスチャ。呼び出し回数を数えて共有・再計算を検証する。 */
function createFixtureDefinition(): SingleAnalyzerDefinition<FixtureOptions, number> {
  return defineSingleAnalyzer({
    id: 'fixture-analyzer',
    options: fixtureOptions,
    extract(context) {
      fixtureCalls += 1;
      return context.metrics.totalUnits * context.options.scale;
    },
    // `optionsDiscipline`は`defineSingleAnalyzer`が必須で要求する（#544レビュー対応B）。
    optionsDiscipline: {
      sample: fixtureOptions.defaultOptions,
      alternates: { scale: 2, highlightColor: 'blue' },
      extractForTest: (options) => 100 * options.scale,
    },
  });
}

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolveResult(
  setup: Setup,
  overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES,
  text = 'hello world',
): ResolvedInputResult {
  return resolveEngineInput({
    setup,
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides,
    text,
    language: 'en',
  });
}

function resolve(
  setup: Setup,
  overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES,
  text = 'hello world',
): ResolvedInput {
  const result = resolveResult(setup, overrides, text);
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  return result.input;
}

// ---------------------------------------------------------------------------
// getSetExtraction用フィクスチャ（#544 Phase 3）
// ---------------------------------------------------------------------------

const setFixtureOptions = defineOptions({
  scale: defineOption<number>({ schema: v.number(), default: 1, affects: 'extract' }),
  highlightColor: defineOption<string>({ schema: v.string(), default: 'red', affects: 'view' }),
});

type SetFixtureOptions = typeof setFixtureOptions.defaultOptions;
type SetFixtureExtracted = { readonly setupIds: readonly string[]; readonly failureSetupIds: readonly string[]; readonly total: number };

let setFixtureCalls = 0;

function createSetFixtureDefinition(): SetAnalyzerDefinition<SetFixtureOptions, SetFixtureExtracted> {
  return defineSetAnalyzer({
    id: 'fixture-set-analyzer',
    options: setFixtureOptions,
    extract(context) {
      setFixtureCalls += 1;
      return {
        setupIds: context.members.map((member) => member.setupId),
        failureSetupIds: context.failures.map((failure) => failure.setupId),
        total: context.members.reduce((sum, member) => sum + member.metrics.totalUnits, 0) * context.options.scale,
      };
    },
    optionsDiscipline: {
      sample: setFixtureOptions.defaultOptions,
      alternates: { scale: 2, highlightColor: 'blue' },
      extractForTest: (options) => ({ setupIds: [], failureSetupIds: [], total: 100 * options.scale }),
    },
  });
}

test('中身が同じSetup2つは計算を共有する（idが違っても同じTrace/解釈を再利用する）', () => {
  const cache = createEngineCache();
  const setupA: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const setupB: Setup = { id: 'setup-b', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 1 };

  const traceA = cache.getTrace(resolve(setupA));
  const traceB = cache.getTrace(resolve(setupB));
  assert.equal(traceA, traceB, 'idや色が違うだけの中身が同じSetupはTraceオブジェクトを共有する');
  assert.equal(cache.size.trace, 1);

  const interpretationA = cache.getInterpretation(resolve(setupA));
  const interpretationB = cache.getInterpretation(resolve(setupB));
  assert.equal(interpretationA, interpretationB);
  assert.equal(cache.size.interpretation, 1);
});

test('解釈だけが違えばTraceは再利用し、解釈だけ計算し直す', () => {
  const cache = createEngineCache();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };

  const baseInput = resolve(setup);
  const baseTrace = cache.getTrace(baseInput);
  const baseInterpretation = cache.getInterpretation(baseInput);

  const write = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'chainInterpretation', {
    ...baseInput.chainInterpretation,
    breakOnSameFinger: !baseInput.chainInterpretation.breakOnSameFinger,
  });
  assert.ok(write.ok);
  if (!write.ok) return;
  const changedInput = resolve(setup, write.overrides);

  const changedTrace = cache.getTrace(changedInput);
  const changedInterpretation = cache.getInterpretation(changedInput);

  assert.equal(changedTrace, baseTrace, 'chain解釈の変更はTraceに影響しないので同じTraceを再利用する');
  assert.notEqual(changedInterpretation, baseInterpretation, '解釈の値が違うので解釈は計算し直す');
  assert.equal(cache.size.trace, 1);
  assert.equal(cache.size.interpretation, 2);
});

test('中身が違えば別のキャッシュエントリになる（テキストの違い）', () => {
  const cache = createEngineCache();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };

  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'hello'));
  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'world'));
  assert.equal(cache.size.trace, 2);
});

test('上限を超えると最も長く参照していないTraceを1件だけ捨てる（LRU）', () => {
  const cache = createEngineCache({ maxTraceEntries: 2 });
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };

  const first = cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-1'));
  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-2'));
  // firstに触れて「最近使った」扱いにする。
  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-1'));
  cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-3'));

  assert.equal(cache.size.trace, 2);
  const firstAgain = cache.getTrace(resolve(setup, EMPTY_SETTINGS_OVERRIDES, 'text-1'));
  assert.equal(firstAgain, first, 'text-1は直前に触れていたので追い出されていない');
});

test('clear()は永続化していないメモリキャッシュを空にする', () => {
  const cache = createEngineCache();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  cache.getInterpretation(resolve(setup));
  assert.ok(cache.size.trace > 0);
  cache.clear();
  assert.deepEqual(cache.size, { trace: 0, interpretation: 0, extraction: 0 });
});

test('getExtraction: 同じ抽出キーの2インスタンスはextractを1回しか呼ばない', () => {
  fixtureCalls = 0;
  const cache = createEngineCache();
  const definition = createFixtureDefinition();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const input = resolve(setup);

  const a = cache.getExtraction(input, definition, { scale: 1, highlightColor: 'red' });
  const b = cache.getExtraction(input, definition, { scale: 1, highlightColor: 'red' });
  assert.equal(a, b);
  assert.equal(fixtureCalls, 1);
  assert.equal(cache.size.extraction, 1);
});

test('getExtraction: 見た目だけのoptions変更（highlightColor）ではextractを走らせない', () => {
  fixtureCalls = 0;
  const cache = createEngineCache();
  const definition = createFixtureDefinition();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const input = resolve(setup);

  cache.getExtraction(input, definition, { scale: 1, highlightColor: 'red' });
  cache.getExtraction(input, definition, { scale: 1, highlightColor: 'blue' });
  assert.equal(fixtureCalls, 1, '抽出に効かないoptionsの変更では再計算しない');
  assert.equal(cache.size.extraction, 1);
});

test('getExtraction: 抽出に効くoptions（scale）が変われば計算し直す', () => {
  fixtureCalls = 0;
  const cache = createEngineCache();
  const definition = createFixtureDefinition();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const input = resolve(setup);

  const a = cache.getExtraction(input, definition, { scale: 1, highlightColor: 'red' });
  const b = cache.getExtraction(input, definition, { scale: 2, highlightColor: 'red' });
  assert.notEqual(a, b);
  assert.equal(fixtureCalls, 2);
  assert.equal(cache.size.extraction, 2);
  assert.equal(b.extracted, a.extracted * 2);
});

test('getExtraction: 解釈だけ変えてもTraceは作り直さない', () => {
  const cache = createEngineCache();
  const definition = createFixtureDefinition();
  const setup: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const baseInput = resolve(setup);

  cache.getExtraction(baseInput, definition, { scale: 1, highlightColor: 'red' });
  assert.equal(cache.size.trace, 1);

  const write = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'chainInterpretation', {
    ...baseInput.chainInterpretation,
    breakOnSameFinger: !baseInput.chainInterpretation.breakOnSameFinger,
  });
  assert.ok(write.ok);
  if (!write.ok) return;
  const changedInput = resolve(setup, write.overrides);

  cache.getExtraction(changedInput, definition, { scale: 1, highlightColor: 'red' });
  assert.equal(cache.size.trace, 1, 'chain解釈の変更はTraceに影響しないので再利用する');
  assert.equal(cache.size.extraction, 2, '解釈が違うので抽出キーは別物になり計算し直す');
});

// ---------------------------------------------------------------------------
// getSetExtraction（#544 Phase 3「集合を対象にする最初のAnalyzer」）
// ---------------------------------------------------------------------------

test('getSetExtraction: 各メンバーのTrace・解釈は単一対象と同じキャッシュを共有する', () => {
  const cache = createEngineCache();
  const definition = createSetFixtureDefinition();
  const setupA: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const setupB: Setup = { id: 'setup-b', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 1 };

  // 単一対象側で先にTraceを計算しておく。
  const singleTrace = cache.getTrace(resolve(setupA));
  assert.equal(cache.size.trace, 1);

  const members: readonly EngineSetMemberInput[] = [
    { setupId: setupA.id, resolution: resolveResult(setupA) },
    { setupId: setupB.id, resolution: resolveResult(setupB) },
  ];
  cache.getSetExtraction(members, definition, setFixtureOptions.defaultOptions);

  // setupAとsetupBは中身が同じSetup（layoutId/shapeId/text）なのでTraceは1件のまま
  // （集合対象の計算が単一対象と同じキャッシュへ乗っていることの確認）。
  assert.equal(cache.size.trace, 1);
  const traceFromSet = cache.getTrace(resolve(setupA));
  assert.equal(traceFromSet, singleTrace);
});

test('getSetExtraction: 同じ集合（順序も同じ）への2回目の呼び出しはextractを1回しか呼ばない', () => {
  setFixtureCalls = 0;
  const cache = createEngineCache();
  const definition = createSetFixtureDefinition();
  const setupA: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const setupB: Setup = { id: 'setup-b', layoutId: 'dvorak', shapeId: 'row-staggered', colorIndex: 1 };
  const members: readonly EngineSetMemberInput[] = [
    { setupId: setupA.id, resolution: resolveResult(setupA) },
    { setupId: setupB.id, resolution: resolveResult(setupB) },
  ];

  const a = cache.getSetExtraction(members, definition, setFixtureOptions.defaultOptions);
  const b = cache.getSetExtraction(members, definition, setFixtureOptions.defaultOptions);
  assert.equal(a, b);
  assert.equal(setFixtureCalls, 1);
  assert.deepEqual(a.extracted.setupIds, [setupA.id, setupB.id]);
});

test('getSetExtraction: 同じメンバーでも並び順が変わればキャッシュは当たらない（順序込みのキー）', () => {
  setFixtureCalls = 0;
  const cache = createEngineCache();
  const definition = createSetFixtureDefinition();
  const setupA: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const setupB: Setup = { id: 'setup-b', layoutId: 'dvorak', shapeId: 'row-staggered', colorIndex: 1 };

  const forward: readonly EngineSetMemberInput[] = [
    { setupId: setupA.id, resolution: resolveResult(setupA) },
    { setupId: setupB.id, resolution: resolveResult(setupB) },
  ];
  const reversed: readonly EngineSetMemberInput[] = [forward[1]!, forward[0]!];

  const a = cache.getSetExtraction(forward, definition, setFixtureOptions.defaultOptions);
  const b = cache.getSetExtraction(reversed, definition, setFixtureOptions.defaultOptions);
  assert.notEqual(a, b, '並び順が違うので別の抽出結果になる');
  assert.equal(setFixtureCalls, 2);
  assert.deepEqual(a.extracted.setupIds, [setupA.id, setupB.id]);
  assert.deepEqual(b.extracted.setupIds, [setupB.id, setupA.id]);
});

test('getSetExtraction: 一部メンバーの解決失敗は全体を失敗にせず、failuresへ回す', () => {
  const cache = createEngineCache();
  const definition = createSetFixtureDefinition();
  const setupOk: Setup = { id: 'setup-ok', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const setupMissing: Setup = { id: 'setup-missing', layoutId: 'no-such-layout', shapeId: 'row-staggered', colorIndex: 1 };

  const members: readonly EngineSetMemberInput[] = [
    { setupId: setupOk.id, resolution: resolveResult(setupOk) },
    { setupId: setupMissing.id, resolution: resolveResult(setupMissing) },
  ];
  const missingResolution = members[1]!.resolution;
  assert.equal(missingResolution.ok, false, 'テストの前提: 存在しない配列idは解決に失敗する');

  const result = cache.getSetExtraction(members, definition, setFixtureOptions.defaultOptions);
  assert.deepEqual(result.extracted.setupIds, [setupOk.id], '解決できたメンバーだけがmembersに残る');
  assert.deepEqual(result.extracted.failureSetupIds, [setupMissing.id], '解決失敗したメンバーはfailuresへ回る');
});

test('getSetExtraction: 抽出に効くoptions（scale）が変われば計算し直す', () => {
  setFixtureCalls = 0;
  const cache = createEngineCache();
  const definition = createSetFixtureDefinition();
  const setupA: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const members: readonly EngineSetMemberInput[] = [{ setupId: setupA.id, resolution: resolveResult(setupA) }];

  const a = cache.getSetExtraction(members, definition, { scale: 1, highlightColor: 'red' });
  const b = cache.getSetExtraction(members, definition, { scale: 2, highlightColor: 'red' });
  assert.equal(setFixtureCalls, 2);
  assert.equal(b.extracted.total, a.extracted.total * 2);
});

test('getSetExtraction: 見た目だけのoptions変更ではextractを走らせない', () => {
  setFixtureCalls = 0;
  const cache = createEngineCache();
  const definition = createSetFixtureDefinition();
  const setupA: Setup = { id: 'setup-a', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  const members: readonly EngineSetMemberInput[] = [{ setupId: setupA.id, resolution: resolveResult(setupA) }];

  cache.getSetExtraction(members, definition, { scale: 1, highlightColor: 'red' });
  cache.getSetExtraction(members, definition, { scale: 1, highlightColor: 'blue' });
  assert.equal(setFixtureCalls, 1);
});
