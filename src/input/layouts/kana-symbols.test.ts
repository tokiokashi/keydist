import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildGeometry, keyId, resolveKeyId } from '#input/shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { prepareEvaluationText } from '#input/text/evaluation-text.ts';
import { faceCells } from './face-geometry.ts';
import { LAYOUT_BY_ID } from './index.ts';

interface FixtureFace {
  trigger: string[];
  cells: string[][];
}

const SYMBOL_ONLY = /^[^\p{L}\p{M}\p{N}]+$/u;
const geometry = buildGeometry('row-staggered');

const triggerId = (trigger: readonly string[]) => trigger.map(resolveKeyId).sort().join('+');

/** 出典のスナップショットから起こしたfixtureの、記号だけのセル。面|キー|出力の形で返す。 */
function fixtureSymbols(layoutId: string): Set<string> {
  const fixture = JSON.parse(readFileSync(new URL(`../../../test/fixtures/${layoutId}.json`, import.meta.url), 'utf8')) as { faces: FixtureFace[] };
  const out = new Set<string>();
  for (const face of fixture.faces) {
    for (const [r, row] of face.cells.entries()) {
      for (const [c, value] of row.entries()) {
        if (value !== '' && SYMBOL_ONLY.test(value)) out.add(`${triggerId(face.trigger)}|${keyId(r, c)}|${value}`);
      }
    }
  }
  return out;
}

function layoutSymbols(layoutId: string): Set<string> {
  const layout = LAYOUT_BY_ID.get(layoutId)!;
  const out = new Set<string>();
  for (const face of layout.faces ?? []) {
    for (const [key, value] of faceCells(face)) {
      if (SYMBOL_ONLY.test(value)) out.add(`${triggerId(face.trigger)}|${key}|${value}`);
    }
  }
  return out;
}

for (const layoutId of ['asuka', 'shin-koume', 'shingeta', 'naginata-v18', 'tsukimisou-extract']) {
  test(`${layoutId}: 配列の定義の記号が、出典のスナップショットの記号と面・キー・出力で一致する`, () => {
    assert.deepEqual([...layoutSymbols(layoutId)].sort(), [...fixtureSymbols(layoutId)].sort());
  });
}

/** 記号の範囲を広げた日本語のテキストを、アプリと同じ前処理を通して打つ時のskipped。 */
function skippedWithWideSymbols(layoutId: string, text: string): number {
  const layout = LAYOUT_BY_ID.get(layoutId)!;
  const prepared = prepareEvaluationText(text, {
    language: 'ja',
    keepSymbols: true,
    layoutHasChar: (char) => layout.canonicalInputs.has(char),
    layoutHasHeading: (heading) => layout.canonicalInputs.has(heading),
    maxKatakanaHeadingLength: 0,
  });
  return generateTrace(prepared, layout, geometry, DEFAULT_TRACE_POLICY).skipped;
}

test('新下駄は、単打面の「と、D面の」の両方を打てる', () => {
  assert.equal(skippedWithWideSymbols('shingeta', '「」'), 0);
});

test('薙刀式v18は、編集モード1の記号を打てる', () => {
  for (const symbol of ['「', '」', '『', '』', '(', ')', '？', '！', '・', '／', '……', '――']) {
    assert.equal(skippedWithWideSymbols('naginata-v18', symbol), 0, symbol);
  }
});

test('薙刀式v18は、編集モード2の記号を打てる', () => {
  for (const symbol of ['《', '》', '【', '】', '｜', '○']) {
    assert.equal(skippedWithWideSymbols('naginata-v18', symbol), 0, symbol);
  }
});

test('薙刀式v18は、センターシフト面の記号のうちANSIの列に当たるものを打てる', () => {
  for (const symbol of ['!', '"', '#', '$', '%', '&', "'", '(', ')', '=', '~', '`', '{', '*']) {
    assert.equal(skippedWithWideSymbols('naginata-v18', symbol), 0, symbol);
  }
});

test('薙刀式v18は、JIS専用の列に当たるセンターシフト面の記号を打てない', () => {
  for (const symbol of ['}', '_']) {
    assert.equal(skippedWithWideSymbols('naginata-v18', symbol), 1, symbol);
  }
});

test('全角で定義した記号を、半角の記号のテキストでも打てる', () => {
  assert.equal(skippedWithWideSymbols('asuka', '!?()'), 0);
  assert.equal(skippedWithWideSymbols('shin-koume', '!?()'), 0);
  assert.equal(skippedWithWideSymbols('asuka', '！？（）'), 0);
});

test('半角で定義した記号を、全角形の記号のテキストでも打てる', () => {
  assert.equal(skippedWithWideSymbols('naginata-v18', '（）！＃＄％＆'), 0);
  assert.equal(skippedWithWideSymbols('tsukimisou-extract', '！？（）'), 0);
  assert.equal(skippedWithWideSymbols('tsukimisou-extract', '!?()「」・'), 0);
});

test('数字と、IMEの変換表で出る記号が決まるキーは、足していない', () => {
  assert.equal(skippedWithWideSymbols('asuka', '１'), 1);
  assert.equal(skippedWithWideSymbols('asuka', '－'), 1);
  assert.equal(skippedWithWideSymbols('shin-koume', '＾'), 1);
});
