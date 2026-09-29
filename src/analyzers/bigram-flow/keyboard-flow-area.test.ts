import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeometry,
  JIS_FINGER_ASSIGNMENT,
  PHYSICAL_SHAPES,
  type PresetGeometryKind,
} from '#input/shapes/geometry.ts';
import {
  AREA_HEIGHT,
  AREA_PAD,
  AREA_WIDTH,
  fitKeyboardToArea,
  flowLineWidth,
  KEY_PITCH,
  repeatLabelScale,
  TALLEST_BUILTIN_SPAN_U,
  WIDEST_BUILTIN_SPAN_U,
} from './keyboard-flow-area.ts';

function span(kind: PresetGeometryKind) {
  const keys = buildGeometry(kind, kind.startsWith('jis') ? JIS_FINGER_ASSIGNMENT : undefined).grid.flat();
  const xs = keys.map((key) => key.x);
  const ys = keys.map((key) => key.y);
  return {
    x: Math.max(...xs) - Math.min(...xs),
    y: Math.max(...ys) - Math.min(...ys),
  };
}

const KINDS = Object.keys(PHYSICAL_SHAPES) as PresetGeometryKind[];

test('エリアの寸法は組み込みの物理配列の最大の広がりに一致する（増減・変形したらここが落ちる）', () => {
  const spans = KINDS.map(span);
  assert.equal(Math.max(...spans.map((s) => s.x)), WIDEST_BUILTIN_SPAN_U);
  assert.ok(Math.abs(Math.max(...spans.map((s) => s.y)) - TALLEST_BUILTIN_SPAN_U) < 1e-9);
});

test('組み込みの物理配列はどれも縮めずエリアの中央に収まる', () => {
  for (const kind of KINDS) {
    const { x, y } = span(kind);
    const fit = fitKeyboardToArea(x, y);
    assert.equal(fit.shrink, 1, kind);
    assert.ok(fit.originX >= AREA_PAD - 1e-9, kind);
    assert.ok(fit.originY >= AREA_PAD - 1e-9, kind);
    // 左右・上下の余白が等しい＝中央
    assert.ok(Math.abs(fit.originX - (AREA_WIDTH - (fit.originX + x * KEY_PITCH))) < 1e-9, kind);
    assert.ok(Math.abs(fit.originY - (AREA_HEIGHT - (fit.originY + y * KEY_PITCH))) < 1e-9, kind);
  }
});

test('自作の物理配列がエリアに収まらない時だけ、縦横比を保って縮める', () => {
  const wide = fitKeyboardToArea(WIDEST_BUILTIN_SPAN_U * 2, 1);
  assert.equal(wide.shrink, 0.5);
  const tall = fitKeyboardToArea(4, TALLEST_BUILTIN_SPAN_U * 4);
  assert.ok(tall.shrink < 0.3);
  assert.equal(fitKeyboardToArea(0, 0).shrink, 1);
});

test('線は縮んでも画面上で最小の太さを下回らず、縮まない時は元の太さのまま', () => {
  assert.equal(flowLineWidth(0.5, 1), 1.25);
  assert.equal(flowLineWidth(4, 1), 4);
  assert.equal(flowLineWidth(0.5, 0.25), 5);
  assert.equal(flowLineWidth(3, 0), 3);
});

test('同キー連打のラベルは画面上で8pxを下回る幅では拡大して読める大きさを保つ', () => {
  assert.ok(repeatLabelScale(1) > 1 && repeatLabelScale(1) < 1.3);
  assert.equal(repeatLabelScale(2), 1);
  assert.ok(repeatLabelScale(0.4) > 3);
  assert.equal(repeatLabelScale(0), 1);
});
