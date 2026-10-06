import test from 'node:test';
import assert from 'node:assert/strict';
import { kunrei } from '#input/romaji/kunrei.ts';
import {
  liveRomajiContextSatisfied,
  romajiToKana,
  romajiTypingCorrectness,
} from './live-romaji.ts';

const table = kunrei();

test('romajiToKanaはlive roman streamを最長一致でかなへ戻す', () => {
  assert.equal(romajiToKana('kana', table), 'かな');
  assert.equal(romajiToKana('kya', table), 'きゃ');
  assert.equal(romajiToKana('desu', table), 'です');
  assert.equal(romajiToKana('kka', table), 'っか');
  assert.equal(romajiToKana('nn', table), 'ん');
  assert.equal(romajiToKana('onnya', table), 'おんや');
});

test('romajiToKanaは未完成romanを失わない', () => {
  assert.equal(romajiToKana('k', table), 'k');
  assert.equal(romajiToKana('ky', table), 'ky');
  assert.equal(romajiToKana('ka\nk', table), 'か\nk');
});

test('youon-only live contextは直前子音がある時だけ成立する', () => {
  const requirement = [{ kind: 'youon-only' as const }];
  assert.equal(liveRomajiContextSatisfied(requirement, 'k', true), true);
  assert.equal(liveRomajiContextSatisfied(requirement, 's', true), true);
  assert.equal(liveRomajiContextSatisfied(requirement, 'n', true), true);
  assert.equal(liveRomajiContextSatisfied(requirement, 'onn', true), false);
  assert.equal(liveRomajiContextSatisfied(requirement, '', true), false);
  assert.equal(liveRomajiContextSatisfied(requirement, 'ki', true), false);
});

test('romaji-input live contextはローマ字表を持つ配列で打つ時だけ成立する', () => {
  const requirement = [{ kind: 'romaji-input' as const }];
  assert.equal(liveRomajiContextSatisfied(requirement, 'k', true), true);
  assert.equal(liveRomajiContextSatisfied(requirement, 'k', false), false);
});


test('romajiTypingCorrectnessは正しい未確定子音を誤入力扱いしない', () => {
  assert.deepEqual(romajiTypingCorrectness('k', 'か', table), [true]);
  assert.deepEqual(romajiTypingCorrectness('ky', 'きゃ', table), [true, true]);
  assert.deepEqual(romajiTypingCorrectness('かn', 'かな', table), [true, true]);
});

test('romajiTypingCorrectnessは一致したprefixだけを正解扱いする', () => {
  assert.deepEqual(romajiTypingCorrectness('s', 'か', table), [false]);
  assert.deepEqual(romajiTypingCorrectness('かs', 'かな', table), [true, false]);
  assert.deepEqual(romajiTypingCorrectness('け', 'か', table), [false]);
});
