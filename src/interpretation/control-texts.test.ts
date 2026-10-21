import assert from 'node:assert/strict';
import test from 'node:test';
import { shuffledText, splitChunks, uniformText } from './control-texts.ts';

function counts(chunks: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const chunk of chunks) map.set(chunk, (map.get(chunk) ?? 0) + 1);
  return map;
}

test('塊: 拗音は直前の文字と1つの塊', () => {
  assert.deepEqual(splitChunks('きゃくしゅ'), ['きゃ', 'く', 'しゅ']);
});

test('塊: 小書き文字が続く時は直前の塊にまとめて付く', () => {
  assert.deepEqual(splitChunks('てぃぇす'), ['てぃぇ', 'す']);
});

test('塊: 先頭の小書き文字はそれだけで1つの塊', () => {
  assert.deepEqual(splitChunks('ゃかな'), ['ゃ', 'か', 'な']);
});

test('塊: 促音は直後の文字に付く', () => {
  assert.deepEqual(splitChunks('きっと'), ['き', 'っと']);
});

test('塊: 促音が連続する時はまとめて、その後の文字に付く', () => {
  assert.deepEqual(splitChunks('あっっか'), ['あ', 'っっか']);
});

test('塊: 末尾の促音はそれだけで1つの塊', () => {
  assert.deepEqual(splitChunks('あっ'), ['あ', 'っ']);
});

test('塊: 末尾で促音が連続する時は続く促音をまとめて1つの塊', () => {
  assert.deepEqual(splitChunks('あっっ'), ['あ', 'っっ']);
});

test('塊: 直後が句読点の促音はそれだけで1つの塊', () => {
  assert.deepEqual(splitChunks('あっ、い'), ['あ', 'っ', '、', 'い']);
});

test('塊: 直後が長音の促音はそれだけで1つの塊', () => {
  assert.deepEqual(splitChunks('あっーい'), ['あ', 'っ', 'ー', 'い']);
});

test('塊: 直後が漢字など打鍵できない文字の促音はそれだけで1つの塊', () => {
  assert.deepEqual(splitChunks('あっ漢い'), ['あ', 'っ', '漢', 'い']);
});

test('塊: 促音の直後の小書き文字は促音が付いた塊に付く', () => {
  assert.deepEqual(splitChunks('あっゃい'), ['あ', 'っゃ', 'い']);
  assert.deepEqual(splitChunks('かっきゃ'), ['か', 'っきゃ']);
});

test('塊: ヵとヶは小書き文字に数えず1文字ずつ', () => {
  assert.deepEqual(splitChunks('かヵヶ'), ['か', 'ヵ', 'ヶ']);
});

test('塊: 句読点・長音・打鍵できない文字・空文字列', () => {
  assert.deepEqual(splitChunks('あ、ー漢。'), ['あ', '、', 'ー', '漢', '。']);
  assert.deepEqual(splitChunks(''), []);
});

test('塊: 塊をつなぐと元のテキストに戻る', () => {
  const text = 'ゃきっとしゅっっ、てぃっゃーヵ漢っ';
  assert.equal(splitChunks(text).join(''), text);
});

const SAMPLE = 'きょうはいいてんきですね、きっとあしたもはれるでしょう。';

test('同じ入力と種からは、順序破壊も一様ランダムも同じ結果になる', () => {
  assert.deepEqual(shuffledText(SAMPLE, 7), shuffledText(SAMPLE, 7));
  assert.deepEqual(uniformText(SAMPLE, 7), uniformText(SAMPLE, 7));
  assert.notEqual(shuffledText(SAMPLE, 7).text, shuffledText(SAMPLE, 8).text);
  assert.notEqual(uniformText(SAMPLE, 7).text, uniformText(SAMPLE, 8).text);
});

test('順序破壊: 塊の出現回数が元のテキストと一致する', () => {
  for (const seed of [0, 1, 2, 3]) {
    const result = shuffledText(SAMPLE, seed);
    assert.deepEqual(counts(splitChunks(result.text)), counts(splitChunks(SAMPLE)));
  }
});

test('順序破壊: 塊が割れない（結果を塊に分け直しても元と同じ数になる）', () => {
  const result = shuffledText(SAMPLE, 5);
  assert.equal(splitChunks(result.text).length, splitChunks(SAMPLE).length);
});

test('順序破壊: 単独の促音・先頭の小書き文字を含むテキストでも文字数を保つ', () => {
  const text = 'ゃあっ、いっう';
  assert.equal([...shuffledText(text, 1).text].length, [...text].length);
});

test('一様ランダム: 塊は元のテキストに出た塊の種類で、数は元と同じ', () => {
  const original = splitChunks(SAMPLE);
  const kinds = new Set(original);
  const result = uniformText(SAMPLE, 3);
  const chunks = splitChunks(result.text);
  assert.equal(chunks.length, original.length);
  for (const chunk of chunks) assert.ok(kinds.has(chunk), chunk);
});

test('一様ランダム: 各種類を同じ確率で引く（出現回数に偏らない）', () => {
  // 'あ' が 90 個、'い' 'う' が各 5 個の元のテキスト。出現回数に比例するなら 'あ' が9割を占める
  const text = 'あ'.repeat(90) + 'い'.repeat(5) + 'う'.repeat(5);
  const trials = 3000;
  const total = new Map<string, number>();
  for (let seed = 1; seed <= trials; seed++) {
    for (const [chunk, n] of counts(splitChunks(uniformText(text, seed).text))) {
      total.set(chunk, (total.get(chunk) ?? 0) + n);
    }
  }
  const draws = trials * 100;
  const p = 1 / 3;
  // 二項分布の標準偏差の5倍を許す。種を固定しているので結果は毎回同じで、偶然には落ちない
  const sd = Math.sqrt(draws * p * (1 - p));
  for (const chunk of ['あ', 'い', 'う']) {
    assert.ok(Math.abs((total.get(chunk) ?? 0) - draws * p) < 5 * sd, `${chunk}: ${total.get(chunk)}`);
  }
});

test('結果は生成器の名前と種と作り方を持つ', () => {
  assert.deepEqual({ ...shuffledText(SAMPLE, 42), text: '' }, { text: '', kind: 'shuffled', prng: 'mulberry32', seed: 42 });
  const uniform = uniformText(SAMPLE, 9);
  assert.equal(uniform.kind, 'uniform');
  assert.equal(uniform.prng, 'mulberry32');
  assert.equal(uniform.seed, 9);
});

test('空のテキストからは空の対照テキストが出る', () => {
  assert.equal(shuffledText('', 1).text, '');
  assert.equal(uniformText('', 1).text, '');
});
