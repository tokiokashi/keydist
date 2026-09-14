import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRomajiTable,
  defaultRomajiRuleId,
  formatOverrides,
  parseOverrides,
  tableForRule,
  type UserRomajiRule,
} from '../src/romaji/rules.ts';
import { kanaToRomaji } from '../src/romaji/kunrei.ts';

test('ローマ字差分を読み取り、複数かなの見出しを保持する', () => {
  const parsed = parseOverrides('しゃ = sha\nかん = kz\n# コメント\n');
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.overrides, { しゃ: 'sha', かん: 'kz' });
  assert.equal(formatOverrides(parsed.overrides), 'しゃ = sha\nかん = kz');
});

test('ローマ字差分の形式エラーと重複を報告する', () => {
  const parsed = parseOverrides('しゃ = sha\nしゃ = shi\n壊れた行');
  assert.equal(parsed.errors.length, 2);
  assert.deepEqual(parsed.overrides, { しゃ: 'sha' });
});

test('カスタムルールは基底＋差分で構築でき、促音生成を切り替えられる', () => {
  const rule: UserRomajiRule = {
    id: 'custom-test',
    name: 'テスト',
    base: 'kunrei',
    overrides: { し: 'shi', しゃ: 'sha' },
    generateSokuon: true,
  };
  const table = buildRomajiTable(rule);
  assert.equal(kanaToRomaji('っしゃ', table), 'ssha');
  assert.equal(table.get('っしゃ'), 'ssha');

  const noSokuon = buildRomajiTable({ ...rule, generateSokuon: false });
  assert.equal(noSokuon.has('っしゃ'), false);
  assert.equal(kanaToRomaji('っしゃ', noSokuon), 'xtusha');
});

test('無効なルール id は訓令式へフォールバックする', () => {
  assert.equal(tableForRule('missing').get('し'), 'si');
  assert.equal(defaultRomajiRuleId('oonishi'), 'oonishi');
  assert.equal(defaultRomajiRuleId('qwerty'), 'kunrei');
});
