import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chordOutputCount,
  contentOf,
  createUserLayout,
  hasBlockingProblem,
  ignoredHomeKeyWarnings,
  isEditableUserLayout,
  layoutProblems,
  normalizeContent,
  placedKeys,
  updateUserLayout,
  type UserLayoutContent,
} from './layout-edit.ts';
import { ALL_FINGERS, DEFAULT_FINGER_ASSIGNMENT, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT, type FingerAssignment } from '../shapes/geometry.ts';
import { toLayout, validate, type StageUserLayout } from './user-layouts.ts';

const DVORAK: UserLayoutContent = {
  name: '私のDvorak',
  rows: ['1234567890[]', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'],
  romaji: 'kunrei',
  homeKeys: {},
};

const stored = (overrides: Partial<StageUserLayout> = {}): StageUserLayout => ({
  id: 'user-a',
  name: '私のDvorak',
  kind: 'alpha',
  rows: [...DVORAK.rows],
  romaji: 'kunrei',
  ...overrides,
});

const errorsOf = (content: UserLayoutContent) => layoutProblems(content).filter((problem) => problem.severity === 'error');
const warningsOf = (content: UserLayoutContent) => layoutProblems(content).filter((problem) => problem.severity === 'warning');

test('不備の無い入力には、保存できない不備も注意も無い', () => {
  assert.deepEqual(layoutProblems(DVORAK, new Set()), []);
});

test('名前が空（空白だけを含む）なら、名前の欄の保存できない不備になる', () => {
  const problems = errorsOf({ ...DVORAK, name: '  ' });
  assert.deepEqual(
    problems.map((problem) => problem.field),
    [{ kind: 'name' }],
  );
});

test('段が置けるキーの数を超えたら、その段の保存できない不備になる。どの段かは場所で分かる', () => {
  const problems = errorsOf({ ...DVORAK, rows: ['1234567890[]', "',.pyfgcrl/=x", 'aoeuidhtns-', ';qjkxbmwvz'] });
  assert.deepEqual(
    problems.map((problem) => problem.field),
    [{ kind: 'row', index: 1 }],
  );
  assert.match(problems[0]!.message, /上段が13文字/);
});

test('英字の段がすべて空なら、保存できない不備になる。数字段だけの入力も同じ', () => {
  const problems = errorsOf({ ...DVORAK, rows: ['1234567890', '', '', ''] });
  assert.deepEqual(
    problems.map((problem) => problem.field),
    [{ kind: 'letter-rows' }],
  );
});

test('ホームキーが段に無いキーを指すなら、その指の保存できない不備になる', () => {
  const problems = errorsOf({ ...DVORAK, rows: ['', 'qwert', 'asdf', 'zxcv'], homeKeys: { RI: 'j', LI: 'f' } });
  assert.deepEqual(
    problems.map((problem) => problem.field),
    [{ kind: 'home-key', finger: 'RI' }],
  );
  assert.match(problems[0]!.message, /右人差し指のホームキー「J」/);
});

test('数字段が空の時は、数字段のキーをQWERTYとして数える', () => {
  assert.deepEqual(errorsOf({ ...DVORAK, rows: ['', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'], homeKeys: { LP: '1' } }), []);
});

test('同じ文字が複数のキーに載っている時は、保存できる注意として重なったキーを示す', () => {
  const content: UserLayoutContent = { ...DVORAK, rows: ['', 'qwerty', 'asdfgq', 'zxcvb'] };
  assert.deepEqual(errorsOf(content), []);
  const warnings = warningsOf(content);
  assert.deepEqual(
    warnings.map((warning) => warning.field),
    [{ kind: 'duplicate', char: 'q', keyIds: ['q', 'h'] }],
  );
  assert.equal(hasBlockingProblem(warnings), false);
});

test('選んだローマ字規則が無ければ、保存できる注意として知らせる。組み込みと自作の規則は見つかる', () => {
  assert.deepEqual(layoutProblems({ ...DVORAK, romaji: 'romaji-gone' }), [], '規則の一覧を渡さない時は調べない');
  const missing = layoutProblems({ ...DVORAK, romaji: 'romaji-gone' }, new Set(['romaji-a']));
  assert.deepEqual(
    missing.map((problem) => [problem.severity, problem.field]),
    [['warning', { kind: 'romaji' }]],
  );
  assert.deepEqual(layoutProblems({ ...DVORAK, romaji: 'romaji-a' }, new Set(['romaji-a'])), []);
  assert.deepEqual(layoutProblems({ ...DVORAK, romaji: 'azik' }, new Set()), []);
});

test('validate()が弾く入力は、すべて保存できない不備になる', () => {
  const inputs: UserLayoutContent[] = [
    { ...DVORAK, rows: ['1234567890[]x', 'q', 'a', 'z'] },
    { ...DVORAK, rows: ['', '', '', ''] },
    { ...DVORAK, rows: ['1', '', '   ', ''] },
  ];
  for (const input of inputs) {
    assert.notDeepEqual(validate([...normalizeContent(input).rows]), []);
    assert.ok(hasBlockingProblem(layoutProblems(input)));
    assert.equal(createUserLayout([], () => 'user-x', input).ok, false);
  }
});

test('新規作成は、名前と段の前後の空白を落とし、空のホームキーを持たずに末尾へ足す', () => {
  const existing = stored({ id: 'user-old' });
  const result = createUserLayout([existing], () => 'user-new', {
    ...DVORAK,
    name: ' 新しい配列 ',
    rows: [' ', " ',.pyfgcrl/= ", 'aoeuidhtns-', ';qjkxbmwvz'],
    homeKeys: { LP: '', RI: 'h' },
  });
  assert.ok(result.ok);
  assert.deepEqual(
    result.layouts.map((layout) => layout.id),
    ['user-old', 'user-new'],
  );
  assert.deepEqual(result.layouts[1], {
    kind: 'alpha',
    id: 'user-new',
    name: '新しい配列',
    rows: ['', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'],
    romaji: 'kunrei',
    homeKeys: { RI: 'h' },
  });
});

test('ホームキーを持たない配列は、homeKeysの項目を持たずに保存する', () => {
  const result = createUserLayout([], () => 'user-new', DVORAK);
  assert.ok(result.ok);
  assert.equal('homeKeys' in result.layouts[0]!, false);
});

test('保存できない不備のある入力は、作成も更新も理由を返して何も書かない', () => {
  const bad = { ...DVORAK, name: '' };
  const created = createUserLayout([], () => 'user-new', bad);
  assert.equal(created.ok, false);
  const updated = updateUserLayout([stored()], 'user-a', bad);
  assert.equal(updated.ok, false);
});

test('更新はidと並びを保ち、中身が同じなら同じ参照を返す', () => {
  const layouts = [stored({ id: 'user-a' }), stored({ id: 'user-b', name: '別の配列' })];
  const same = updateUserLayout(layouts, 'user-a', contentOf(layouts[0]!));
  assert.ok(same.ok);
  assert.equal(same.layouts, layouts);

  const changed = updateUserLayout(layouts, 'user-a', { ...DVORAK, name: '改名', homeKeys: { RI: 'h' } });
  assert.ok(changed.ok);
  assert.deepEqual(
    changed.layouts.map((layout) => [layout.id, layout.name]),
    [
      ['user-a', '改名'],
      ['user-b', '別の配列'],
    ],
  );
  assert.deepEqual(changed.layouts[0]!.homeKeys, { RI: 'h' });
  assert.equal(changed.layouts[1], layouts[1]);
});

test('対象が無い更新は何もしない', () => {
  const layouts = [stored()];
  const result = updateUserLayout(layouts, 'user-none', DVORAK);
  assert.ok(result.ok);
  assert.equal(result.layouts, layouts);
});

/** 機能キーや未定義のキーを空白で置いた取り込み形式の配列。先頭・途中・末尾に空白がある。 */
const importedLayout = (overrides: Partial<StageUserLayout> = {}): StageUserLayout => ({
  kind: 'alpha',
  id: 'user-imported',
  name: '取り込んだ配列',
  rows: ['  34        ', ' q  t y     ', 'as df   l  ', ' x        '],
  romaji: 'kunrei',
  sequences: [
    ['desu', [['d', 's']]],
    ['ka', [['k'], ['a']]],
  ],
  legends: [['a', 'Enter']],
  ...overrides,
});

test('取り込み形式の配列も直せる配列に出る。面で定義する配列は出ない', () => {
  assert.equal(isEditableUserLayout(importedLayout()), true);
  assert.equal(isEditableUserLayout(stored({ legends: [['a', 'あ']] })), true);
  assert.equal(isEditableUserLayout(stored()), true);
});

test('取り込み形式の配列は、名前・ローマ字規則・ホームキーだけを書き換え、段・sequences・legendsは元の値のまま残す', () => {
  const layout = importedLayout();
  const layouts = [layout];
  // 画面が持つ入力欄の値は、段の空白を落とさない
  assert.deepEqual(contentOf(layout).rows, layout.rows);
  // 段や出力を書き換えた入力が来ても、保存済みの値を使う
  const result = updateUserLayout(layouts, layout.id, {
    ...contentOf(layout),
    name: '改名',
    rows: ['', 'qwert', 'asdfg', 'zxcvb'],
    romaji: 'hepburn',
    homeKeys: { LM: 'f' },
    sequences: [['x', [['x']]]],
    legends: [],
  });
  assert.ok(result.ok);
  const saved = result.layouts[0] as StageUserLayout;
  assert.equal(saved.name, '改名');
  assert.equal(saved.romaji, 'hepburn');
  assert.deepEqual(saved.homeKeys, { LM: 'f' });
  assert.deepEqual(saved.rows, layout.rows);
  assert.deepEqual(saved.sequences, layout.sequences);
  assert.deepEqual(saved.legends, layout.legends);
});

test('取り込み形式の配列を保存し直しても、前後の配列から作った打鍵列が一致する', () => {
  const layout = importedLayout();
  const result = updateUserLayout([layout], layout.id, { ...contentOf(layout), name: '改名', homeKeys: { LM: 'f' } });
  assert.ok(result.ok);
  const before = toLayout(layout);
  const after = toLayout(result.layouts[0] as StageUserLayout);
  assert.deepEqual([...after.map], [...before.map]);
  assert.deepEqual([...after.canonicalInputs], [...before.canonicalInputs]);
  assert.deepEqual([...after.legends], [...before.legends]);
  // 空白の位置のキーには文字が載らない（段を落とすと、右の文字が空白の位置へずれる）
  assert.equal(after.map.has('3'), true);
  assert.deepEqual(after.map.get('3'), [['3']]);
  assert.deepEqual(after.map.get('l'), [['l']]);
});

test('取り込み形式の配列は、段が空白だけでも、同じ文字が重なっても、保存できない不備にならない', () => {
  const blankRows = contentOf(importedLayout({ rows: ['    ', '    ', '    ', '    '] }));
  assert.deepEqual(layoutProblems(blankRows), []);
  const duplicated = contentOf(importedLayout({ rows: ['    ', 'aa  ', '    ', '    '] }));
  assert.deepEqual(layoutProblems(duplicated), []);
  // ホームキーは物理キーで指す。文字のある位置は選べ、段の空白の位置（ホーム段の3列目）は選べない
  const problems = layoutProblems({ ...contentOf(importedLayout()), homeKeys: { LM: 'f' } });
  assert.deepEqual(problems, []);
  const onBlank = layoutProblems({ ...contentOf(importedLayout()), homeKeys: { LM: 'd' } });
  assert.deepEqual(
    onBlank.map((problem) => problem.field),
    [{ kind: 'home-key', finger: 'LM' }],
  );
});

test('取り込み形式の配列の新規作成は、段の空白を落とさずに保存する', () => {
  const layout = importedLayout();
  const created = createUserLayout([], () => 'user-new', contentOf(layout));
  assert.ok(created.ok);
  const saved = created.layouts[0] as StageUserLayout;
  assert.deepEqual(saved.rows, layout.rows);
  assert.deepEqual(saved.sequences, layout.sequences);
  assert.deepEqual(saved.legends, layout.legends);
});

test('同時押しや複数の打鍵になる出力だけを数える', () => {
  assert.equal(chordOutputCount(importedLayout().sequences ?? []), 2);
  assert.equal(chordOutputCount([['a', [['a']]]]), 0);
  assert.equal(chordOutputCount([]), 0);
});

test('面で定義する配列は、更新が理由つきで断られる', () => {
  const face = { id: 'user-face', name: '面', faces: [] } as unknown as StageUserLayout;
  assert.equal(updateUserLayout([face], face.id, DVORAK).ok, false);
});

test('段の中の空白はキーに数えない。重複の注意にも、ホームキーの検査にも使わない', () => {
  const content: UserLayoutContent = { ...DVORAK, rows: ['', 'q  w', 'as df', 'zxcv'], homeKeys: {} };
  assert.deepEqual(layoutProblems(content), []);
  assert.deepEqual(
    placedKeys(content.rows)
      .filter((entry) => entry.row === 2)
      .map((entry) => entry.keyId),
    ['a', 's', 'f', 'g'],
  );
  // 空白の位置のキー（ホーム段の3列目）は「段に無いキー」
  const problems = layoutProblems({ ...content, homeKeys: { LM: 'd' } });
  assert.deepEqual(
    problems.map((problem) => problem.field),
    [{ kind: 'home-key', finger: 'LM' }],
  );
});

test('ホームキーの不備と重複の注意は、内部のidでなくキーの表示名で示す', () => {
  const [home] = layoutProblems({ ...DVORAK, rows: ['', 'qwerty', "asdfghjkl;'", 'zxcvb'], homeKeys: { RI: 'r2c11' } });
  assert.doesNotMatch(home!.message, /r2c11/);
  assert.match(home!.message, /3段目12列/);
  // 数字段の範囲外のキーに載せた文字が、別のキーと重なる
  const [dup] = warningsOf({ ...DVORAK, rows: ['1234567890-=r', 'qwerty', 'asdf', 'zxcv'] });
  assert.deepEqual(dup!.field, { kind: 'duplicate', char: 'r', keyIds: ['r0c12', 'r'] });
  assert.doesNotMatch(dup!.message, /r0c12/);
  assert.match(dup!.message, /1段目13列・R/);
});

const withoutRomaji = (content: UserLayoutContent): UserLayoutContent => {
  const { romaji: _removed, ...rest } = content;
  return rest;
};

test('layoutProblems: 推奨の規則を省いた入力は、既知の規則の集合を渡しても不備を返さない', () => {
  assert.deepEqual(layoutProblems(withoutRomaji(DVORAK), new Set(['kunrei'])), []);
});

test('updateUserLayout: 推奨の規則を省いた内容で書き換えると、romajiのキーを持たない配列になる', () => {
  const layouts = [stored()];
  const updated = updateUserLayout(layouts, 'user-a', withoutRomaji(DVORAK));
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.notEqual(updated.layouts, layouts);
  assert.equal('romaji' in updated.layouts[0]!, false);
});

test('updateUserLayout: 推奨の規則を持たない配列は、contentOfの結果をそのまま渡しても同じ参照を返す', () => {
  const { romaji: _removed, ...rest } = stored();
  const layouts: StageUserLayout[] = [rest];
  const same = updateUserLayout(layouts, 'user-a', contentOf(layouts[0]!));
  assert.equal(same.ok && same.layouts, layouts);
});

const homeWarnings = (content: UserLayoutContent, assignments: readonly FingerAssignment[]) =>
  layoutProblems(content, undefined, assignments).filter((problem) => problem.field.kind === 'home-key');

const namedAssignment = (assignment: FingerAssignment, name: string): FingerAssignment => ({ ...assignment, name });

test('layoutProblems: ホームキーをその指が担当しない割り当てを、名前を挙げて警告する', () => {
  const content = { ...DVORAK, homeKeys: { RI: 'g' } };
  const problems = homeWarnings(content, [namedAssignment(DEFAULT_FINGER_ASSIGNMENT, '甲'), namedAssignment(DEFAULT_FINGER_ASSIGNMENT, '乙')]);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]!.severity, 'warning');
  assert.deepEqual(problems[0]!.field, { kind: 'home-key', finger: 'RI' });
  assert.match(problems[0]!.message, /「甲」「乙」/);
  assert.equal(hasBlockingProblem(layoutProblems(content, undefined, [DEFAULT_FINGER_ASSIGNMENT])), false);
});

test('layoutProblems: 一部の割り当てだけが担当しないキーは、その割り当ての名前だけを挙げる', () => {
  const problems = homeWarnings({ ...DVORAK, homeKeys: { LI: 'h' } }, [
    namedAssignment(DEFAULT_FINGER_ASSIGNMENT, '甲'),
    namedAssignment(QWERTY_OPTIMIZED_FINGER_ASSIGNMENT, '乙'),
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0]!.message, /「甲」では/);
  assert.doesNotMatch(problems[0]!.message, /乙/);
});

test('layoutProblems: その指が担当するキーなら警告しない。割り当てを渡さなければ照合しない', () => {
  assert.deepEqual(homeWarnings({ ...DVORAK, homeKeys: { RI: 'h' } }, [DEFAULT_FINGER_ASSIGNMENT]), []);
  assert.deepEqual(homeWarnings({ ...DVORAK, homeKeys: { LI: 'h' } }, []), []);
  assert.deepEqual(layoutProblems({ ...DVORAK, homeKeys: { LI: 'h' } }), []);
});

test('layoutProblems: そのキーをどの指も担当しない割り当ては照合から外す', () => {
  const fingerKeys = { ...DEFAULT_FINGER_ASSIGNMENT.fingerKeys };
  for (const finger of ALL_FINGERS) fingerKeys[finger] = fingerKeys[finger].filter((key) => key !== 'h');
  const without: FingerAssignment = { ...DEFAULT_FINGER_ASSIGNMENT, fingerKeys };
  assert.deepEqual(homeWarnings({ ...DVORAK, homeKeys: { LI: 'h' } }, [without]), []);
});

test('layoutProblems: 段に無いキーは今ある不備だけを返し、担当の警告を重ねない', () => {
  const problems = layoutProblems({ ...DVORAK, rows: ['', '', 'aoeu', ''], homeKeys: { LI: 'h' } }, undefined, [DEFAULT_FINGER_ASSIGNMENT]);
  assert.deepEqual(
    problems.filter((problem) => problem.field.kind === 'home-key').map((problem) => problem.severity),
    ['error'],
  );
});

test('ignoredHomeKeyWarnings: ローマ字配列の検査と同じ文面を、指ごとに返す。空の指定は数えない', () => {
  const assignments = [namedAssignment(DEFAULT_FINGER_ASSIGNMENT, '甲')];
  const homeKeys = { LI: 'h', RI: '', LM: 'd' } as const;
  const warnings = ignoredHomeKeyWarnings(homeKeys, assignments);
  assert.deepEqual(
    warnings.map((warning) => warning.finger),
    ['LI'],
  );
  assert.deepEqual(
    warnings.map((warning) => warning.message),
    homeWarnings({ ...DVORAK, homeKeys }, assignments).map((problem) => problem.message),
  );
});

test('ignoredHomeKeyWarnings: 割り当てが無い、またはどの指も担当しないキーなら返さない', () => {
  assert.deepEqual(ignoredHomeKeyWarnings({ LI: 'h' }, []), []);
  assert.deepEqual(ignoredHomeKeyWarnings({ LI: 'no-such-key' }, [DEFAULT_FINGER_ASSIGNMENT]), []);
});

test('同時に成り立つ出力が衝突する配列は、内部の語を含まない文で保存を止める', () => {
  const conflict = {
    name: '衝突',
    rows: ['', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'] as UserLayoutContent['rows'],
    romaji: 'qwerty',
    homeKeys: {},
    sequences: [
      ['.', [['k', 'a']]],
      ['ka', [['k', 'a']]],
    ] as [string, [string[]]][],
    legends: [],
  } satisfies UserLayoutContent;
  const problem = layoutProblems(conflict).find((entry) => entry.field.kind === 'build');
  assert.equal(problem?.severity, 'error');
  assert.equal(problem?.message, '「.」の打鍵（A・K）と「ka」の打鍵（A・K）が同時に成り立つため、配列として組み立てられません');
  assert.doesNotMatch(problem?.message ?? '', /logical|canonical|activation/);
});
