import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialStandaloneText,
  standaloneTextLanguage,
  withStandaloneLanguageOverride,
  withStandaloneText,
} from './standalone-text.ts';

test('initialStandaloneText: 既定はサンプルの「吾輩は猫である」（ja.legacy）で、日本語と自動判定される', () => {
  const state = initialStandaloneText();
  assert.ok(state.text.length > 0);
  assert.equal(state.language.detected, 'ja');
  assert.equal(state.language.override, undefined);
  assert.equal(standaloneTextLanguage(state), 'ja');
});

test('withStandaloneText: テキストが変わると言語を再判定し、手動上書きは引き継がない', () => {
  const withOverride = withStandaloneLanguageOverride(initialStandaloneText(), 'en');
  assert.equal(withOverride.language.override, 'en');

  const next = withStandaloneText(withOverride, 'hello world');
  assert.equal(next.text, 'hello world');
  assert.equal(next.language.detected, 'en');
  assert.equal(next.language.override, undefined);
});

test('withStandaloneText: 同じテキストなら同一参照を返す（no-op判定用）', () => {
  const state = initialStandaloneText();
  assert.equal(withStandaloneText(state, state.text), state);
});

test('withStandaloneLanguageOverride: 同じ上書きなら同一参照を返す', () => {
  const state = initialStandaloneText();
  assert.equal(withStandaloneLanguageOverride(state, undefined), state);
  const overridden = withStandaloneLanguageOverride(state, 'en');
  assert.equal(withStandaloneLanguageOverride(overridden, 'en'), overridden);
});

test('withStandaloneLanguageOverride: undefinedで自動判定へ戻す', () => {
  const state = initialStandaloneText();
  const overridden = withStandaloneLanguageOverride(state, 'en');
  assert.equal(standaloneTextLanguage(overridden), 'en');
  const reverted = withStandaloneLanguageOverride(overridden, undefined);
  assert.equal(standaloneTextLanguage(reverted), state.language.detected);
});
