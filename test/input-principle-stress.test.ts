import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from '../src/core/input-converter/index.ts';
import {
  applyRecognizedTypingInputs,
} from '../src/features/input-converter/typing-session-command.ts';
import {
  faceFromEntries,
  fromFaces,
  fromKana,
  type Face,
} from '../src/layouts/index.ts';

const orderedFace = (
  trigger: string[],
  entries: Record<string, string>,
): Face => ({
  ...faceFromEntries(trigger, 'prefix', entries),
  inputRole: 'modifier',
  triggerPersistence: 'single',
});

/**
 * Phoenixかな配列は左手の行キー + 右手の段キーを、
 * 行→段 / 段→行のどちらの順でも同じ1かなとして認める。
 *
 * 実配列では「か行」がQWERTY f位置、「あ段」がk位置なので、
 * ここでは「か = f+k / k+f」を最小fixtureとして使う。
 */
test('Phoenix principle: reverse-order alternativesは時間閾値なしで同じoutputになる', () => {
  const phoenix = fromFaces('phoenix-principle', 'Phoenix principle', [
    orderedFace(['f'], { k: 'か' }),
    orderedFace(['k'], { f: 'か' }),
  ]);

  assert.equal(phoenix.canonicalInputs.get('か')?.length, 2);

  for (const [first, second] of [
    ['f', 'k'],
    ['k', 'f'],
  ] as const) {
    const engine = new TypingInputEngine(phoenix.canonicalInputs);
    assert.deepEqual(engine.handle({ type: 'down', key: first }).recognized, []);
    assert.deepEqual(engine.handle({ type: 'up', key: first }).recognized, []);

    const result = engine.handle({ type: 'down', key: second }).recognized[0];
    assert.equal(result.output, 'か', `${first}->${second}`);
    assert.deepEqual(
      result.actions.map((action) => action.keys),
      [[first], [second]],
      `${first}->${second}`,
    );
  }
});

/**
 * ヤウ配列の「あ段省略」は、
 * - 行キー単独をまずア段として出力
 * - 次が段キーなら直前のア段を置換してその段へ確定
 * - 次が別の行キーなら前のア段はそのまま確定
 * という入力。
 *
 * 公式説明の「カラオケ」を最小限の行/段キーで再現する。
 */
test('Yau principle: あ段省略はimmediate output + next-input replacementで認識できる', () => {
  const yau = fromKana('yau-a-row-omission', 'Yau a-row omission', [
    ['か', [['f']]],
    ['ら', [['d']]],
    ['あ', [['h']]],
    ['お', [['j']]],
    ['え', [['k']]],

    // 行キー + あ段はア段を明示確定する。見た目のoutputは変わらない。
    ['か', [['f'], ['h']]],
    ['ら', [['d'], ['h']]],

    // 行キー + 他段。
    ['こ', [['f'], ['j']]],
    ['け', [['f'], ['k']]],
    ['ろ', [['d'], ['j']]],
    ['れ', [['d'], ['k']]],
  ]);

  const engine = new TypingInputEngine(yau.canonicalInputs);
  let text = '';

  const press = (key: string) => {
    const result = engine.handle({ type: 'down', key });
    text = applyRecognizedTypingInputs(text, result.recognized);
    engine.handle({ type: 'up', key });
    return result.recognized;
  };

  // か行 -> 次がら行なので「か」はそのまま確定し、ら行も即時「ら」。
  assert.equal(press('f')[0].output, 'か');
  assert.equal(text, 'か');
  assert.equal(press('d')[0].output, 'ら');
  assert.equal(text, 'から');

  // あ段で「ら」を明示確定。replacementは起きるが表示文字列は同じ。
  const explicitA = press('h')[0];
  assert.equal(explicitA.output, 'ら');
  assert.equal(explicitA.replacePreviousText, 'ら');
  assert.equal(text, 'から');

  // 段キー単独はそのまま入力。
  assert.equal(press('j')[0].output, 'お');
  assert.equal(text, 'からお');

  // か行を一旦「か」と出し、え段で「け」へretroactive replacement。
  assert.equal(press('f')[0].output, 'か');
  assert.equal(text, 'からおか');
  const ke = press('k')[0];
  assert.equal(ke.output, 'け');
  assert.equal(ke.replacePreviousText, 'か');
  assert.equal(text, 'からおけ');
});

test('Yau principle: 行キーの次が別行キーなら前のア段を巻き戻さない', () => {
  const yau = fromKana('yau-row-chain', 'Yau row chain', [
    ['か', [['f']]],
    ['ら', [['d']]],
    ['こ', [['f'], ['j']]],
    ['ろ', [['d'], ['j']]],
    ['お', [['j']]],
  ]);
  const engine = new TypingInputEngine(yau.canonicalInputs);

  let text = '';
  for (const key of ['f', 'd']) {
    const result = engine.handle({ type: 'down', key });
    text = applyRecognizedTypingInputs(text, result.recognized);
    engine.handle({ type: 'up', key });
  }

  assert.equal(text, 'から');
});


/**
 * よだか配列の入力原理:
 * - 頻出かなは単打
 * - その他は行 + 段の2-key chord
 * - 拗音は3-key chord
 * - かな + 撥音も2-key chordの1 action
 *
 * ここではphysical配置全体を複製せず、原理ごとの最小fixtureだけを固定する。
 */
test('Yodaka principle: direct + 2-key + 3-key chordを同じcanonical mapで扱える', () => {
  const yodaka = fromKana('yodaka-principle', 'Yodaka principle', [
    ['の', [['f']]],
    ['か', [['d', 'j']]],
    ['きゃ', [['d', 'j', 'k']]],
    ['かん', [['d', 'l']]],
  ]);
  const engine = new TypingInputEngine(yodaka.canonicalInputs);

  const direct = engine.handle({ type: 'down', key: 'f' }).recognized[0];
  assert.equal(direct.output, 'の');
  assert.deepEqual(direct.actions.map((action) => action.keys), [['f']]);
  engine.handle({ type: 'up', key: 'f' });

  engine.handle({ type: 'down', key: 'd' });
  assert.deepEqual(engine.handle({ type: 'down', key: 'j' }).recognized, []);
  const kana = engine.handle({ type: 'up', key: 'j' }).recognized[0];
  assert.equal(kana.output, 'か');
  assert.deepEqual(kana.actions.map((action) => action.keys), [['d', 'j']]);
  engine.handle({ type: 'up', key: 'd' });

  engine.handle({ type: 'down', key: 'd' });
  engine.handle({ type: 'down', key: 'j' });
  const youon = engine.handle({ type: 'down', key: 'k' }).recognized[0];
  assert.equal(youon.output, 'きゃ');
  assert.deepEqual(youon.actions.map((action) => action.keys), [['d', 'j', 'k']]);
  engine.handle({ type: 'up', key: 'k' });
  engine.handle({ type: 'up', key: 'j' });
  engine.handle({ type: 'up', key: 'd' });

  engine.handle({ type: 'down', key: 'd' });
  const hatsuon = engine.handle({ type: 'down', key: 'l' }).recognized[0];
  assert.equal(hatsuon.output, 'かん');
  assert.deepEqual(hatsuon.actions.map((action) => action.keys), [['d', 'l']]);
});
