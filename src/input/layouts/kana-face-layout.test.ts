import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { buildGeometry, JIS_FINGER_ASSIGNMENT, THUMB_KEY } from '../shapes/geometry.ts';
import { faceCells } from './face-geometry.ts';
import { JIS_KANA } from './jis-kana.ts';
import { KANA_COVERAGE_TARGETS, uncoveredKana } from './kana-coverage.ts';
import { buildFaceLayout, duplicateOutputNotices, readFaceBody, type UserFace, type UserFaceBody } from './kana-face-layout.ts';
import { kanaLayoutFileBody, kanaLayoutFileText, parseKanaLayoutFile, type KanaLayoutContent } from './kana-face-layout-file.ts';
import { NICOLA, NICOLA_FACES } from './nicola.ts';
import { SHINGETA, SHINGETA_FACES } from './shingeta.ts';
import type { Face, Layout } from './types.ts';

const geometry = buildGeometry('row-staggered');

/** 組み込みの面（`Face`）を、利用者が書く面の形にする。 */
function userFaceOf(face: Face): UserFace {
  return {
    trigger: [...face.trigger],
    ...(face.trigger.length === 0 ? {} : { mode: face.mode }),
    ...(face.triggerPersistence === undefined ? {} : { triggerPersistence: face.triggerPersistence }),
    inputRole: face.inputRole!,
    ...(face.compositionAggregation === undefined ? {} : { compositionAggregation: face.compositionAggregation }),
    ...(face.triggerOrder === undefined ? {} : { triggerOrder: face.triggerOrder }),
    ...(face.layer === undefined ? {} : { layer: face.layer }),
    ...(face.modifierGroups === undefined ? {} : { modifierGroups: { ...face.modifierGroups } }),
    outputs: Object.fromEntries(faceCells(face)),
  };
}

/** 組み込みのNICOLAと同じ内容を、面の形で書いたもの。 */
const NICOLA_CONTENT: KanaLayoutContent = {
  kind: 'kana',
  name: '面で書いたNICOLA',
  faces: NICOLA_FACES.map(userFaceOf),
  composition: { dakuten: false, handakuten: false },
};

const SAMPLE =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' +
  'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょー、。きょうはいいてんきですね。';

function strokesOf(layout: Layout, text: string) {
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  assert.deepEqual(trace.errors, [], `${text}: 打鍵の列に不備がある`);
  assert.equal(trace.skipped, 0, `${text}: 打てない文字がある`);
  return trace.strokes;
}

const read = (text: string) => {
  const result = parseKanaLayoutFile(text);
  assert.ok(result.ok, result.ok ? '' : result.problems.map((problem) => `${problem.path}: ${problem.message}`).join('\n'));
  if (!result.ok) throw new Error('unreachable');
  return result;
};

const problemsOf = (value: unknown) => {
  const result = parseKanaLayoutFile(typeof value === 'string' ? value : JSON.stringify(value));
  assert.equal(result.ok, false, '誤りがあるのに読めてしまった');
  return result.ok ? [] : result.problems;
};

/** 小さな有効な定義。単打の面と、左親指の面を持つ。 */
const validFile = (): Record<string, unknown> =>
  structuredClone({
    format: 'keydist-kana-layout',
    version: 1,
    name: '小さな配列',
    faces: [
      { trigger: [], inputRole: 'layer', outputs: { a: 'あ', s: 'か', d: 'さ', f: '゛', k: 'は', l: '゜' } },
      {
        trigger: ['thumb-l'],
        mode: 'simultaneous',
        triggerPersistence: 'single',
        inputRole: 'modifier',
        layer: '左親指',
        outputs: { a: 'ぁ', s: 'い' },
      },
    ],
    composition: { dakuten: true, handakuten: true },
  });

test('面の形のNICOLAを書き出して読み込み直すと、組み込みと同じ打鍵列と層の分け方になる', () => {
  const written = kanaLayoutFileText(NICOLA_CONTENT);
  const { layout: reread } = read(written);
  assert.deepEqual(reread, NICOLA_CONTENT);

  const built = buildFaceLayout('user-nicola', reread.name, reread);
  assert.deepEqual(built.layerDefinitions, NICOLA.layerDefinitions);
  const expected = strokesOf(NICOLA, SAMPLE);
  const actual = strokesOf(built, SAMPLE);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
  // 各打鍵の層（aggregationGroupId）まで一致している
  assert.deepEqual(
    actual.map((stroke) => stroke.aggregationGroupId),
    expected.map((stroke) => stroke.aggregationGroupId),
  );
  assert.ok(new Set(actual.map((stroke) => stroke.aggregationGroupId)).size >= 3, '単打と左右の親指の層に分かれる');
});

test('書き出した本体はformatと版を持ち、idを持たない', () => {
  const body = kanaLayoutFileBody(NICOLA_CONTENT);
  assert.equal(body.format, 'keydist-kana-layout');
  assert.equal(body.version, 1);
  assert.equal('id' in body, false);
});

test('triggerのキーは正式名にそろえて読む（spaceは右親指）', () => {
  const file = validFile();
  (file.faces as Record<string, unknown>[])[1]!.trigger = ['space'];
  const { layout } = read(JSON.stringify(file));
  assert.deepEqual(layout.faces[1]!.trigger, [THUMB_KEY.RT]);
});

test('後置の濁点・半濁点: 合成を指定すると濁音・半濁音が元のかなと合成記号の2ステップで打てる', () => {
  const { layout } = read(JSON.stringify(validFile()));
  const built = buildFaceLayout('user-x', layout.name, layout);
  const strokes = strokesOf(built, 'がぱ');
  assert.equal(strokes.length, 4);
  assert.deepEqual(
    strokes.map((stroke) => stroke.char),
    ['が', 'が', 'ぱ', 'ぱ'],
  );
});

test('合成の有無は値として決まり、面に濁点があっても自動では合成しない', () => {
  const file = validFile();
  file.composition = { dakuten: false, handakuten: false };
  const { layout } = read(JSON.stringify(file));
  const built = buildFaceLayout('user-x', layout.name, layout);
  assert.equal(built.canonicalInputs.has('が'), false);
  assert.equal(built.canonicalInputs.has('ぱ'), false);
  assert.equal(built.canonicalInputs.has('゛'), true);
});

test('元のかなが配列に無い合成は作らない', () => {
  const file = validFile();
  (file.faces as { outputs: Record<string, string> }[])[0]!.outputs = { a: 'あ', f: '゛' };
  file.composition = { dakuten: true, handakuten: false };
  const { layout } = read(JSON.stringify(file));
  const built = buildFaceLayout('user-x', layout.name, layout);
  assert.equal(built.canonicalInputs.has('が'), false);
});

test('JISかな配列の濁点・半濁点の表を共有しても、組み込みのJISかな配列の打ち方は変わらない', () => {
  // 表を `kana-composition.ts` へ移した後も、が・ぱが元のかなと合成記号の2ステップで打てる
  const keys = (text: string) => strokesOf(JIS_KANA, text).map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).join('+'));
  assert.deepEqual(keys('が'), ['t', '[']);
  assert.deepEqual(keys('ぱ'), ['f', ']']);
});

test('coverage: 面の形のNICOLAは全かなを打てる', () => {
  const built = buildFaceLayout('user-nicola', 'n', NICOLA_CONTENT);
  assert.deepEqual(uncoveredKana(built), []);
  assert.ok(KANA_COVERAGE_TARGETS.includes('を') && KANA_COVERAGE_TARGETS.includes('ん') && KANA_COVERAGE_TARGETS.includes('ー'));
});

test('coverage: 打てないかなを並べて返し、後置の濁点で合成して打てるかなは打てるものに数える', () => {
  const file = validFile();
  const noCompose = { ...file, composition: { dakuten: false, handakuten: false } };
  const without = buildFaceLayout('a', 'a', read(JSON.stringify(noCompose)).layout);
  const uncoveredWithout = uncoveredKana(without);
  assert.ok(uncoveredWithout.includes('う'), '面に無いかなは打てない');
  assert.ok(!uncoveredWithout.includes('か'), '面にあるかなは打てる');
  assert.ok(uncoveredWithout.includes('が') && uncoveredWithout.includes('ぱ'), '合成しない配列は濁音・半濁音を打てない');

  const withCompose = buildFaceLayout('b', 'b', read(JSON.stringify(file)).layout);
  const uncoveredWith = uncoveredKana(withCompose);
  for (const kana of ['が', 'ざ', 'ば', 'ぱ']) assert.ok(!uncoveredWith.includes(kana), `${kana}は合成で打てる`);
  // 元のかなが配列に無いものは合成できない（きは配列に無いのでぎも打てない）
  assert.ok(uncoveredWith.includes('き'));
  assert.ok(uncoveredWith.includes('ぎ'));
  // 返す順は対象の並び（清音 → 濁音 → 半濁音 → 小書き …）のまま
  const order = uncoveredWith.map((kana) => KANA_COVERAGE_TARGETS.indexOf(kana));
  assert.deepEqual(
    order,
    [...order].sort((left, right) => left - right),
  );
  assert.deepEqual(uncoveredKana(JIS_KANA), []);
});

test('読み込みの誤り: JSONとして読めない', () => {
  const problems = problemsOf('{ "format": ');
  assert.equal(problems.length, 1);
  assert.equal(problems[0]!.path, '');
  assert.match(problems[0]!.message, /^JSONとして読めません/);
});

test('読み込みの誤り: formatと版が違う', () => {
  assert.deepEqual(
    problemsOf({ ...validFile(), format: 'keydist-user-assets' }).map((problem) => problem.path),
    ['format'],
  );
  assert.deepEqual(
    problemsOf([1, 2]).map((problem) => problem.path),
    ['format'],
  );
  const noVersion = validFile();
  delete noVersion.version;
  assert.deepEqual(
    problemsOf(noVersion).map((problem) => problem.path),
    ['version'],
  );
  assert.deepEqual(
    problemsOf({ ...validFile(), version: 'one' }).map((problem) => problem.path),
    ['version'],
  );
  const future = problemsOf({ ...validFile(), version: 2 });
  assert.deepEqual(
    future.map((problem) => problem.path),
    ['version'],
  );
  assert.match(future[0]!.message, /更新/);
});

test('読み込みの誤り: 知らないキー名（項目名と物理キーの名前）', () => {
  const top = problemsOf({ ...validFile(), extra: 1 });
  assert.deepEqual(
    top.map((problem) => problem.path),
    ['extra'],
  );

  const file = validFile();
  const faces = file.faces as Record<string, unknown>[];
  faces[0]!.typo = true;
  faces[0]!.outputs = { a: 'あ', ab: 'か', r0c0: 'さ', r9c9: 'い', f: '゛', l: '゜' };
  (faces[1]!.trigger as string[]).push('nokey');
  const problems = problemsOf(file);
  assert.deepEqual(
    problems.map((problem) => problem.path).sort(),
    ['faces[0].outputs.ab', 'faces[0].outputs.r0c0', 'faces[0].outputs.r9c9', 'faces[0].typo', 'faces[1].trigger[1]'].sort(),
  );
  for (const problem of problems) assert.match(problem.message, /面[12]/, '何番目の面の誤りかが分かる');
});

test('読み込みの誤り: 同じtriggerと順序の面が2つある', () => {
  const file = validFile();
  const faces = file.faces as Record<string, unknown>[];
  faces.push({ ...structuredClone(faces[1]!), outputs: { d: 'う' } });
  const problems = problemsOf(file);
  assert.deepEqual(
    problems.map((problem) => problem.path),
    ['faces[2]'],
  );
  assert.match(problems[0]!.message, /面3は面2と/);

  // 順序が違えば別の面
  (faces[2] as Record<string, unknown>).mode = 'prefix';
  delete (faces[2] as Record<string, unknown>).layer;
  assert.ok(parseKanaLayoutFile(JSON.stringify(file)).ok);
});

test('読み込みの誤り: 単打の面が2つある', () => {
  const file = validFile();
  const faces = file.faces as Record<string, unknown>[];
  faces.push({ trigger: [], inputRole: 'layer', outputs: { d: 'う' } });
  assert.deepEqual(
    problemsOf(file).map((problem) => problem.path),
    ['faces[2]'],
  );
});

test('読み込みの誤り: triggerのキーが同じ面の出力のキーにもある', () => {
  const file = validFile();
  const faces = file.faces as { trigger: string[]; outputs: Record<string, string> }[];
  faces[1]!.trigger = ['f'];
  faces[1]!.outputs = { f: 'ぁ', s: 'い' };
  const problems = problemsOf(file);
  assert.deepEqual(
    problems.map((problem) => problem.path),
    ['faces[1].outputs.f'],
  );
});

test('読み込みの誤り: triggerに同じキーが2回ある', () => {
  const file = validFile();
  (file.faces as { trigger: string[] }[])[1]!.trigger = ['thumb-r', 'space'];
  assert.deepEqual(
    problemsOf(file).map((problem) => problem.path),
    ['faces[1].trigger[1]'],
  );
});

test('読み込みの誤り: 意味の不足（順序・持続・入力の意味・composition・合成）は推論せず誤りにする', () => {
  const file = validFile();
  const faces = file.faces as Record<string, unknown>[];
  delete faces[1]!.mode;
  delete faces[1]!.triggerPersistence;
  delete faces[0]!.inputRole;
  delete file.composition;
  const problems = problemsOf(file);
  assert.deepEqual(problems.map((problem) => problem.path).sort(), ['composition', 'faces[0].inputRole', 'faces[1].mode', 'faces[1].triggerPersistence']);
});

test('読み込みの誤り: compositionの面は層とコンボ枠のどちらに数えるかが要り、ほかの面は持てない', () => {
  const file = validFile();
  const faces = file.faces as Record<string, unknown>[];
  faces[1]!.inputRole = 'composition';
  assert.deepEqual(
    problemsOf(file).map((problem) => problem.path),
    ['faces[1].compositionAggregation'],
  );
  faces[1]!.compositionAggregation = 'layer';
  assert.ok(parseKanaLayoutFile(JSON.stringify(file)).ok);
  faces[1]!.inputRole = 'layer';
  assert.deepEqual(
    problemsOf(file).map((problem) => problem.path),
    ['faces[1].compositionAggregation'],
  );
});

test('読み込みの誤り: 単打の面は順序・持続・先押し・レイヤー名を持てない', () => {
  const file = validFile();
  Object.assign((file.faces as Record<string, unknown>[])[0]!, {
    mode: 'simultaneous',
    triggerPersistence: 'single',
    triggerOrder: 'prefix',
    layer: 'x',
  });
  assert.deepEqual(
    problemsOf(file).map((problem) => problem.path),
    ['faces[0].mode', 'faces[0].triggerPersistence', 'faces[0].triggerOrder', 'faces[0].layer'],
  );
});

test('読み込みの誤り: 修飾の組はmodifierの面だけが持てる', () => {
  const file = validFile();
  const faces = file.faces as Record<string, unknown>[];
  faces[1]!.inputRole = 'layer';
  faces[1]!.modifierGroups = { 'thumb-l': 'Shift' };
  assert.deepEqual(
    problemsOf(file).map((problem) => problem.path),
    ['faces[1].modifierGroups'],
  );
  faces[1]!.inputRole = 'modifier';
  assert.ok(parseKanaLayoutFile(JSON.stringify(file)).ok);
});

test('読み込みの誤り: 合成を使うと指定したのに合成記号がどの面にも無い', () => {
  const file = validFile();
  const faces = file.faces as { outputs: Record<string, string> }[];
  faces[0]!.outputs = { a: 'あ', s: 'か', j: 'ぱ', k: 'は' };
  const problems = problemsOf(file);
  assert.deepEqual(
    problems.map((problem) => problem.path),
    ['composition.dakuten', 'composition.handakuten'],
  );
});

test('読み込みの誤り: 出力が空・値の型が違う', () => {
  const file = validFile();
  (file.faces as { outputs: Record<string, unknown> }[])[0]!.outputs = { a: '', s: 3, f: '゛', l: '゜' };
  assert.deepEqual(
    problemsOf(file).map((problem) => problem.path),
    ['faces[0].outputs.a', 'faces[0].outputs.s'],
  );
  const empty = validFile();
  (empty.faces as { outputs: Record<string, unknown> }[])[1]!.outputs = {};
  assert.deepEqual(
    problemsOf(empty).map((problem) => problem.path),
    ['faces[1].outputs'],
  );
});

/** 利用者に見せる文に、内部の語（型名・内部の検査の語）が入っていないこと。 */
function assertUserFacing(problems: readonly { path: string; message: string }[]) {
  for (const problem of problems) {
    assert.doesNotMatch(problem.message, /Face|Requirement|face:|aggregation|SemanticInput/, `${problem.path}: ${problem.message}`);
  }
}

test('読み込みの誤り: 打鍵の順序と先押しの矛盾は、読み込みの段で利用者向けの文で返す', () => {
  const file = validFile();
  Object.assign((file.faces as Record<string, unknown>[])[1]!, { mode: 'prefix', triggerOrder: 'suffix' });
  const problems = problemsOf(file);
  assert.deepEqual(
    problems.map((problem) => problem.path),
    ['faces[1].triggerOrder'],
  );
  assert.match(problems[0]!.message, /^面2の打鍵の順序（mode）が「prefix」なのに/);
  assertUserFacing(problems);
  // 同じ向きなら通る
  Object.assign((file.faces as Record<string, unknown>[])[1]!, { triggerOrder: 'prefix' });
  assert.ok(parseKanaLayoutFile(JSON.stringify(file)).ok);
});

test('読み込みの誤り: 修飾の組がtrigger以外のキーを指す・triggerの一部しか分類しない', () => {
  const file = validFile();
  const face = (file.faces as Record<string, unknown>[])[1]!;
  face.trigger = ['thumb-l', 'thumb-r'];
  face.modifierGroups = { 'thumb-l': 'A', f: 'B', 'thumb-r': 'C' };
  const outside = problemsOf(file);
  assert.deepEqual(
    outside.map((problem) => problem.path),
    ['faces[1].modifierGroups.f'],
  );
  assertUserFacing(outside);
  face.modifierGroups = { 'thumb-l': 'A' };
  const partial = problemsOf(file);
  assert.deepEqual(
    partial.map((problem) => problem.path),
    ['faces[1].modifierGroups'],
  );
  assert.match(partial[0]!.message, /すべて分類してください/);
  assertUserFacing(partial);
  face.modifierGroups = { 'thumb-l': 'A', 'thumb-r': 'B' };
  assert.ok(parseKanaLayoutFile(JSON.stringify(file)).ok);
});

test('読み込みの誤り: compositionの面の数え方の制約（層は1キー・コンボ枠にレイヤー名は不可・同じキーを2枚不可）', () => {
  const file = validFile();
  const faces = file.faces as Record<string, unknown>[];
  Object.assign(faces[1]!, { inputRole: 'composition', compositionAggregation: 'layer', trigger: ['thumb-l', 'thumb-r'] });
  delete faces[1]!.layer;
  const twoKeys = problemsOf(file);
  assert.deepEqual(
    twoKeys.map((problem) => problem.path),
    ['faces[1].compositionAggregation'],
  );
  assertUserFacing(twoKeys);

  Object.assign(faces[1]!, { compositionAggregation: 'combo', layer: '左親指' });
  const comboLayer = problemsOf(file);
  assert.deepEqual(
    comboLayer.map((problem) => problem.path),
    ['faces[1].layer'],
  );
  assertUserFacing(comboLayer);

  Object.assign(faces[1]!, { compositionAggregation: 'layer', trigger: ['thumb-l'] });
  delete faces[1]!.layer;
  faces.push({ ...structuredClone(faces[1]!), mode: 'prefix', outputs: { d: 'う' } });
  const duplicate = problemsOf(file);
  assert.deepEqual(
    duplicate.map((problem) => problem.path),
    ['faces[2]'],
  );
  assert.match(duplicate[0]!.message, /面3は面2と/);
  assertUserFacing(duplicate);
});

test('読み込みの誤り: 読み込みの段で弾けない組み立ての失敗は、汎用の文と内部の文（詳細）に分ける', () => {
  const file = validFile();
  const faces = file.faces as Record<string, unknown>[];
  // 同じレイヤー名で、対象のキーが重なる面（畳み条件を満たさない）
  faces.push({ ...structuredClone(faces[1]!), trigger: ['thumb-r'] });
  const problems = problemsOf(file);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]!.path, 'faces[2]');
  assert.match(problems[0]!.message, /^面3を加えると配列を組めません。切り替えのキーと打鍵の順序、同じキーの出力を見直してください$/);
  assert.ok(problems[0]!.detail !== undefined && problems[0]!.detail !== '', '内部の文は詳細に残す');
  assertUserFacing(problems);
});

test('読み込みの誤り: 濁点・半濁点の合成が組めない時も、内部の文は詳細に分ける', () => {
  const { layout } = read(JSON.stringify(validFile()));
  // 読み込みの検査をすり抜けた値を直接組み立てる
  const broken = { ...layout, faces: [{ ...layout.faces[0]!, outputs: { a: 'あ', s: 'か' } }, layout.faces[1]!] };
  assert.throws(
    () => buildFaceLayout('x', 'x', broken),
    (error: unknown) => {
      const problem = (error as { problems: { message: string; detail?: string }[] }).problems[0]!;
      assertUserFacing([{ path: 'composition', message: problem.message }]);
      return problem.detail !== undefined && /未定義/.test(problem.detail);
    },
  );
});

test('読み込みの誤り: JSONの構文の誤りは、利用者向けの文とブラウザの文（詳細）に分ける', () => {
  const problems = problemsOf('{ "format": ');
  assert.equal(problems[0]!.message, 'JSONとして読めません。括弧や引用符、カンマを確かめてください');
  assert.ok((problems[0]!.detail ?? '') !== '');
});

test('読み込みの誤り: 複数の誤りは1回で全部返す', () => {
  const file = validFile();
  (file as Record<string, unknown>).name = '';
  (file.faces as Record<string, unknown>[])[0]!.outputs = { zz: 'あ' };
  (file.faces as Record<string, unknown>[])[1]!.inputRole = 'bogus';
  const paths = problemsOf(file).map((problem) => problem.path);
  assert.ok(paths.includes('name') && paths.includes('faces[0].outputs.zz') && paths.includes('faces[1].inputRole'));
});

test('同じかなが2か所以上にある時は、誤りにせず場所を並べた注意で返す', () => {
  const file = validFile();
  (file.faces as { outputs: Record<string, string> }[])[1]!.outputs = { a: 'あ', s: 'い' };
  const result = read(JSON.stringify(file));
  assert.equal(result.notices.length, 1);
  assert.equal(result.notices[0]!.output, 'あ');
  assert.match(result.notices[0]!.message, /「あ」が2か所にあります（面1のA・面2のA）/);
  const built = buildFaceLayout('user-x', 'x', result.layout);
  assert.equal(built.canonicalInputs.get('あ')!.length, 2, '代わりの打ち方として両方を持つ');
  assert.deepEqual(duplicateOutputNotices({ faces: [] }), []);
});

test('新下駄を面の形で書くと、組み込みと同じ打鍵列になり、同じ記号が複数の面にあるのは注意になる', () => {
  const content: KanaLayoutContent = {
    kind: 'kana',
    name: '面で書いた新下駄',
    faces: SHINGETA_FACES.map(userFaceOf),
    composition: { dakuten: false, handakuten: false },
  };
  const result = read(kanaLayoutFileText(content));
  assert.ok(
    result.notices.some((notice) => notice.output === '「'),
    '単打面とD面の両方にある記号は代わりの打ち方',
  );
  const built = buildFaceLayout('user-shingeta', content.name, result.layout);
  const text = 'ねこがすきだ。「きょうは、いいてんき」ですね';
  const expected = strokesOf(SHINGETA, text);
  const actual = strokesOf(built, text);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
  assert.deepEqual(
    built.layerDefinitions?.map((layer) => layer.id),
    SHINGETA.layerDefinitions?.map((layer) => layer.id),
  );
});

test('JISかな配列を面の形で書くと（Shiftの面・先押しの制約・濁点の合成を含め）、組み込みと同じ打鍵列になる', () => {
  const content: KanaLayoutContent = {
    kind: 'kana',
    name: '面で書いたJISかな',
    faces: JIS_KANA.faces!.map(userFaceOf),
    composition: { dakuten: true, handakuten: true },
  };
  const result = read(kanaLayoutFileText(content));
  const built = buildFaceLayout('user-jis', content.name, result.layout);
  const jis = buildGeometry('jis-row-staggered', JIS_FINGER_ASSIGNMENT);
  const text = 'ぱぴぷぺぽがぎぐげごゔっゃゅょ「あいう」、。ー';
  const trace = (layout: Layout) => generateTrace(text, layout, jis, DEFAULT_TRACE_POLICY);
  assert.deepEqual(trace(built).errors, []);
  assert.equal(trace(built).skipped, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(trace(built).strokes)), JSON.parse(JSON.stringify(trace(JIS_KANA).strokes)));
  assert.deepEqual(uncoveredKana(built), []);
});

test('面の形の読み込みは、保存形式の検査と同じ（readFaceBody）で誤りを返す', () => {
  const { body, problems } = readFaceBody({ faces: 'x', composition: {} });
  assert.equal(body, undefined);
  assert.ok(problems.length >= 1);
  const ok: UserFaceBody = {
    kind: 'kana',
    faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'あ' } }],
    composition: { dakuten: false, handakuten: false },
  };
  assert.deepEqual(readFaceBody({ ...ok }).body, ok);
});
