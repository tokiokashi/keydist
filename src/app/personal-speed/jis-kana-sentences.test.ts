import assert from 'node:assert/strict';
import test from 'node:test';
import { MEASUREMENT_SENTENCE_BREAKS, MEASUREMENT_SENTENCES } from '#editors/personal-speed/calibration-text.ts';
import { matchableKeyEvent } from '#editors/personal-speed/key-capture.ts';
import { sentenceSetupOf } from '#editors/personal-speed/sentence-setup.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { browserKeyBindingsForShape, JIS_BROWSER_BINDINGS } from '#input/shapes/browser-key-codes.ts';
import {
  isShiftKeyId,
  pressSentenceSessionKey,
  sentenceKeyIds,
  sentenceSessionFinished,
  startSentenceSession,
  type SentenceKeyEvent,
  type SentencePlan,
} from '#interpretation/timing/sentence-session.ts';
import { unassignedJisCodeKeys } from '#interpretation/timing/calibration-session.ts';
import { personalSpeedSentenceBuilder } from './sentence-source.ts';

const BASE = { userLayouts: [], userRomajiRules: [], fingerAssignments: [] };
const build = personalSpeedSentenceBuilder({ ...BASE, setupLibrary: { setups: [], overrides: EMPTY_SETTINGS_OVERRIDES } });

/** 画面の選択肢で選べる、JISかな配列と物理配列と指の割り当ての組。 */
const SELECTIONS = [
  { shapeId: 'row-staggered', fingerAssignmentId: 'default' },
  { shapeId: 'row-staggered', fingerAssignmentId: 'jis-default' },
  { shapeId: 'jis-row-staggered', fingerAssignmentId: 'jis-default' },
] as const;

function setupOf(selection: (typeof SELECTIONS)[number]) {
  const builds = MEASUREMENT_SENTENCES.map((text) => build({ layoutId: 'jis-kana', ...selection }, text));
  return sentenceSetupOf(builds, MEASUREMENT_SENTENCE_BREAKS);
}

/** JISキーボードの、キーのidを送る`code`。 */
function codeOf(keyId: string): string {
  const jis = Object.entries(JIS_BROWSER_BINDINGS).find(([, id]) => id === keyId);
  if (jis !== undefined) return jis[0];
  if (/^[a-z]$/.test(keyId)) return `Key${keyId.toUpperCase()}`;
  if (/^[0-9]$/.test(keyId)) return `Digit${keyId}`;
  const named: Record<string, string> = {
    '-': 'Minus',
    '=': 'Equal',
    '[': 'BracketLeft',
    ']': 'BracketRight',
    ';': 'Semicolon',
    "'": 'Quote',
    ',': 'Comma',
    '.': 'Period',
    '/': 'Slash',
  };
  const code = named[keyId];
  assert.ok(code !== undefined, keyId);
  return code;
}

/**
 * 全文を3回ずつ打ち終えるまで、JISキーボードの押下の列を流す。Shiftは押下として送らず、文字のキーの押下の`shiftKey`で伝える。
 * `event.key`は、Shiftで打つ文字のキーでは空にして、`code`だけで照合できることを確かめる。
 */
function playAll(plans: readonly SentencePlan[], shapeId: string) {
  const bindings = browserKeyBindingsForShape(shapeId);
  let session = startSentenceSession(plans);
  let atMs = 0;
  let wrong = 0;
  for (const plan of plans) {
    for (let round = 0; round < 3; round++) {
      for (const step of plan.baseSteps.flat()) {
        const shifted = step.keys.some(isShiftKeyId);
        for (const id of step.keys.filter((key) => !isShiftKeyId(key))) {
          atMs += 100;
          const event: SentenceKeyEvent = matchableKeyEvent({ key: shifted ? '' : id, code: codeOf(id), shiftKey: shifted }, bindings);
          const pressed = pressSentenceSessionKey(session, event, atMs, (key) => key);
          session = pressed.session;
          if (pressed.outcome.kind === 'wrong-key') wrong += 1;
        }
      }
    }
  }
  return { session, wrong };
}

for (const selection of SELECTIONS) {
  const name = `${selection.shapeId}・${selection.fingerAssignmentId}`;

  test(`JISかな配列は、${name}で、文章を打つ測定を始められ、示す文はShiftとろのキーを使う`, () => {
    const setup = setupOf(selection);
    assert.ok(setup.ok, setup.ok ? '' : setup.message);
    const keys = sentenceKeyIds(setup.plans);
    assert.ok(keys.some(isShiftKeyId));
    assert.ok(keys.includes('r3c10'));
  });

  test(`JISかな配列の全文を、${name}で、Shiftを押しながら打ち終えられ、違うキーは1つも出ない`, () => {
    const setup = setupOf(selection);
    assert.ok(setup.ok);
    // 打鍵の列は選んだ物理配列と同じ形のJISの物理配列で作るので、押下のキーもJISの物理配列の対応で引く
    const played = playAll(setup.plans, 'jis-row-staggered');
    assert.equal(played.wrong, 0);
    assert.equal(sentenceSessionFinished(played.session), true);
  });
}

test('ろのキーに引けるcodeが無い利用者は、ろのキーを打てないので、測定を始める前に分かる', () => {
  const setup = setupOf(SELECTIONS[2]);
  assert.ok(setup.ok);
  const keys = sentenceKeyIds(setup.plans);
  const jis = browserKeyBindingsForShape('jis-row-staggered');
  assert.deepEqual(unassignedJisCodeKeys(keys, jis), []);
  assert.deepEqual(unassignedJisCodeKeys(keys, { ...jis, IntlRo: null }), ['r3c10']);
  // 別のcodeを割り当て直せば打てる
  assert.deepEqual(unassignedJisCodeKeys(keys, { ...jis, IntlRo: null, Lang2: 'r3c10' }), []);
});

for (const selection of [
  { shapeId: 'jis-row-staggered', fingerAssignmentId: 'default' },
  { shapeId: 'row-staggered', fingerAssignmentId: 'qwerty-optimized' },
  { shapeId: 'row-staggered', fingerAssignmentId: 'angle-mod' },
]) {
  test(`JISかな配列で、JISのキーを持たない指の割り当て（${selection.shapeId}・${selection.fingerAssignmentId}）を選ぶと、JISの物理配列用の割り当てを選ぶよう示す`, () => {
    const built = build({ layoutId: 'jis-kana', ...selection }, MEASUREMENT_SENTENCES[0]);
    assert.ok(!built.ok);
    assert.match(built.message, /JISの物理配列用の指の割り当てを選んでください/);
  });
}
