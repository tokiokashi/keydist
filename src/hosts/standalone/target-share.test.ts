import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import type { Layout } from '#input/layouts/types.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import {
  SHARE_MAX_REF_LENGTH,
  SHARE_MAX_TARGETS,
  decodeMultiTargetsFromUrl,
  decodeSingleTargetFromUrl,
  describeSharedTargetsNotice,
  describeShareEncodeNotice,
  encodeMultiTargetsToUrl,
  encodeSingleTargetToUrl,
  hasSharedTargetParams,
  type TargetShareSource,
} from './target-share.ts';

const shapes = new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape]));

/** 組み込みの配列に、自作の配列を1つ足した手持ち。 */
function source(setups: readonly Setup[] = []): TargetShareSource {
  const mine: Layout = { ...LAYOUT_BY_ID.get('qwerty')!, id: 'user-1', name: '自作,配列' };
  return {
    layouts: new Map([...LAYOUT_BY_ID, [mine.id, mine]]),
    userLayoutIds: new Set([mine.id]),
    shapes,
    setups,
  };
}

const QWERTY: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
const DVORAK: AnalysisTarget = { kind: 'layout', layoutId: 'dvorak' };
const MINE: AnalysisTarget = { kind: 'layout', layoutId: 'user-1' };
const setupA: Setup = { id: 'uuid-a', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered', label: '仕事用' };
const setupB: Setup = { id: 'uuid-b', number: 2, layoutId: 'dvorak', shapeId: 'row-staggered' };

test('組み込みの配列はidで、自作の配列とSetupは名前だけで載せる（内部のidを運ばない）', () => {
  const src = source([setupA, setupB]);
  const { params } = encodeMultiTargetsToUrl(
    [DVORAK, MINE, { kind: 'setup', setupId: 'uuid-a' }, { kind: 'setup', setupId: 'uuid-b' }],
    undefined,
    src,
  );
  assert.deepEqual(params.getAll('targets'), ['layout:dvorak', 'user-layout:自作,配列', 'setup:仕事用', `setup:Dvorak/${shapes.get('row-staggered')!.name}`]);
  assert.ok(!params.toString().includes('uuid'));
  assert.ok(!params.toString().includes('user-1'));
});

test('Multiは並び順ごと往復し、基準は集合に含まれる時だけ運ばれる', () => {
  const src = source([setupA]);
  const targets: AnalysisTarget[] = [DVORAK, QWERTY, { kind: 'setup', setupId: 'uuid-a' }, MINE];
  const { params } = encodeMultiTargetsToUrl(targets, QWERTY, src);
  // 受け取った側が別のid（別のSetup id）を持っていても、名前で同じものに当たる。
  const other = source([{ ...setupA, id: 'other-uuid' }]);
  const decoded = decodeMultiTargetsFromUrl(new URLSearchParams(params.toString()), other, []);
  assert.deepEqual(decoded.targets, [DVORAK, QWERTY, { kind: 'setup', setupId: 'other-uuid' }, MINE]);
  assert.deepEqual(decoded.baseline, QWERTY);
  assert.deepEqual(decoded.notice, { notFound: [], unreadable: 0 });

  // 集合に含まれない基準は効かないので捨てる。
  const outside = new URLSearchParams([['targets', 'layout:dvorak'], ['baseline', 'layout:qwerty']]);
  assert.equal(decodeMultiTargetsFromUrl(outside, src, []).baseline, undefined);
});

test('受け取った側に無い自作の配列・Setupは、名前を添えて見つからないと返し、残りは取り込む', () => {
  const params = new URLSearchParams([
    ['targets', 'layout:qwerty'],
    ['targets', 'setup:どこにも無い'],
    ['targets', 'user-layout:消した配列'],
    ['targets', 'setup:どこにも無い'],
    ['targets', 'layout:no-such-builtin'],
  ]);
  const decoded = decodeMultiTargetsFromUrl(params, source(), []);
  assert.deepEqual(decoded.targets, [QWERTY]);
  assert.deepEqual(decoded.notice.notFound, [
    { kind: 'setup', name: 'どこにも無い' },
    { kind: 'user-layout', name: '消した配列' },
  ]);
  assert.equal(decoded.notice.unreadable, 1);
  assert.deepEqual(describeSharedTargetsNotice(decoded.notice), [
    '共有されたSetup「どこにも無い」・自作の配列「消した配列」は、この端末に見つかりませんでした',
    '共有リンクの対象のうち、読み取れないものがありました（1件）',
  ]);
});

test('自作の名前でも組み込みのidに化けさせない（user-layoutは自作の配列だけ、layoutは組み込みだけを引く）', () => {
  assert.equal(decodeSingleTargetFromUrl(new URLSearchParams([['target', 'layout:user-1']]), source(), []).target, undefined);
  assert.equal(decodeSingleTargetFromUrl(new URLSearchParams([['target', 'user-layout:QWERTY']]), source(), []).target, undefined);
  assert.deepEqual(decodeSingleTargetFromUrl(new URLSearchParams([['target', 'user-layout:自作,配列']]), source(), []).target, MINE);
});

test('Singleは1件だけ載せ、手持ちに無い対象は何も載せない', () => {
  const src = source([setupA]);
  assert.equal(encodeSingleTargetToUrl(DVORAK, src).params.get('target'), 'layout:dvorak');
  assert.equal(encodeSingleTargetToUrl({ kind: 'setup', setupId: 'gone' }, src).params.toString(), '');
  assert.equal(encodeSingleTargetToUrl({ kind: 'layout', layoutId: 'gone' }, src).params.toString(), '');
});

test('壊れた参照・長すぎる参照・件数超過は捨てて診断を積み、残りは読む（サイズの上限）', () => {
  const diagnostics: { path: string; message: string }[] = [];
  const params = new URLSearchParams([
    ['targets', 'layout:qwerty'],
    ['targets', 'qwerty'],
    ['targets', 'setup:'],
    ['targets', `setup:${'あ'.repeat(SHARE_MAX_REF_LENGTH)}`],
    ['targets', 'layout:dvorak'],
  ]);
  const decoded = decodeMultiTargetsFromUrl(params, source(), diagnostics);
  assert.deepEqual(decoded.targets, [QWERTY, DVORAK]);
  assert.equal(decoded.notice.unreadable, 3);
  assert.equal(diagnostics.length, 3);

  const many = new URLSearchParams();
  for (let i = 0; i < SHARE_MAX_TARGETS + 5; i++) many.append('targets', i % 2 === 0 ? 'layout:qwerty' : 'layout:dvorak');
  const capped = decodeMultiTargetsFromUrl(many, source(), []);
  assert.equal(capped.notice.unreadable, 5);
  // 重複は先に出たものだけ。
  assert.deepEqual(capped.targets, [QWERTY, DVORAK]);
});

test('パラメータが無ければ取り込む対象は無い。画面ごとに読むパラメータが違う', () => {
  assert.equal(decodeMultiTargetsFromUrl(new URLSearchParams('columns=x'), source(), []).present, false);
  assert.equal(decodeSingleTargetFromUrl(new URLSearchParams('targets=layout:qwerty'), source(), []).present, false);
  assert.equal(hasSharedTargetParams('?target=layout:qwerty', 'single'), true);
  assert.equal(hasSharedTargetParams('?target=layout:qwerty', 'multi'), false);
  assert.equal(hasSharedTargetParams('?baseline=layout:qwerty', 'multi'), true);
});

test('見つからない名前が多い時は先頭の数件だけ名前を出し、残りは件数にする', () => {
  const lines = describeSharedTargetsNotice({
    notFound: ['a', 'b', 'c', 'd', 'e'].map((name) => ({ kind: 'setup' as const, name })),
    unreadable: 0,
  });
  assert.deepEqual(lines, ['共有されたSetup「a」・Setup「b」・Setup「c」ほか2件は、この端末に見つかりませんでした']);
});

test('載らない対象（削除済み・名前が長すぎる・件数超過）は理由ごとに返し、載る対象だけをURLに置く', () => {
  const longSetup: Setup = { id: 'uuid-long', number: 3, layoutId: 'qwerty', shapeId: 'row-staggered', label: 'あ'.repeat(SHARE_MAX_REF_LENGTH) };
  const justFits: Setup = { id: 'uuid-fit', number: 4, layoutId: 'qwerty', shapeId: 'row-staggered', label: 'い'.repeat(SHARE_MAX_REF_LENGTH - 'setup:'.length) };
  const src = source([setupA, longSetup, justFits]);
  const { params, notice } = encodeMultiTargetsToUrl(
    [
      DVORAK,
      { kind: 'setup', setupId: 'gone' },
      { kind: 'layout', layoutId: 'gone' },
      { kind: 'setup', setupId: 'uuid-long' },
      { kind: 'setup', setupId: 'uuid-fit' },
      MINE,
    ],
    undefined,
    src,
  );
  assert.deepEqual(params.getAll('targets').length, 3);
  assert.equal(notice.missing, 2);
  assert.deepEqual(notice.tooLong, [{ kind: 'setup', name: longSetup.label }]);
  assert.equal(notice.overLimit, 0);
  assert.deepEqual(notice.nameOnlyLayouts, ['自作,配列']);
  // 載せたものは、受け取った側で読み戻せる（上限ぎりぎりの名前も落ちない）。
  const decoded = decodeMultiTargetsFromUrl(new URLSearchParams(params.toString()), src, []);
  assert.equal(decoded.notice.unreadable, 0);
  assert.equal(decoded.targets.length, 3);
});

test('件数の上限を超えた分は載せず、超えた件数を返す。載らなかった対象を基準にしても運ばない', () => {
  const targets: AnalysisTarget[] = [];
  const src = source();
  for (let i = 0; i < SHARE_MAX_TARGETS; i++) targets.push(i % 2 === 0 ? QWERTY : DVORAK);
  const extra: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };
  const { params, notice } = encodeMultiTargetsToUrl([...targets, extra, extra], extra, src);
  assert.equal(params.getAll('targets').length, SHARE_MAX_TARGETS);
  assert.equal(notice.overLimit, 2);
  assert.equal(params.has('baseline'), false);
});

test('載らない対象が無い時は、送る側へ示す文が出ない（組み込みの配列だけ・Setupが手持ちにある）', () => {
  const src = source([setupA]);
  const { notice } = encodeMultiTargetsToUrl([DVORAK, QWERTY, { kind: 'setup', setupId: 'uuid-a' }], QWERTY, src);
  assert.deepEqual(describeShareEncodeNotice(notice), []);
  assert.deepEqual(describeShareEncodeNotice(encodeSingleTargetToUrl(DVORAK, src).notice), []);
});

test('送る側へ示す文は、載らなかった対象と名前だけが載る自作の配列を分けて書き、長い名前は切る', () => {
  const longSetup: Setup = { id: 'uuid-long', number: 3, layoutId: 'qwerty', shapeId: 'row-staggered', label: 'あ'.repeat(SHARE_MAX_REF_LENGTH) };
  const src = source([longSetup]);
  const { notice } = encodeMultiTargetsToUrl(
    [{ kind: 'setup', setupId: 'gone' }, { kind: 'setup', setupId: 'uuid-long' }, MINE],
    undefined,
    src,
  );
  assert.deepEqual(describeShareEncodeNotice(notice), [
    '削除済みの対象（1件）はリンクに載りませんでした',
    `名前が長すぎるSetup「${'あ'.repeat(20)}…」はリンクに載りませんでした`,
    '自作の配列「自作,配列」は名前だけがリンクに載ります。受け取った側に同じ名前の配列が無いと開けません',
  ]);
  const single = encodeSingleTargetToUrl({ kind: 'setup', setupId: 'uuid-long' }, src);
  assert.equal(single.params.toString(), '');
  assert.equal(single.notice.tooLong.length, 1);
});
