import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSequentialDeclaration, parseSubstitution, readDvorakJHeading, type HeadingContext, type HeadingResult } from './dvorakj-heading.ts';

const sequential: HeadingContext = { substitutions: [], sequential: true };
const simultaneous: HeadingContext = { substitutions: [], sequential: false };

const facesOf = (results: HeadingResult[]) =>
  results.map((result) =>
    result.kind === 'face' ? { steps: result.steps, cell: result.cell, mode: result.mode, unrepresentable: result.kanaUnrepresentable } : result,
  );

test('1行目に「順」か「逐次」を含む宣言は順の打鍵、含まなければ同時の打鍵', () => {
  assert.equal(isSequentialDeclaration('順に打鍵する配列'), true);
  assert.equal(isSequentialDeclaration('順にも同時にも打鍵する配列'), true);
  assert.equal(isSequentialDeclaration('逐次打鍵'), true);
  assert.equal(isSequentialDeclaration('同時に打鍵する配列'), false);
  assert.equal(isSequentialDeclaration('-option-input['), false);
});

test('順の打鍵のファイルは、括弧の外のキーを1打ずつ、閉じていない括弧の中のキーを同時押しの1打にする', () => {
  assert.deepEqual(facesOf(readDvorakJHeading('-14', false, sequential)), [{ steps: [['t']], cell: 'after', mode: 'prefix', unrepresentable: false }]);
  assert.deepEqual(facesOf(readDvorakJHeading('-17-33', false, sequential)), [
    { steps: [['i'], [',']], cell: 'after', mode: 'simultaneous', unrepresentable: true },
  ]);
  assert.deepEqual(facesOf(readDvorakJHeading('(+20+21', false, sequential)), [
    { steps: [['d', 'f']], cell: 'with-last', mode: 'simultaneous', unrepresentable: false },
  ]);
  // 閉じていない括弧の前の打鍵は、その後に1打として残る
  assert.deepEqual(facesOf(readDvorakJHeading('-14_(-20-21', false, sequential)), [
    { steps: [['t'], ['d', 'f']], cell: 'with-last', mode: 'simultaneous', unrepresentable: true },
  ]);
  // 先に打つ表は、セルのキーを括弧の前に置く
  assert.deepEqual(facesOf(readDvorakJHeading('(-20-21', true, sequential)), [
    { steps: [['d', 'f']], cell: 'before', mode: 'simultaneous', unrepresentable: true },
  ]);
  assert.deepEqual(facesOf(readDvorakJHeading('-14', true, sequential)), [{ steps: [['t']], cell: 'before', mode: 'suffix', unrepresentable: false }]);
});

test('同時の打鍵のファイルは、見出しのキー全部とセルのキーを1つの同時押しにする', () => {
  assert.deepEqual(facesOf(readDvorakJHeading('-14', false, simultaneous)), [
    { steps: [['t']], cell: 'with-last', mode: 'simultaneous', unrepresentable: false },
  ]);
  assert.deepEqual(facesOf(readDvorakJHeading('(-20-21', false, simultaneous)), [
    { steps: [['d', 'f']], cell: 'with-last', mode: 'simultaneous', unrepresentable: false },
  ]);
  assert.deepEqual(facesOf(readDvorakJHeading('-14', true, simultaneous)), [
    { steps: [['t']], cell: 'with-last', mode: 'simultaneous', unrepresentable: false },
  ]);
});

test('見出しが空、または末尾のカンマで空の項目がある時は、切り替えのキーの無い面を足す', () => {
  assert.deepEqual(facesOf(readDvorakJHeading('', false, sequential)), [{ steps: [], cell: 'with-last', mode: 'simultaneous', unrepresentable: false }]);
  assert.deepEqual(
    facesOf(readDvorakJHeading('-14,', false, simultaneous)).map((face) => ('steps' in face ? face.steps : face)),
    [[['t']], []],
  );
});

test('解決できないキーは名前を返し、解決できる項目は残す', () => {
  const results = readDvorakJHeading('-shift, +73, -f', false, simultaneous);
  assert.deepEqual(
    results.map((result) => (result.kind === 'face' ? result.trigger : result.key)),
    [['shift-l'], ['shift-r'], '73', 'f'],
  );
  assert.equal(readDvorakJHeading('(12', false, sequential)[0].kind, 'unresolved');
});

test('別名は定義の逆順に置き換え、センターシフトの{S}はspaceを指す', () => {
  const substitutions = [parseSubstitution('{S} | +shift'), parseSubstitution('{F} | -21')].filter((entry) => entry !== undefined);
  assert.deepEqual(substitutions, [
    ['{S}', '+space'],
    ['{F}', '-21'],
  ]);
  assert.deepEqual(
    readDvorakJHeading('({S}{F}', false, { substitutions, sequential: true }).map((result) => (result.kind === 'face' ? result.trigger : result.key)),
    [['space', 'f']],
  );
  assert.equal(parseSubstitution('{x}'), undefined);
  assert.equal(parseSubstitution('| 12'), undefined);
});
