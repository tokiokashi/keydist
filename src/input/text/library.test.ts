import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCopiedUserText,
  deleteUserText,
  editUserTextContent,
  emptyTextLibrary,
  renameUserText,
  setUserTextLanguageOverride,
  uniqueAutoTextName,
  type TextLibrary,
} from './library.ts';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `text-${idCounter}`;
}

/** テスト用の最小ヘルパー: 空のテキストを1件作る（旧`createUserText`相当）。 */
function withOneText(text = '', name = '新しいテキスト'): TextLibrary {
  idCounter = 0;
  return appendCopiedUserText(emptyTextLibrary(), nextId, { text, name }).library;
}

test('appendCopiedUserText: 既存の内容を新しいユーザーテキストとして足す', () => {
  idCounter = 0;
  const { library, created } = appendCopiedUserText(
    emptyTextLibrary(),
    nextId,
    { text: '吾輩は猫である', name: '旧文' },
  );
  assert.equal(library.texts.length, 1);
  assert.equal(created.text, '吾輩は猫である');
  assert.equal(created.name, '旧文');
});

test('appendCopiedUserText: 空文字列を渡せば「新規作成」相当になる', () => {
  idCounter = 0;
  const { library, created } = appendCopiedUserText(emptyTextLibrary(), nextId, { text: '', name: '新しいテキスト' });
  assert.deepEqual(library.texts[0], { id: 'text-1', name: '新しいテキスト', text: '' });
  assert.equal(created.text, '');
});

test('appendCopiedUserText: nameを明示すればそちらを使う', () => {
  idCounter = 0;
  const { created } = appendCopiedUserText(
    emptyTextLibrary(),
    nextId,
    { text: 'hello', name: '英文' },
    '英文のコピー',
  );
  assert.equal(created.name, '英文のコピー');
});

test('appendCopiedUserText: languageOverrideも引き継ぐ', () => {
  idCounter = 0;
  const { created } = appendCopiedUserText(
    emptyTextLibrary(),
    nextId,
    { text: 'テスト', name: '手動指定テキスト', languageOverride: 'en' },
  );
  assert.equal(created.languageOverride, 'en');
});

test('deleteUserText: 存在するidを削除する', () => {
  const created = withOneText();
  const deleted = deleteUserText(created, 'text-1');
  assert.equal(deleted.texts.length, 0);
});

test('deleteUserText: 存在しないidの削除は何もしない（同一参照を返す）', () => {
  const library = emptyTextLibrary();
  const result = deleteUserText(library, 'no-such-id');
  assert.equal(result, library);
});

test('renameUserText: 名前を変える', () => {
  const created = withOneText();
  const renamed = renameUserText(created, 'text-1', '新しい名前');
  assert.equal(renamed.texts[0]!.name, '新しい名前');
});

test('renameUserText: 既に同じ名前なら同一参照を返す', () => {
  const created = withOneText('', '名前');
  const result = renameUserText(created, 'text-1', '名前');
  assert.equal(result, created);
});

test('renameUserText: 存在しないidは同一参照を返す', () => {
  const library = emptyTextLibrary();
  const result = renameUserText(library, 'no-such-id', '名前');
  assert.equal(result, library);
});

test('editUserTextContent: 本文をその場で書き換える', () => {
  const created = withOneText();
  const edited = editUserTextContent(created, 'text-1', 'あいうえお');
  assert.equal(edited.texts[0]!.text, 'あいうえお');
  assert.equal(edited.texts[0]!.id, 'text-1', '同じidのまま書き換わる（新規作成にならない）');
});

test('editUserTextContent: 同じ本文なら同一参照を返す', () => {
  const created = withOneText('hello');
  const result = editUserTextContent(created, 'text-1', 'hello');
  assert.equal(result, created);
});

test('setUserTextLanguageOverride: 手動上書きを設定・解除できる', () => {
  const created = withOneText('テスト');
  const overridden = setUserTextLanguageOverride(created, 'text-1', 'en');
  assert.equal(overridden.texts[0]!.languageOverride, 'en');

  const cleared = setUserTextLanguageOverride(overridden, 'text-1', undefined);
  assert.equal(cleared.texts[0]!.languageOverride, undefined);
  assert.equal('languageOverride' in cleared.texts[0]!, false, 'フィールド自体が消える');
});

test('setUserTextLanguageOverride: 既に同じ値なら同一参照を返す', () => {
  const created = withOneText();
  const result = setUserTextLanguageOverride(created, 'text-1', undefined);
  assert.equal(result, created);
});

test('uniqueAutoTextName: 重複が無ければそのまま返す', () => {
  const library = emptyTextLibrary();
  assert.equal(uniqueAutoTextName(library, '新しいテキスト'), '新しいテキスト');
});

test('uniqueAutoTextName: 重複していれば連番を振る', () => {
  idCounter = 0;
  const { library } = appendCopiedUserText(emptyTextLibrary(), nextId, { text: '', name: '新しいテキスト' });
  assert.equal(uniqueAutoTextName(library, '新しいテキスト'), '新しいテキスト 2');
});

test('uniqueAutoTextName: 連番も埋まっていれば次の番号へ進む', () => {
  idCounter = 0;
  let library = appendCopiedUserText(emptyTextLibrary(), nextId, { text: '', name: '新しいテキスト' }).library;
  library = appendCopiedUserText(library, nextId, { text: '', name: '新しいテキスト 2' }).library;
  assert.equal(uniqueAutoTextName(library, '新しいテキスト'), '新しいテキスト 3');
});
