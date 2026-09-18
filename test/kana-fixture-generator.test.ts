import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import {
  type SourceManifest,
  validateSourceManifest,
} from '../scripts/generate-kana-fixtures.ts';

const SOURCE_ROW_WIDTHS = [13, 12, 12, 11] as const;

function makeManifest(): SourceManifest {
  return {
    version: 1,
    layoutId: 'test-layout',
    source: {
      url: 'https://example.com/source',
      sha: 'test-sha',
      path: 'source.txt',
      transform: 'test',
    },
    faces: [{
      trigger: [],
      mode: 'simultaneous',
      rows: SOURCE_ROW_WIDTHS.map((width) => Array<string>(width).fill('')),
    }],
    omissions: [],
  };
}

test('現在のかな source manifest は omission 完全性検証を通る（#201）', () => {
  const sourceDir = new URL('./fixtures/sources/', import.meta.url);
  const fileNames = readdirSync(sourceDir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  assert.ok(fileNames.length > 0);
  for (const fileName of fileNames) {
    const manifest = JSON.parse(
      readFileSync(new URL(fileName, sourceDir), 'utf8'),
    ) as SourceManifest;
    assert.doesNotThrow(() => validateSourceManifest(fileName, manifest));
  }
});

test('ANSI対象外の非空セルに omission が無ければ失敗する（#201）', () => {
  const manifest = makeManifest();
  manifest.faces[0].rows[0][12] = '」';

  assert.throws(
    () => validateSourceManifest('missing.json', manifest),
    /ANSI対象外の非空セルに omissions が無い/,
  );
});

test('ANSI対象外の非空セルは対応する omission があれば通る（#201）', () => {
  const manifest = makeManifest();
  manifest.faces[0].rows[0][12] = '」';
  manifest.omissions.push({
    faceIndex: 0,
    row: 0,
    column: 12,
    value: '」',
    reason: 'jis-only-key',
  });

  assert.doesNotThrow(() => validateSourceManifest('covered.json', manifest));
});

test('同じセルの omission 重複指定は失敗する（#201）', () => {
  const manifest = makeManifest();
  const omission = {
    faceIndex: 0,
    row: 3,
    column: 10,
    value: '・',
    reason: 'jis-only-key' as const,
  };
  manifest.omissions.push(omission, { ...omission });

  assert.throws(
    () => validateSourceManifest('duplicate.json', manifest),
    /除外が重複している/,
  );
});

test('値の無い不要な omission は失敗する（#201）', () => {
  const manifest = makeManifest();
  manifest.omissions.push({
    faceIndex: 0,
    row: 3,
    column: 10,
    value: '',
    reason: 'jis-only-key',
  });

  assert.throws(
    () => validateSourceManifest('empty-value.json', manifest),
    /除外値が空/,
  );
});

test('ANSI対象外セルと omission の値が食い違えば失敗する（#201）', () => {
  const manifest = makeManifest();
  manifest.faces[0].rows[3][10] = '・';
  manifest.omissions.push({
    faceIndex: 0,
    row: 3,
    column: 10,
    value: '￥',
    reason: 'jis-only-key',
  });

  assert.throws(
    () => validateSourceManifest('mismatch.json', manifest),
    /ANSI対象外セルの値と omissions\.value が一致しない/,
  );
});

test('未定義の omission reason は失敗する（#201）', () => {
  const manifest = makeManifest();
  (manifest.omissions as Array<{
    faceIndex: number;
    row: number;
    column: number;
    value: string;
    reason: string;
  }>).push({
    faceIndex: 0,
    row: 3,
    column: 10,
    value: '・',
    reason: 'unknown-reason',
  });

  assert.throws(
    () => validateSourceManifest('unknown-reason.json', manifest),
    /未定義の除外理由 unknown-reason/,
  );
});

test('ANSI対象列の omission は従来どおりセルの空欄化を必須にする（#201）', () => {
  const manifest = makeManifest();
  manifest.faces[0].rows[0][0] = 'ヶ';
  manifest.omissions.push({
    faceIndex: 0,
    row: 0,
    column: 0,
    value: 'ヶ',
    reason: 'source-only',
  });

  assert.throws(
    () => validateSourceManifest('target-cell.json', manifest),
    /ANSI対象列の除外セルが空欄になっていない/,
  );
});
