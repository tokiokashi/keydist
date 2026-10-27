import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUserRomajiRule,
  duplicateUserRomajiRule,
  isKanaKey,
  isTypableSpelling,
  renameUserRomajiRule,
  spellingRows,
  updateUserRomajiRule,
  withSpelling,
} from './rule-edit.ts';
import { ROMAJI_VARIANTS } from './spelling-variations.ts';
import type { UserRomajiRule } from './rules.ts';

const RULE: UserRomajiRule = { id: 'romaji-a', name: 'A', base: 'kunrei', overrides: {}, generateSokuon: true };

test('新規作成は差分の無い規則を足す。AZIK・JLOD・gACT10は促音の子音重ねを持たない', () => {
  const [kunrei] = createUserRomajiRule([], () => 'romaji-1', 'N', 'kunrei');
  assert.deepEqual(kunrei, { id: 'romaji-1', name: 'N', base: 'kunrei', overrides: {}, generateSokuon: true });
  const [azik] = createUserRomajiRule([], () => 'romaji-2', 'N', 'azik');
  assert.equal(azik!.generateSokuon, false);
  const [jlod] = createUserRomajiRule([], () => 'romaji-3', 'J', 'jlod');
  assert.equal(jlod!.generateSokuon, false);
  const [gact10] = createUserRomajiRule([], () => 'romaji-4', 'G', 'gact10');
  assert.equal(gact10!.generateSokuon, false);
});

test('複製は差分を共有しない。変化が無い操作は同じ配列参照を返す', () => {
  const rules = [{ ...RULE, overrides: { し: 'shi' } }];
  const duplicated = duplicateUserRomajiRule(rules, 'romaji-a', () => 'romaji-b');
  assert.equal(duplicated[1]!.name, 'Aのコピー');
  assert.notEqual(duplicated[1]!.overrides, duplicated[0]!.overrides);
  assert.equal(
    duplicateUserRomajiRule(rules, 'none', () => 'x'),
    rules,
  );
  assert.equal(renameUserRomajiRule(rules, 'romaji-a', 'A'), rules);
  assert.equal(renameUserRomajiRule(rules, 'none', 'B'), rules);
  assert.equal(updateUserRomajiRule(rules, 'romaji-a', { base: 'kunrei', overrides: { し: 'shi' }, generateSokuon: true }), rules);
  assert.equal(updateUserRomajiRule(rules, 'none', { base: 'azik', overrides: {}, generateSokuon: false }), rules);
  assert.notEqual(updateUserRomajiRule(rules, 'romaji-a', { base: 'kunrei', overrides: { し: 'si' }, generateSokuon: true }), rules);
});

test('綴りの差し替え: 小文字にし、空なら差分を外し、置けない綴りは断る', () => {
  assert.deepEqual(withSpelling({}, 'し', ' SHI '), { し: 'shi' });
  assert.deepEqual(withSpelling({ し: 'shi', ち: 'chi' }, 'し', ''), { ち: 'chi' });
  assert.equal(withSpelling({}, 'し', 'sh i'), undefined);
  assert.equal(withSpelling({}, 'し', 'しい'), undefined);
  assert.equal(isTypableSpelling(''), false);
  assert.equal(isKanaKey('きゃ'), true);
  assert.equal(isKanaKey('a'), false);
  assert.equal(isKanaKey('き ゃ'), false);
});

test('揺れる箇所の一覧: 固定の一覧の全てのかなを並べ、基底と違う行だけがdiffersになる', () => {
  const plain = spellingRows(RULE);
  assert.deepEqual(
    plain.map((row) => row.kana),
    ROMAJI_VARIANTS.map((variant) => variant.kana),
  );
  assert.ok(plain.every((row) => !row.differs && row.base === row.current));
  assert.equal(plain.find((row) => row.kana === 'し')!.base, 'si');

  const rows = spellingRows({ ...RULE, overrides: { し: 'shi', か: 'ka' } });
  assert.deepEqual(
    rows.filter((row) => row.differs).map((row) => [row.kana, row.base, row.current]),
    [['し', 'si', 'shi']],
  );
});

test('固定の一覧に無いかなの上書きも、末尾に基底の綴りと並べて出る', () => {
  const rows = spellingRows({ ...RULE, base: 'oonishi', overrides: { きゃ: 'kya', ぎゃ: 'gha' } });
  const extra = rows.slice(ROMAJI_VARIANTS.length);
  assert.deepEqual(
    extra.map((row) => row.kana),
    ['きゃ', 'ぎゃ'],
  );
  assert.deepEqual(
    extra.map((row) => row.alternatives),
    [[], []],
  );
  assert.equal(extra[1]!.current, 'gha');
  assert.equal(extra[1]!.differs, true);
  assert.notEqual(extra[1]!.base, 'gha');
});

test('基底のルールを変えると、基底の綴りがそのルールのものになる', () => {
  const kana = (rule: UserRomajiRule, k: string) => spellingRows(rule).find((row) => row.kana === k)!;
  assert.equal(kana(RULE, 'しゃ').base, 'sya');
  assert.equal(kana({ ...RULE, base: 'oonishi' }, 'しゃ').base, 'sha');
});
