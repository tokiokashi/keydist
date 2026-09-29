import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { filterTargetChoiceGroups, normalizeSearchText, sortTargetsByChoices, targetChoiceGroups, targetSummaryText, type TargetChoiceSource } from './target-choices.ts';
import { analysisTargetKey, type AnalysisTarget, type Setup } from '#input/setup/index.ts';

const SHAPES = new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape]));

function source(overrides: Partial<TargetChoiceSource> = {}): TargetChoiceSource {
  return { layouts: LAYOUT_BY_ID, userLayoutIds: new Set(), shapes: SHAPES, setups: [], selected: [], ...overrides };
}

const SETUPS: readonly Setup[] = [
  { id: 'a', layoutId: 'qwerty', shapeId: 'row-staggered' },
  { id: 'b', layoutId: 'tsuki-2-263', shapeId: 'row-staggered', label: '会社の月配列' },
];

test('組み込みの配列を英字とかなに分け、空の区分は出さない', () => {
  const groups = targetChoiceGroups(source());
  assert.deepEqual(groups.map((group) => group.id), ['builtin-alphabet', 'builtin-kana']);
  const [alphabet, kana] = groups;
  assert.equal(alphabet!.choices[0]!.key, 'layout:qwerty');
  assert.ok(alphabet!.choices.some((choice) => choice.name === 'Colemak-DH'));
  assert.ok(kana!.choices.some((choice) => choice.key === 'layout:naginata-v18'));
  assert.ok(!kana!.choices.some((choice) => choice.key === 'layout:qwerty'));
});

test('自作の配列とSetupはそれぞれの区分に入り、Setupには番号を添える', () => {
  const groups = targetChoiceGroups(source({ userLayoutIds: new Set(['dvorak']), setups: SETUPS }));
  assert.deepEqual(groups.map((group) => group.id), ['builtin-alphabet', 'builtin-kana', 'user', 'setup']);
  assert.deepEqual(groups[2]!.choices.map((choice) => choice.key), ['layout:dvorak']);
  assert.ok(!groups[0]!.choices.some((choice) => choice.key === 'layout:dvorak'));
  const [plain, labeled] = groups[3]!.choices;
  assert.equal(plain!.tag, 'Setup 1');
  assert.match(plain!.name, /QWERTY/);
  assert.equal(labeled!.name, '会社の月配列');
  assert.match(labeled!.fullName!, /月配列2-263式/);
});

test('選んでいるのに候補に無い対象は「見つからない」区分に先頭で出す', () => {
  const groups = targetChoiceGroups(source({
    selected: [{ kind: 'setup', setupId: 'gone' }, { kind: 'layout', layoutId: 'qwerty' }],
  }));
  assert.equal(groups[0]!.id, 'missing');
  assert.deepEqual(groups[0]!.choices.map((choice) => [choice.key, choice.name]), [['setup:gone', '削除されたSetup']]);
});

test('絞り込みは全角半角・大文字小文字を区別せず、名前・フル名・番号に当て、空の区分を落とす', () => {
  const groups = targetChoiceGroups(source({ setups: SETUPS }));
  const colemak = filterTargetChoiceGroups(groups, 'ＣＯＬＥＭＡＫ');
  assert.deepEqual(colemak.map((group) => group.id), ['builtin-alphabet']);
  assert.deepEqual(colemak[0]!.choices.map((choice) => choice.name), ['Colemak', 'Colemak-DH']);

  // 空白で区切った語はすべて含むものだけ残す。
  assert.deepEqual(filterTargetChoiceGroups(groups, 'colemak dh')[0]!.choices.map((choice) => choice.name), ['Colemak-DH']);
  // ラベル付きのSetupも配列名（フル名）で見つかる。
  assert.deepEqual(filterTargetChoiceGroups(groups, '2-263').flatMap((group) => group.choices.map((choice) => choice.key)), [
    'layout:tsuki-2-263',
    'setup:b',
  ]);
  assert.deepEqual(filterTargetChoiceGroups(groups, 'setup 2').flatMap((group) => group.choices.map((choice) => choice.key)), ['setup:b']);
  assert.deepEqual(filterTargetChoiceGroups(groups, 'そんな配列は無い'), []);
  assert.equal(filterTargetChoiceGroups(groups, '  '), groups);
});

test('見出しの名前は、入れば全部、入らなければ先頭と「他N件」', () => {
  assert.deepEqual(targetSummaryText([], true), { text: '未選択' });
  assert.deepEqual(targetSummaryText(['QWERTY', 'Colemak'], true), { text: 'QWERTY、Colemak' });
  assert.deepEqual(targetSummaryText(['QWERTY', 'Colemak', 'Dvorak'], false), { text: 'QWERTY', more: '他2件' });
  // 1件なら畳みようが無い（省略記号で切る）。
  assert.deepEqual(targetSummaryText(['とても長い名前'], false), { text: 'とても長い名前' });
});

test('集合の並びは付けた順によらず一覧の順（組み込みの定義順 → Setup）で、候補に無いものは末尾', () => {
  const selected: AnalysisTarget[] = [
    { kind: 'setup', setupId: 'b' },
    { kind: 'setup', setupId: 'gone' },
    { kind: 'layout', layoutId: 'naginata-v18' },
    { kind: 'setup', setupId: 'a' },
    { kind: 'layout', layoutId: 'dvorak' },
    { kind: 'layout', layoutId: 'qwerty' },
  ];
  const groups = targetChoiceGroups(source({ setups: SETUPS, selected }));
  assert.deepEqual(sortTargetsByChoices(selected, groups).map(analysisTargetKey), [
    'layout:qwerty',
    'layout:dvorak',
    'layout:naginata-v18',
    'setup:a',
    'setup:b',
    'setup:gone',
  ]);
  // 既に並んでいれば同じ参照を返す（依存配列に入れても再計算が続かないように）。
  const sorted = [{ kind: 'layout', layoutId: 'qwerty' }, { kind: 'setup', setupId: 'a' }] as const;
  assert.equal(sortTargetsByChoices(sorted, groups), sorted);
});

test('絞り込みの正規化は、ひらがな・カタカナ・半角カナ・全角半角・大文字小文字を揃える', () => {
  assert.equal(normalizeSearchText('カワセミ'), normalizeSearchText('かわせみ'));
  assert.equal(normalizeSearchText('ｶﾜｾﾐ'), normalizeSearchText('かわせみ'));
  assert.equal(normalizeSearchText('ヴ'), normalizeSearchText('ゔ'));
  assert.equal(normalizeSearchText('ＣＯＬＥＭＡＫ'), 'colemak');
  assert.equal(normalizeSearchText('ー'), 'ー');
});

test('絞り込みはひらがな・カタカナを区別せず、読み・別名でも当たる', () => {
  const groups = targetChoiceGroups(source({ setups: SETUPS }));
  const keys = (query: string) => filterTargetChoiceGroups(groups, query).flatMap((group) => group.choices.map((choice) => choice.key));
  assert.deepEqual(keys('かわせみ'), ['layout:kawasemi-kai', 'layout:kawasemi-plus']);
  assert.deepEqual(keys('カワセミ'), keys('かわせみ'));
  assert.deepEqual(keys('なぎなた'), ['layout:naginata-v18']);
  assert.deepEqual(keys('ナギナタ'), ['layout:naginata-v18']);
  assert.ok(keys('にこら').includes('layout:nicola'));
  assert.ok(keys('つき').includes('layout:tsuki-2-263'));
  assert.ok(keys('くわーてぃ').includes('layout:qwerty'));
  assert.deepEqual(keys('nicola'), ['layout:nicola']);
});

test('別名は絞り込みにだけ効き、名前や区分の並びは変えない', () => {
  const groups = targetChoiceGroups(source());
  const naginata = groups.flatMap((group) => group.choices).find((choice) => choice.key === 'layout:naginata-v18')!;
  assert.equal(naginata.name, '薙刀式v18');
  assert.equal(naginata.fullName, undefined);
});
