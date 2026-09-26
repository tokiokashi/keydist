import assert from 'node:assert/strict';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';

const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
const count = (pattern: RegExp) => text.match(pattern)?.length ?? 0;

assert.ok(text.length >= 1200 && text.length <= 1800, `文字数: ${text.length}`);
assert.ok(count(/です|ます|ました|ません|ましょ/g) > 0, 'ですます系がない');
assert.ok(count(/である|だった/g) > 0, 'である系がない');
assert.ok(count(/[やゆよ]/g) > 0, '単独ヤ行がない');
assert.ok(count(/[ゃゅょ]/g) > 0, '拗音がない');
assert.ok(count(/っ/g) > 0, '促音がない');
assert.ok(count(/ん/g) > 0, '撥音がない');

console.log(JSON.stringify({
  chars: text.length,
  desuMasu: count(/です|ます|ました|ません|ましょ/g),
  dearuDatta: count(/である|だった/g),
  singleYaRow: count(/[やゆよ]/g),
  youon: count(/[ゃゅょ]/g),
  sokuon: count(/っ/g),
  hatsuon: count(/ん/g),
}));
