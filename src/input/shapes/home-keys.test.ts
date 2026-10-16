import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignmentWithHomeKeys,
  buildGeometry,
  DEFAULT_FINGER_ASSIGNMENT,
  PHYSICAL_SHAPES,
} from './geometry.ts';
import { toLayout, type UserLayout } from '../layouts/user-layouts.ts';

test('配列側のホームキーを運指へ適用し、未知のキーは無視する', () => {
  const assignment = assignmentWithHomeKeys(DEFAULT_FINGER_ASSIGNMENT, {
    LM: 'd',
    LI: 'not-a-key',
  });
  const geometry = buildGeometry(PHYSICAL_SHAPES['row-staggered'], assignment);
  assert.equal(geometry.assignment.homeKey.LM, 'd');
  assert.equal(geometry.assignment.homeKey.LI, DEFAULT_FINGER_ASSIGNMENT.homeKey.LI);
});

test('通常の自作配列でもhomeKeysをLayoutへ保持する', () => {
  const def: UserLayout = {
    id: 'home-key-layout',
    name: 'ホームキー付き',
    rows: ['', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
    romaji: 'kunrei',
    homeKeys: { LM: 's', RM: 'l' },
  };
  const layout = toLayout(def);
  assert.deepEqual(layout.homeKeys, def.homeKeys);
});
