import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateTrace, DEFAULT_TRACE_POLICY } from '#trace/generate.ts';
import { buildGeometry, THUMB_KEY } from '../shapes/geometry.ts';
import { loadedKanjiDirectLayout } from '../../../test/kanji-direct-tables.ts';
import { isKanjiDirectLayout } from './kanji-direct.ts';
import { pendingKanjiDirectLayouts } from './kanji-direct-tables.ts';
import { uncoveredKana } from './kana-coverage.ts';
import { physicalKeysUsedByLayout } from './physical-keys.ts';
import { SECCA_DECLARATION } from './secca.ts';

const SECCA = loadedKanjiDirectLayout('secca');
const geometry = buildGeometry('row-staggered');

interface Typed {
  readonly char: string;
  readonly keys: string;
  readonly group: string;
  readonly triggers: number;
}

const typed = (text: string, spaceThumb: 'right' | 'left' = 'right'): Typed[] => {
  const { strokes, skipped } = generateTrace(text, SECCA, geometry, { ...DEFAULT_TRACE_POLICY, spaceThumb });
  assert.equal(skipped, 0, text);
  return strokes.map((stroke) => ({
    char: stroke.char,
    keys: stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).join('+'),
    group: stroke.aggregationGroupId,
    triggers: stroke.triggerKeys.length,
  }));
};

test('標準的なかなを全部打てる', () => {
  assert.deepEqual(uncoveredKana(SECCA), []);
});

test('漢字は新しく押すキーごとに1ステップで、押す順序で別の字になり、層のトリガーに数えない', () => {
  assert.deepEqual(
    typed('朝元暴担').map((stroke) => `${stroke.char}:${stroke.keys}`),
    ['朝:f', '朝:d', '朝:j', '元:d', '元:f', '元:j', '暴:f', '暴:d', '暴:j', '暴:k', '担:f', '担:d', '担:k', '担:j'],
  );
  assert.ok(typed('朝元暴担').every((stroke) => stroke.group === 'single' && stroke.triggers === 0));
});

test('熟語は見出しの打鍵で打たれ、空白キーのステップは左親指の設定でも右親指のまま、トリガーに数えない', () => {
  for (const spaceThumb of ['right', 'left'] as const) {
    // 人間は、dとfの後に空白キーを押したままkを打つ
    const strokes = typed('人間', spaceThumb);
    assert.deepEqual(
      strokes.map((stroke) => stroke.keys),
      ['d', 'f', THUMB_KEY.RT, 'k'],
    );
    assert.ok(strokes.every((stroke) => stroke.char === '人間' && stroke.group === 'single' && stroke.triggers === 0));
  }
});

test('かなの同時押しは1ステップで、空白キーを先に押すひらがなの面は空白キーをトリガーに数える', () => {
  // ぎは、jとwを同時に押す。りは、空白キーとeを同時に押す（空白キーが先）
  const strokes = typed('ぎり');
  assert.deepEqual(
    strokes.map((stroke) => stroke.keys),
    ['j+w', `${THUMB_KEY.RT}+e`],
  );
  assert.equal(strokes[0]!.triggers, 1);
  assert.equal(strokes[1]!.group, 'layer:SandS');
  assert.equal(strokes[1]!.triggers, 1);
});

test('表を取得する前の配列の宣言が、表から導いた漢直であることと使う物理キーに一致する', () => {
  const pending = pendingKanjiDirectLayouts().find((layout) => layout.id === 'secca');
  assert.ok(pending !== undefined);
  assert.notEqual(pending, SECCA);
  assert.ok(pending.pendingTable !== undefined);
  assert.equal(pending.name, SECCA.name);
  assert.deepEqual(pending.aliases, SECCA.aliases);
  assert.equal(isKanjiDirectLayout(pending), isKanjiDirectLayout(SECCA));
  assert.deepEqual([...physicalKeysUsedByLayout(pending)].sort(), [...physicalKeysUsedByLayout(SECCA)].sort());
});

test('途中で処理を返しながら作った配列は、一度に作った配列と一致する', () => {
  const table = JSON.parse(readFileSync(new URL('./tables/secca.json', import.meta.url), 'utf8')) as unknown;
  const steps = SECCA_DECLARATION.layoutStepsFromTable!(table);
  let next = steps.next();
  while (!next.done) next = steps.next();
  assert.deepEqual(next.value, SECCA_DECLARATION.layoutFromTable(table));
});
