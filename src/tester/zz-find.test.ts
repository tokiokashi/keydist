import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { test } from 'node:test';
test('x', () => {
  for (const [id, l] of LAYOUT_BY_ID) {
    const full = [...l.canonicalInputs.keys()].filter((h) => /[！（）？]/.test(h));
    const half = [...l.canonicalInputs.keys()].filter((h) => /^[!()?]$/.test(h));
    console.log('FULL', id, full.slice(0, 6).join(''), '|', half.join(''), l.romajiTable ? 'romaji' : 'kana');
  }
});
