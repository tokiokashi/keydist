import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerBands, fingerTone } from './finger-bands.ts';

test('基本の指だけが担当するキーは帯を持たない', () => {
  assert.deepEqual(fingerBands('LI', ['LI']), []);
});

test('手の並びで基本の指より左の指は左端、右の指は右端、親指は下端に置く', () => {
  const bands = fingerBands('RI', ['RI', 'LI', 'RM', 'RT']);
  assert.deepEqual(
    bands.map(({ edge, tone }) => [edge, tone]),
    [
      ['left', fingerTone('LI')],
      ['right', fingerTone('RM')],
      ['bottom', 'muted'],
    ],
  );
});

test('同じ側に複数の指がある時は、手の並びの順に端から内側へ詰める。左端は左の指から、右端は右の指から', () => {
  // 右人差し指が基本のキー。右側は右中指・右薬指、左側は左小指・左薬指
  const bands = fingerBands('RI', ['RI', 'RR', 'LR', 'RM', 'LP']);
  const at = (edge: string, depth: number) => bands.find((band) => band.edge === edge && band.depth === depth)?.label;
  assert.equal(at('left', 0), '左小指');
  assert.equal(at('left', 1), '左薬指');
  assert.equal(at('right', 0), '右薬指');
  assert.equal(at('right', 1), '右中指');
});

test('基本の指が左の端の指なら、左端の帯は無い。両手の親指は下端に手の並びの順に積む', () => {
  const bands = fingerBands('LP', ['LP', 'RT', 'LT', 'RM']);
  assert.equal(
    bands.some((band) => band.edge === 'left'),
    false,
  );
  assert.deepEqual(
    bands.filter((band) => band.edge === 'bottom').map(({ depth, label }) => [depth, label]),
    [
      [0, '左親指'],
      [1, '右親指'],
    ],
  );
  assert.equal(bands.filter((band) => band.edge === 'right').length, 1);
});

test('指の色の番号は、親指以外の指を手の並びの順に1から8で数え、親指は持たない', () => {
  assert.deepEqual(
    ['LP', 'LR', 'LM', 'LI', 'RI', 'RM', 'RR', 'RP'].map((finger) => fingerTone(finger as 'LP')),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(fingerTone('LT'), undefined);
  assert.equal(fingerTone('RT'), undefined);
});
