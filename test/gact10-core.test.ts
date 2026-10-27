import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTable, parseSource, readKeys, resolveRules } from '../scripts/gact10-core.ts';

// 定義ファイルと同じ書式で書いた小さな入力。入力の列は「保留 + 今打ったキー」
const SOURCE = [
  '#--------',
  '#■一打目',
  'q\t\t拡',
  'r\t\tっ',
  'w\t、\t',
  ':\tー\t',
  'a\tあ\t',
  'k\t\tか行',
  'i\t\tさ行',
  'n\t\t・',
  'っa\tぁ\t',
  'っy\t\tゃ行',
  'ゃ行a\tゃ\t',
  '',
  '#■二打目',
  'か行a\tか\t',
  'か行g\tき\t',
  'か行z\tかん\t',
  'か行q\tかい\t',
  'か行q\t\t', // 後の行が空なので割り当てなしになる
  'か行u\t\tきy',
  'か行h\tか\t', // かの2通り目（打鍵数は同じで、出典で後）
  'さ行a\tさ\t',
  'さ行a\tざ\t', // 後勝ち
  'か行t\t\t', // 出力も次の入力も空で、後に上書きされない
  'か行m\t\tカく',
  'か行x\t\tカつ',
  'カくa\tかく\t',
  'きya\tきゃ\t',
  'こんにちは',
  '',
  '#その他の省略打ち',
  'か行p\tこころ\t',
  '',
  '#■記号',
  '拡f\t→\t',
  '拡n\t\t○',
  '○n\t\t●',
  '●n\t\t○',
  '拡l\t\t「」',
  '・n\t：\t',
].join('\r\n');

const build = () => buildTable(parseSource(SOURCE));
const transitions = () => resolveRules(parseSource(SOURCE).rules).transitions;

test('保留をたどって、最初の状態に戻るまでの打鍵列を見出しの綴りにする', () => {
  const { table } = build();
  assert.equal(table.あ, 'a');
  assert.equal(table.か, 'ka');
  assert.equal(table.きゃ, 'kua');
  assert.equal(table.かん, 'kz');
  assert.equal(table.かく, 'kma');
  assert.equal(table.ぁ, 'ra');
  assert.equal(table.ゃ, 'rya');
});

test('同じ入力は後の行を採り、そのあとで出力も次の入力も空の入力を除く', () => {
  const { table, report } = build();
  assert.equal(table.さ, undefined);
  assert.equal(table.ざ, 'ia');
  assert.equal(table.かい, undefined);
  assert.ok(report.some((line) => line.includes('か行q') && line.includes('出力「かい」') && line.includes('出力「」')));
  const { transitions: t, emptied } = resolveRules(parseSource(SOURCE).rules);
  assert.equal(t.get('か行')?.has('q'), false);
  assert.equal(t.get('か行')?.has('t'), false);
  assert.deepEqual(
    emptied.map((r) => r.input),
    ['か行q', 'か行t'],
  );
});

test('保留が確定できる状態（っ・・）だけ、続きの行が無ければ保留を確定して最初の状態から読み直す', () => {
  const { table } = build();
  assert.equal(table.っ, 'r');
  assert.equal(table['・'], 'n');
  // 拡 や か行 のような保留は、確定しても意味のある出力にならないので見出しにしない
  assert.equal(table.拡, undefined);
  const t = transitions();
  // っのあとにっaの行が続くキーを打てば小書きになる
  assert.deepEqual(readKeys(t, 'ra'), { output: 'ぁ', pending: '', stuck: false });
  // っのあとに、行の無いキーを打つとっを確定して、そのキーを根から読み直す
  assert.deepEqual(readKeys(t, 'rw'), { output: 'っ、', pending: '', stuck: false });
  assert.deepEqual(readKeys(t, 'rk'), { output: 'っ', pending: 'か行', stuck: false });
  assert.deepEqual(readKeys(t, 'r'), { output: 'っ', pending: '', stuck: false });
  // 確定できない保留で、続きの行が無ければ止まる
  assert.equal(readKeys(t, 'kw').stuck, true);
  assert.equal(readKeys(t, 'qw').stuck, true);
});

test('1つの出力に複数の打鍵列がある時は、打鍵数最小、同数なら出典で先を採る', () => {
  const source = ['#■一打目', 'a\tあ\t', 'k\t\tか行', 'k\t\tさ行', 'か行a\tか\t', 'さ行a\tか\t', 'さ行b\tか\t'].join('\n');
  // kは後の行のさ行に上書きされる。かはkaとkbのどちらも2打で、出典で先のka
  const { table } = buildTable(parseSource(source));
  assert.equal(table.か, 'ka');
  const swapped = ['#■一打目', 'k\t\tか行', 's\t\tさ行', 'さ行a\tか\t', 'か行a\tか\t'].join('\n');
  // 同数の2打なら、たどった行の行番号を先頭から比べて小さい方（か行 = 2行目 → 4行目、さ行 = 3行目 → 4行目）
  assert.equal(buildTable(parseSource(swapped)).table.か, 'ka');
  const longer = ['#■一打目', 'a\tあ\t', 'k\t\tか行', 'か行a\tか\t', 'か行b\t\tか行2', 'か行2a\tあ\t'].join('\n');
  // あはaの1打とkbaの3打なのでa
  assert.equal(buildTable(parseSource(longer)).table.あ, 'a');
});

test("長音のJISの : はUS配列の同じ物理位置の ' に読み替え、「」は補足の綴りを足す", () => {
  const { table, fileKeys } = build();
  assert.equal(table.ー, "'");
  assert.equal(fileKeys.ー, ':');
  assert.equal(table['「'], '[');
  assert.equal(table['」'], ']');
});

test('末尾の省略打ちの節は、次の見出しの行まで入れない', () => {
  const parsed = parseSource(SOURCE);
  assert.deepEqual(
    parsed.excluded.map((r) => r.input),
    ['か行p'],
  );
  assert.equal(build().table.こころ, undefined);
});

test('かなと採る記号に入らない出力（矢印など）と、循環する保留は見出しにしない', () => {
  const { table, report } = build();
  assert.equal(table['→'], undefined);
  assert.equal(table['○'], undefined);
  assert.equal(table['：'], undefined);
  assert.ok(report.some((line) => line.includes('→×1')));
});

test('コメントとタブの無い行は読まない。3列でない行は止める', () => {
  assert.equal(parseSource(SOURCE).inputLines, SOURCE.split('\r\n').filter((l) => l.includes('\t')).length);
  assert.throws(() => parseSource('a\tあ'), /3列でない/);
  assert.throws(() => parseSource('あ\tあ\t'), /QWERTYのキーでない/);
});

test('出力と次の入力の両方を持つ行は、出力を足しながらたどる', () => {
  const source = ['#■一打目', 'a\tあ\tい行', 'い行b\tい\t'].join('\n');
  assert.equal(buildTable(parseSource(source)).table.あい, 'ab');
});
