import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA } from '#input/layouts/index.ts';
import { builtInLayoutKind } from '#input/layouts/kind.ts';
import { deriveInputMethod, resolveSetupForText } from './input-method.ts';
import type { Setup } from './types.ts';
import type { SetupCatalog } from './resolve.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { PhysicalShape } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';

test('deriveInputMethod: alpha配列は英語で直接入力、日本語でローマ字', () => {
  assert.deepEqual(deriveInputMethod('en', 'alpha'), { ok: true, inputMethod: 'direct' });
  assert.deepEqual(deriveInputMethod('ja', 'alpha'), { ok: true, inputMethod: 'romaji' });
});

test('deriveInputMethod: かな配列は日本語でかな直接、英語では使えない', () => {
  assert.deepEqual(deriveInputMethod('ja', 'kana'), { ok: true, inputMethod: 'kana-direct' });
  assert.deepEqual(deriveInputMethod('en', 'kana'), { ok: false, reason: 'text-language-mismatch' });
});

// テキストに合わないSetup（英語テキストに対するかな配列）は
// 「このテキストには使えない」と表示する、の検査。

test('英語一覧（LAYOUTS）は全てalpha扱いで、英語テキストに対して必ず direct が出る', () => {
  for (const layout of LAYOUTS) {
    const kind = builtInLayoutKind(layout.id);
    assert.equal(kind, 'alpha', `layoutId=${layout.id}`);
    assert.deepEqual(deriveInputMethod('en', kind), { ok: true, inputMethod: 'direct' });
  }
});

test('日本語一覧（LAYOUTS_JA）は種類に応じてromaji/kana-directのどちらかが必ず出る', () => {
  for (const layout of LAYOUTS_JA) {
    const kind = builtInLayoutKind(layout.id);
    const derivation = deriveInputMethod('ja', kind);
    assert.equal(derivation.ok, true, `layoutId=${layout.id}`);
    if (derivation.ok) {
      assert.equal(
        derivation.inputMethod,
        kind === 'kana' ? 'kana-direct' : 'romaji',
        `layoutId=${layout.id}`,
      );
    }
  }
});

// 現状のAnalyzer（fixture）が記録した romajiRuleId の有無と、導出した打ち方が一致するかを
// 全組込み配列 × 両言語（fixtureに記録されている組み合わせ）で検査する。
// romajiRuleId が null なら 'romaji' 以外（direct / kana-direct）、非null なら 'romaji'。

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const FIXTURE_PATH = join(ROOT, 'test', 'fixtures', 'analyzer-regression.json');

interface FixtureCase {
  language: 'en' | 'ja';
  layoutId: string;
  conditions: { romajiRuleId: string | null };
}

interface Fixture {
  cases: FixtureCase[];
}

test('全組込み配列×両言語で、導出した打ち方がfixtureに記録された現状のAnalyzerと一致する', () => {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Fixture;
  const seen = new Set<string>();
  let checked = 0;
  for (const c of fixture.cases) {
    const key = `${c.language}:${c.layoutId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const kind = builtInLayoutKind(c.layoutId);
    const derivation = deriveInputMethod(c.language, kind);
    assert.equal(derivation.ok, true, `${key}: 導出できないのはfixtureと矛盾`);
    if (!derivation.ok) continue;

    const expectRomaji = c.conditions.romajiRuleId !== null;
    assert.equal(
      derivation.inputMethod === 'romaji',
      expectRomaji,
      `${key}: fixtureのromajiRuleId=${c.conditions.romajiRuleId} と導出結果 ${derivation.inputMethod} が矛盾`,
    );
    checked += 1;
  }
  // fixtureが空・読み込み失敗で0件のまま通ってしまうことを防ぐ
  assert.ok(checked >= 22, `検査した組み合わせが少なすぎる: ${checked}`);
});

// resolveSetupForText: Setupの解決へ接続した結果の検査。

const SHAPE: PhysicalShape = { id: 'shape-1' } as unknown as PhysicalShape;

function catalogWith(layoutId: string): SetupCatalog {
  const layout = { id: layoutId } as unknown as Layout;
  return {
    layouts: new Map([[layoutId, layout]]),
    shapes: new Map([['shape-1', SHAPE]]),
  };
}

const setupFor = (layoutId: string): Setup => ({
  id: 'setup-1', number: 1, layoutId, shapeId: 'shape-1',
});

const NO_USER_LAYOUTS: ReadonlyMap<string, UserLayout> = new Map();

test('resolveSetupForText: 参照が壊れていればreference扱いで理由を返す', () => {
  const setup = setupFor('does-not-exist');
  const result = resolveSetupForText(setup, catalogWith('qwerty'), NO_USER_LAYOUTS, 'en');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.kind, 'reference');
});

test('resolveSetupForText: かな配列 + 英語テキストはincompatible-textを返す', () => {
  const setup = setupFor('naginata-v18');
  const result = resolveSetupForText(setup, catalogWith('naginata-v18'), NO_USER_LAYOUTS, 'en');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.kind, 'incompatible-text');
    if (result.kind === 'incompatible-text') assert.equal(result.language, 'en');
  }
});

test('resolveSetupForText: alpha配列 + 日本語テキストはromajiとして解決できる', () => {
  const setup = setupFor('qwerty');
  const result = resolveSetupForText(setup, catalogWith('qwerty'), NO_USER_LAYOUTS, 'ja');
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.context.inputMethod, 'romaji');
});

test('resolveSetupForText: 自作かな配列（direct:true）は自作配列一覧から種類を引く', () => {
  const userLayouts = new Map<string, UserLayout>([
    ['my-kana', { id: 'my-kana', name: 'かな配列', rows: ['', '', '', ''], romaji: 'kunrei', direct: true }],
  ]);
  const setup = setupFor('my-kana');
  const okJa = resolveSetupForText(setup, catalogWith('my-kana'), userLayouts, 'ja');
  assert.equal(okJa.ok, true);
  if (okJa.ok) assert.equal(okJa.context.inputMethod, 'kana-direct');

  const ngEn = resolveSetupForText(setup, catalogWith('my-kana'), userLayouts, 'en');
  assert.equal(ngEn.ok, false);
  if (!ngEn.ok) assert.equal(ngEn.kind, 'incompatible-text');
});
