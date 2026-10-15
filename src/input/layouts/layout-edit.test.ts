import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentOf,
  createUserLayout,
  hasBlockingProblem,
  isEditableUserLayout,
  layoutProblems,
  normalizeContent,
  placedKeys,
  updateUserLayout,
  type UserLayoutContent,
} from './layout-edit.ts';
import { validate, type UserLayout } from './user-layouts.ts';

const DVORAK: UserLayoutContent = {
  name: '私のDvorak',
  rows: ['1234567890[]', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'],
  romaji: 'kunrei',
  homeKeys: {},
};

const stored = (overrides: Partial<UserLayout> = {}): UserLayout => ({
  id: 'user-a',
  name: '私のDvorak',
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
  assert.deepEqual(problems.map((problem) => problem.field), [{ kind: 'name' }]);
});

test('段が置けるキーの数を超えたら、その段の保存できない不備になる。どの段かは場所で分かる', () => {
  const problems = errorsOf({ ...DVORAK, rows: ['1234567890[]', "',.pyfgcrl/=x", 'aoeuidhtns-', ';qjkxbmwvz'] });
  assert.deepEqual(problems.map((problem) => problem.field), [{ kind: 'row', index: 1 }]);
  assert.match(problems[0]!.message, /上段が13文字/);
});

test('英字の段がすべて空なら、保存できない不備になる。数字段だけの入力も同じ', () => {
  const problems = errorsOf({ ...DVORAK, rows: ['1234567890', '', '', ''] });
  assert.deepEqual(problems.map((problem) => problem.field), [{ kind: 'letter-rows' }]);
});

test('ホームキーが段に無いキーを指すなら、その指の保存できない不備になる', () => {
  const problems = errorsOf({ ...DVORAK, rows: ['', 'qwert', 'asdf', 'zxcv'], homeKeys: { RI: 'j', LI: 'f' } });
  assert.deepEqual(problems.map((problem) => problem.field), [{ kind: 'home-key', finger: 'RI' }]);
  assert.match(problems[0]!.message, /右人差し指のホームキー「J」/);
});

test('数字段が空の時は、数字段のキーをQWERTYとして数える', () => {
  assert.deepEqual(errorsOf({ ...DVORAK, rows: ['', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'], homeKeys: { LP: '1' } }), []);
});

test('同じ文字が複数のキーに載っている時は、保存できる注意として重なったキーを示す', () => {
  const content: UserLayoutContent = { ...DVORAK, rows: ['', 'qwerty', 'asdfgq', 'zxcvb'] };
  assert.deepEqual(errorsOf(content), []);
  const warnings = warningsOf(content);
  assert.deepEqual(warnings.map((warning) => warning.field), [{ kind: 'duplicate', char: 'q', keyIds: ['q', 'h'] }]);
  assert.equal(hasBlockingProblem(warnings), false);
});

test('選んだローマ字規則が無ければ、保存できる注意として知らせる。組み込みと自作の規則は見つかる', () => {
  assert.deepEqual(layoutProblems({ ...DVORAK, romaji: 'romaji-gone' }), [], '規則の一覧を渡さない時は調べない');
  const missing = layoutProblems({ ...DVORAK, romaji: 'romaji-gone' }, new Set(['romaji-a']));
  assert.deepEqual(missing.map((problem) => [problem.severity, problem.field]), [['warning', { kind: 'romaji' }]]);
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
  assert.deepEqual(result.layouts.map((layout) => layout.id), ['user-old', 'user-new']);
  assert.deepEqual(result.layouts[1], {
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
  assert.deepEqual(changed.layouts.map((layout) => [layout.id, layout.name]), [['user-a', '改名'], ['user-b', '別の配列']]);
  assert.deepEqual(changed.layouts[0]!.homeKeys, { RI: 'h' });
  assert.equal(changed.layouts[1], layouts[1]);
});

test('対象が無い更新は何もしない', () => {
  const layouts = [stored()];
  const result = updateUserLayout(layouts, 'user-none', DVORAK);
  assert.ok(result.ok);
  assert.equal(result.layouts, layouts);
});

test('取り込み形式の配列は直せない。段の文字だけで保存し直すと、かな・表示ラベル・直接入力が消えるため', () => {
  const imported: UserLayout[] = [
    stored({ id: 'user-seq', sequences: [['あ', [['a']]]] }),
    stored({ id: 'user-leg', legends: [['a', 'あ']] }),
    stored({ id: 'user-dir', direct: true }),
  ];
  for (const layout of imported) {
    assert.equal(isEditableUserLayout(layout), false);
    assert.equal(updateUserLayout(imported, layout.id, DVORAK).ok, false);
  }
  assert.equal(isEditableUserLayout(stored()), true);
  assert.equal(isEditableUserLayout(stored({ direct: false })), true);
});

test('段の中の空白はキーに数えない。重複の注意にも、ホームキーの検査にも使わない', () => {
  const content: UserLayoutContent = { ...DVORAK, rows: ['', 'q  w', 'as df', 'zxcv'], homeKeys: {} };
  assert.deepEqual(layoutProblems(content), []);
  assert.deepEqual(placedKeys(content.rows).filter((entry) => entry.row === 2).map((entry) => entry.keyId), ['a', 's', 'f', 'g']);
  // 空白の位置のキー（ホーム段の3列目）は「段に無いキー」
  const problems = layoutProblems({ ...content, homeKeys: { LM: 'd' } });
  assert.deepEqual(problems.map((problem) => problem.field), [{ kind: 'home-key', finger: 'LM' }]);
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
  const layouts: UserLayout[] = [rest];
  const same = updateUserLayout(layouts, 'user-a', contentOf(layouts[0]!));
  assert.equal(same.ok && same.layouts, layouts);
});
