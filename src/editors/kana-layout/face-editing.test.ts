import assert from 'node:assert/strict';
import test from 'node:test';
import type { DraftFace } from '#input/layouts/face-layout-edit.ts';
import { buildGeometry, DEFAULT_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import { faceIndexOfPath, faceSummary, nextOutputKey, patchFace, setFaceOutput, setModifierGroup, toggleTriggerKey } from './face-editing.ts';

const SINGLE: DraftFace = { trigger: [], inputRole: 'layer', outputs: { a: 'あ' } };

test('単打の面にtriggerを足しても、打鍵の順序と持続は足さない', () => {
  const face = toggleTriggerKey(SINGLE, 'thumb-l');
  assert.deepEqual(face.trigger, ['thumb-l']);
  assert.equal(face.mode, undefined);
  assert.equal(face.triggerPersistence, undefined);
});

test('triggerを全部外すと、単打の面が持てない項目を落とす', () => {
  const face: DraftFace = {
    trigger: ['thumb-l'],
    mode: 'simultaneous',
    triggerPersistence: 'single',
    triggerOrder: 'prefix',
    layer: '左親指',
    inputRole: 'layer',
    outputs: { a: 'あ' },
  };
  assert.deepEqual(toggleTriggerKey(face, 'thumb-l'), SINGLE);
});

test('triggerのキーを外すと、そのキーの修飾の組も外す', () => {
  const face: DraftFace = {
    trigger: ['thumb-l', 'shift-l'],
    mode: 'simultaneous',
    triggerPersistence: 'hold-capable',
    inputRole: 'modifier',
    modifierGroups: { 'thumb-l': '親指', 'shift-l': 'Shift' },
    outputs: {},
  };
  assert.deepEqual(toggleTriggerKey(face, 'shift-l').modifierGroups, { 'thumb-l': '親指' });
  assert.equal(toggleTriggerKey(toggleTriggerKey(face, 'shift-l'), 'thumb-l').modifierGroups, undefined);
});

test('入力の意味を変えると、その意味の面だけが持つ項目を落とす', () => {
  const face: DraftFace = {
    trigger: ['thumb-l'],
    mode: 'simultaneous',
    triggerPersistence: 'single',
    inputRole: 'composition',
    compositionAggregation: 'layer',
    outputs: {},
  };
  assert.equal(patchFace(face, { inputRole: 'layer' }).compositionAggregation, undefined);
  assert.equal(patchFace(face, { inputRole: 'composition' }).compositionAggregation, 'layer');
});

test('前置・後置に変えると先押しの指定を落とし、同時のままなら残す', () => {
  const face: DraftFace = {
    trigger: ['thumb-l'],
    mode: 'simultaneous',
    triggerPersistence: 'single',
    triggerOrder: 'prefix',
    inputRole: 'layer',
    outputs: {},
  };
  assert.equal(patchFace(face, { mode: 'suffix' }).triggerOrder, undefined);
  assert.equal(patchFace(face, { mode: 'simultaneous' }).triggerOrder, 'prefix');
});

test('出力は空にすると消え、修飾の組は空にすると分類を外す', () => {
  assert.deepEqual(setFaceOutput(SINGLE, 'a', '').outputs, {});
  assert.deepEqual(setFaceOutput(SINGLE, 's', 'かな').outputs, { a: 'あ', s: 'かな' });
  const face: DraftFace = { trigger: ['thumb-l'], inputRole: 'modifier', outputs: {} };
  const grouped = setModifierGroup(face, 'thumb-l', '親指');
  assert.deepEqual(grouped.modifierGroups, { 'thumb-l': '親指' });
  assert.equal(setModifierGroup(grouped, 'thumb-l', '').modifierGroups, undefined);
});

test('面の一覧の名前は、単打かtriggerのキーと打鍵の順序で出す', () => {
  assert.equal(faceSummary(SINGLE), '単打');
  assert.equal(faceSummary({ ...SINGLE, trigger: ['thumb-l'] }), '左親指');
  assert.equal(faceSummary({ ...SINGLE, trigger: ['thumb-l', 'f'], mode: 'prefix' }), '左親指+F・切り替えのキーを先に打つ');
});

test('診断の位置から面の番号を取り出す', () => {
  assert.equal(faceIndexOfPath('faces[2].outputs.q'), 2);
  assert.equal(faceIndexOfPath('faces[10]'), 10);
  assert.equal(faceIndexOfPath('composition.dakuten'), undefined);
  assert.equal(faceIndexOfPath('name'), undefined);
});

const ANSI_KEYS = [...buildGeometry('row-staggered', DEFAULT_FINGER_ASSIGNMENT).keys.keys()];

test('次の出力キーは、同じ段の右隣になる', () => {
  assert.equal(nextOutputKey(ANSI_KEYS, 'a', []), 's');
});

test('次の出力キーは、段の右端から次の段の左端のキーへ進む', () => {
  assert.equal(nextOutputKey(ANSI_KEYS, ']', []), 'a');
});

test('次の出力キーは、切り替えのキーを飛ばす', () => {
  assert.equal(nextOutputKey(ANSI_KEYS, 'a', ['s']), 'd');
});

test('次の出力キーは、最後のキーと、その先が切り替えのキーだけの時は無い', () => {
  assert.equal(nextOutputKey(ANSI_KEYS, '/', []), undefined);
  assert.equal(nextOutputKey(ANSI_KEYS, 'm', [',', '.', '/']), undefined);
});

test('面の上の位置を持たないキーからは進まない', () => {
  assert.equal(nextOutputKey(ANSI_KEYS, 'thumb-l', []), undefined);
  assert.equal(nextOutputKey(ANSI_KEYS, 'shift-l', []), undefined);
});
