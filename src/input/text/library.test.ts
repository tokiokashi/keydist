import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCopiedUserText,
  createUserText,
  deleteUserText,
  editUserTextContent,
  emptyTextLibrary,
  renameUserText,
  setUserTextLanguageOverride,
} from './library.ts';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `text-${idCounter}`;
}

test('createUserText: 新しいユーザーテキストが空で追加される', () => {
  idCounter = 0;
  const library = createUserText(emptyTextLibrary(), nextId);
  assert.equal(library.texts.length, 1);
  assert.deepEqual(library.texts[0], { id: 'text-1', name: '新しいテキスト', text: '' });
});

test('createUserText: text・nameを指定できる', () => {
  idCounter = 0;
  const library = createUserText(emptyTextLibrary(), nextId, 'hello', 'マイテキスト');
  assert.deepEqual(library.texts[0], { id: 'text-1', name: 'マイテキスト', text: 'hello' });
});

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
  idCounter = 0;
  const created = createUserText(emptyTextLibrary(), nextId);
  const deleted = deleteUserText(created, 'text-1');
  assert.equal(deleted.texts.length, 0);
});

test('deleteUserText: 存在しないidの削除は何もしない（同一参照を返す）', () => {
  const library = emptyTextLibrary();
  const result = deleteUserText(library, 'no-such-id');
  assert.equal(result, library);
});

test('renameUserText: 名前を変える', () => {
  idCounter = 0;
  const created = createUserText(emptyTextLibrary(), nextId);
  const renamed = renameUserText(created, 'text-1', '新しい名前');
  assert.equal(renamed.texts[0]!.name, '新しい名前');
});

test('renameUserText: 既に同じ名前なら同一参照を返す', () => {
  idCounter = 0;
  const created = createUserText(emptyTextLibrary(), nextId, '', '名前');
  const result = renameUserText(created, 'text-1', '名前');
  assert.equal(result, created);
});

test('renameUserText: 存在しないidは同一参照を返す', () => {
  const library = emptyTextLibrary();
  const result = renameUserText(library, 'no-such-id', '名前');
  assert.equal(result, library);
});

test('editUserTextContent: 本文をその場で書き換える', () => {
  idCounter = 0;
  const created = createUserText(emptyTextLibrary(), nextId);
  const edited = editUserTextContent(created, 'text-1', 'あいうえお');
  assert.equal(edited.texts[0]!.text, 'あいうえお');
  assert.equal(edited.texts[0]!.id, 'text-1', '同じidのまま書き換わる（新規作成にならない）');
});

test('editUserTextContent: 同じ本文なら同一参照を返す', () => {
  idCounter = 0;
  const created = createUserText(emptyTextLibrary(), nextId, 'hello');
  const result = editUserTextContent(created, 'text-1', 'hello');
  assert.equal(result, created);
});

test('setUserTextLanguageOverride: 手動上書きを設定・解除できる', () => {
  idCounter = 0;
  const created = createUserText(emptyTextLibrary(), nextId, 'テスト');
  const overridden = setUserTextLanguageOverride(created, 'text-1', 'en');
  assert.equal(overridden.texts[0]!.languageOverride, 'en');

  const cleared = setUserTextLanguageOverride(overridden, 'text-1', undefined);
  assert.equal(cleared.texts[0]!.languageOverride, undefined);
  assert.equal('languageOverride' in cleared.texts[0]!, false, 'フィールド自体が消える');
});

test('setUserTextLanguageOverride: 既に同じ値なら同一参照を返す', () => {
  idCounter = 0;
  const created = createUserText(emptyTextLibrary(), nextId);
  const result = setUserTextLanguageOverride(created, 'text-1', undefined);
  assert.equal(result, created);
});
