import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playbackOptions } from './options.ts';
import { PLAYBACK_SETTINGS_SECTIONS } from './settings-sections.ts';

// 数値が変わる項目（extract）は「計算」、見た目だけの項目（view）は「見た目」に、ちょうど1回ずつ置く。
const SECTION_OF_AFFECT = { extract: 'calculation', view: 'appearance' } as const;

test('打鍵再生の解析設定の項目は、affectsに合う節にちょうど1回ずつ置かれる', () => {
  const placed = new Map<string, string[]>();
  for (const section of PLAYBACK_SETTINGS_SECTIONS) {
    for (const group of section.groups) {
      for (const key of group.keys) placed.set(key, [...(placed.get(key) ?? []), section.id]);
    }
  }
  const items: Readonly<Record<string, { readonly affects: 'extract' | 'view' }>> = playbackOptions.items;
  for (const [key, def] of Object.entries(items)) {
    assert.deepEqual(placed.get(key), [SECTION_OF_AFFECT[def.affects]], `${key}（${def.affects}）の置き場`);
  }
  for (const key of placed.keys()) assert.ok(key in items, `${key}は項目として存在しない`);
});

test('節は「計算」「見た目」の順に並ぶ', () => {
  assert.deepEqual(PLAYBACK_SETTINGS_SECTIONS.map((section) => section.title), ['計算', '見た目']);
});
