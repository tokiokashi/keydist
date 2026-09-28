import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectTextLanguage,
  detectTextLanguageSelection,
  resolveTextLanguage,
} from './language.ts';

test('ひらがなを含めば日本語と判定する', () => {
  assert.equal(detectTextLanguage('あ'), 'ja');
  assert.equal(detectTextLanguage('hello, ここに一文字だけ混ぜる'), 'ja');
});

test('カタカナを含めば日本語と判定する（長音記号・拗音を含む）', () => {
  assert.equal(detectTextLanguage('コーヒー'), 'ja');
  assert.equal(detectTextLanguage('ヴァイオリン'), 'ja');
});

test('半角カナを含めば日本語と判定する', () => {
  assert.equal(detectTextLanguage('ｱｲｳｴｵ'), 'ja');
});

test('英字のみのテキストは英語と判定する', () => {
  assert.equal(detectTextLanguage('it is a truth universally acknowledged'), 'en');
});

test('空文字は英語と判定する（かなを含まない）', () => {
  assert.equal(detectTextLanguage(''), 'en');
});

test('漢字のみのテキストはかなを含まないので英語側になる（境界ケース）', () => {
  // 判定規則は文字どおり「かなを含むか」であり、「日本語として意味が通るか」ではない
  // （language.ts先頭コメント）。純粋な漢字のみの入力はkeydistの対象テキストとしては
  // 非現実的（助詞等でかなが必ず混ざる）なので、字面どおりの規則をそのまま採る
  assert.equal(detectTextLanguage('漢字論理配列'), 'en');
});

test('全角記号・句読点だけではかなと判定しない', () => {
  assert.equal(detectTextLanguage('、。！？　１２３'), 'en');
});

test('override があればdetectedより優先する', () => {
  const selection = { detected: 'en' as const, override: 'ja' as const };
  assert.equal(resolveTextLanguage(selection), 'ja');
});

test('override が無ければdetectedを使う', () => {
  const selection = detectTextLanguageSelection('あいう');
  assert.equal(selection.detected, 'ja');
  assert.equal(selection.override, undefined);
  assert.equal(resolveTextLanguage(selection), 'ja');
});
