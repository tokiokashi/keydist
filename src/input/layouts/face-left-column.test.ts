import assert from 'node:assert/strict';
import test from 'node:test';
import { heatmapDrawnKeys } from '#analyzers/heatmap-keys.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { assignmentWithHomeKeys, buildGeometry, DEFAULT_FINGER_ASSIGNMENT, LEFT_COLUMN_KEYS, THUMB_KEY } from '../shapes/geometry.ts';
import { blankFaceLayoutDraft, checkFaceLayout, type FaceLayoutDraft } from './face-layout-edit.ts';
import { buildFaceLayout, readFaceBody, type UserFace, type UserFaceBody } from './kana-face-layout.ts';
import { kanaLayoutFileText, parseKanaLayoutFile, type KanaLayoutContent } from './kana-face-layout-file.ts';
import { physicalKeysUsedByLayout } from './physical-keys.ts';

const NO_COMPOSITION = { dakuten: false, handakuten: false };

const body = (faces: UserFace[]): UserFaceBody => ({ faces, composition: NO_COMPOSITION });

/** 3つのキーへ出力を置いた単打の面だけの配列 */
const OUTPUT_BODY = body([{ trigger: [], inputRole: 'layer', outputs: { a: 'い', backquote: 'あ', tab: 'う', 'caps-lock': 'え' } }]);

/** caps-lockをtriggerにした面を持つ配列 */
const TRIGGER_BODY = body([
  { trigger: [], inputRole: 'layer', outputs: { a: 'い', j: 'お' } },
  { trigger: ['caps-lock'], mode: 'simultaneous', triggerPersistence: 'single', inputRole: 'layer', outputs: { j: 'う' } },
]);

const geometry = buildGeometry('row-staggered');

function measure(faceBody: UserFaceBody, text: string, shape = geometry) {
  const layout = buildFaceLayout('t', 't', faceBody);
  const trace = generateTrace(text, layout, shape, DEFAULT_TRACE_POLICY);
  assert.deepEqual(trace.errors, []);
  assert.equal(trace.skipped, 0);
  return computeMetrics(trace, shape);
}

const distance = (from: string, to: string) => {
  const a = geometry.keys.get(from)!;
  const b = geometry.keys.get(to)!;
  return Math.hypot(a.x - b.x, a.y - b.y);
};

test('出力に使った3つのキーは、配列が使うキーに入り、押下数と距離が計算できる', () => {
  const layout = buildFaceLayout('t', 't', OUTPUT_BODY);
  const used = physicalKeysUsedByLayout(layout);
  for (const key of LEFT_COLUMN_KEYS) assert.ok(used.has(key), `${key}が使うキーに無い`);
  for (const [key, char] of [
    ['backquote', 'あ'],
    ['tab', 'う'],
    ['caps-lock', 'え'],
  ] as const) {
    const metrics = measure(OUTPUT_BODY, char);
    assert.equal(metrics.keyCounts.get(key), 1, `${key}の押下数`);
    assert.equal(metrics.perFingerPresses.LP, 1);
    // 指の割り当ては左の小指。ホームキーaからの距離になる
    assert.ok(Math.abs(metrics.perFinger.LP - distance('a', key)) < 1e-9, `${key}の距離 ${metrics.perFinger.LP}`);
    assert.ok(metrics.perFinger.LP > 0);
  }
});

test('triggerに使った3つのキーは、面の読み込みを通り、配列が使うキーに入り、押下数が数えられる', () => {
  assert.deepEqual(readFaceBody({ ...TRIGGER_BODY }).problems, []);
  const layout = buildFaceLayout('t', 't', TRIGGER_BODY);
  assert.ok(physicalKeysUsedByLayout(layout).has('caps-lock'));
  const metrics = measure(TRIGGER_BODY, 'う');
  assert.equal(metrics.keyCounts.get('caps-lock'), 1);
  assert.equal(metrics.keyCounts.get('j'), 1);
  assert.equal(metrics.perFingerPresses.LP, 1);
  assert.equal(metrics.perFingerPresses.RI, 1);
});

test('ホームキーに使った3つのキーは、その指が担当する時にホーム位置になり、距離が変わる', () => {
  const home = buildGeometry('row-staggered', assignmentWithHomeKeys(DEFAULT_FINGER_ASSIGNMENT, { LP: 'caps-lock' }));
  const atHome = measure(OUTPUT_BODY, 'え', home);
  assert.equal(atHome.perFinger.LP, 0);
  const defaultHome = measure(OUTPUT_BODY, 'え');
  assert.ok(defaultHome.perFinger.LP > 0);
  // 別の指のホームキーには採用されない（その指が担当しないキー）
  const ignored = assignmentWithHomeKeys(DEFAULT_FINGER_ASSIGNMENT, { RI: 'caps-lock' });
  assert.equal(ignored.homeKey.RI, DEFAULT_FINGER_ASSIGNMENT.homeKey.RI);
});

test('ヒートマップは、3つのキーを使う配列では3つのキーを使うキーとして描く', () => {
  const layout = buildFaceLayout('t', 't', OUTPUT_BODY);
  const unused = new Map(heatmapDrawnKeys(layout, geometry).map((item) => [item.key.id, item.unused]));
  for (const key of LEFT_COLUMN_KEYS) assert.equal(unused.get(key), false, `${key}は使うキー`);
  const trigger = new Map(heatmapDrawnKeys(buildFaceLayout('t', 't', TRIGGER_BODY), geometry).map((item) => [item.key.id, item.unused]));
  assert.equal(trigger.get('caps-lock'), false);
  assert.equal(trigger.get('tab'), true);
});

const FILE_CONTENT: KanaLayoutContent = {
  name: '左端の列',
  faces: [...OUTPUT_BODY.faces, ...TRIGGER_BODY.faces.slice(1).map((face) => ({ ...face, trigger: ['tab'] }))],
  composition: NO_COMPOSITION,
  homeKeys: { LP: 'caps-lock' },
};

test('定義ファイルは、3つのキーの出力・trigger・ホームキーを書き出して読み込んでも変わらない', () => {
  const text = kanaLayoutFileText(FILE_CONTENT);
  const read = parseKanaLayoutFile(text);
  assert.ok(read.ok, read.ok ? '' : read.problems.map((problem) => problem.message).join('\n'));
  if (!read.ok) return;
  assert.deepEqual(read.layout, FILE_CONTENT);
  assert.equal(kanaLayoutFileText(read.layout), text);
});

test('編集画面の検査は、3つのキーの出力・trigger・ホームキーを通し、保存する中身に残す', () => {
  const draft: FaceLayoutDraft = { ...blankFaceLayoutDraft(), name: '左端の列', faces: structuredClone(FILE_CONTENT.faces), homeKeys: { LP: 'tab' } };
  const check = checkFaceLayout(draft);
  assert.deepEqual(check.problems, []);
  assert.deepEqual(check.content?.homeKeys, { LP: 'tab' });
  assert.deepEqual(check.content?.faces, FILE_CONTENT.faces);
});

test('3つのキー以外の格子の外のキーは、出力にもホームキーにも書けない', () => {
  for (const key of [THUMB_KEY.LT, 'shift-l', 'escape']) {
    const { problems } = readFaceBody({ faces: [{ ...OUTPUT_BODY.faces[0], outputs: { a: 'あ', [key]: 'い' } }], composition: NO_COMPOSITION });
    assert.equal(problems.length, 1, key);
    assert.equal(problems[0]!.path, `faces[0].outputs.${key}`);
  }
  const draft = { ...blankFaceLayoutDraft(), name: 'x', faces: structuredClone(OUTPUT_BODY.faces), homeKeys: { LP: 'escape' } };
  assert.deepEqual(
    checkFaceLayout(draft).problems.map((problem) => problem.path),
    ['homeKeys.LP'],
  );
});

test('切り替えのキー自身の位置に同じ面の出力があれば、3つのキーでも誤りになる', () => {
  const { problems } = readFaceBody({
    faces: [{ ...TRIGGER_BODY.faces[1], outputs: { j: 'う', 'caps-lock': 'え' } }],
    composition: NO_COMPOSITION,
  });
  assert.equal(problems[0]?.path, 'faces[0].outputs.caps-lock');
});
