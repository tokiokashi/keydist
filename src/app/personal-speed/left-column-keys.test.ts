import assert from 'node:assert/strict';
import test from 'node:test';
import { MEASUREMENT_SENTENCES } from '#editors/personal-speed/calibration-text.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { browserCodeToPhysicalKey, browserKeyBindingsForShape, type BrowserKeyBindingOverrides } from '#input/shapes/browser-key-codes.ts';
import { calibrationKeyLabel } from '#interpretation/timing/calibration-session.ts';
import {
  SENTENCE_ROUNDS,
  pressSentenceSessionKey,
  sentencePlan,
  sentenceSessionFinished,
  sentenceSteps,
  sentenceUnmeasurable,
  startSentenceSession,
  type SentenceKeyEvent,
  type SentencePlan,
} from '#interpretation/timing/sentence-session.ts';
import { paneCatalog } from '../standalone/catalog.ts';
import { personalSpeedSentenceBuilder } from './sentence-source.ts';

const BASE = { userLayouts: [], userRomajiRules: [], fingerAssignments: [] };
const build = personalSpeedSentenceBuilder({ ...BASE, setupLibrary: { setups: [], overrides: EMPTY_SETTINGS_OVERRIDES } });
const SELECTION = { layoutId: 'tsuki-ringo', shapeId: 'row-staggered', fingerAssignmentId: 'default' };

const ringo = paneCatalog(BASE).setupCatalog.layouts.get('tsuki-ringo');
assert.ok(ringo !== undefined);
const keyLabel = (id: string) => calibrationKeyLabel(ringo.legends, id);

/** 画面と同じ組み立てで、16文の計画を作る。測れない文があれば理由を返す。 */
function plansOf(): { readonly plans: SentencePlan[]; readonly unmeasurable: string[] } {
  const plans: SentencePlan[] = [];
  const unmeasurable: string[] = [];
  for (const text of MEASUREMENT_SENTENCES) {
    const result = build(SELECTION, text);
    assert.ok(result.ok, text);
    const reason = sentenceUnmeasurable(sentenceSteps(result.analysis));
    if (reason !== undefined) unmeasurable.push(`${text}: ${reason}`);
    plans.push(sentencePlan(result.analysis, result.spelling));
  }
  return { plans, unmeasurable };
}

/** `caps-lock`を打つ押下。それ以外のキーは、配列の刻印の文字を`event.key`に送る。 */
type CapsLockPress = (bindings: BrowserKeyBindingOverrides) => SentenceKeyEvent;

function playAll(plans: readonly SentencePlan[], capsLockPress: CapsLockPress, bindings: BrowserKeyBindingOverrides) {
  let session = startSentenceSession(plans);
  let atMs = 0;
  const outcomes: string[] = [];
  for (const plan of plans) {
    for (let round = 0; round < SENTENCE_ROUNDS; round++) {
      for (const step of plan.baseSteps.flat()) {
        for (const id of step.keys) {
          atMs += 100;
          const event = id === 'caps-lock' ? capsLockPress(bindings) : { key: keyLabel(id), code: `Key${id.toUpperCase()}` };
          const pressed = pressSentenceSessionKey(session, event, atMs, keyLabel);
          session = pressed.session;
          outcomes.push(pressed.outcome.kind);
        }
      }
    }
  }
  return { session, outcomes };
}

const physical = (key: string, code: string, bindings: BrowserKeyBindingOverrides): SentenceKeyEvent => {
  const physicalKey = browserCodeToPhysicalKey(code, bindings);
  return physicalKey === undefined ? { key, code } : { key, code, physicalKey };
};

test('月林檎配列の示す文は16文とも測れる。CapsLockの位置のキーを使う文を含む', () => {
  const { plans, unmeasurable } = plansOf();
  assert.deepEqual(unmeasurable, []);
  assert.equal(plans.length, 16);
  const used = plans.flatMap((plan) => plan.baseSteps.flat().flatMap((step) => step.keys));
  assert.ok(used.includes('caps-lock'));
});

test('event.codeがCapsLockの押下で き・ぎ を打って、16文の全部を回数分打ち終える', () => {
  const { plans } = plansOf();
  const { session, outcomes } = playAll(plans, (bindings) => physical('CapsLock', 'CapsLock', bindings), {});
  assert.ok(!outcomes.includes('wrong-key'));
  assert.ok(sentenceSessionFinished(session));
});

test('OSで入れ替えた利用者が、USの物理配列でBackslashをcaps-lockに割り当てると、そのキーで き を打てる', () => {
  const { plans } = plansOf();
  const bindings = browserKeyBindingsForShape('row-staggered', { Backslash: 'caps-lock' });
  const { session, outcomes } = playAll(plans, (b) => physical('\\', 'Backslash', b), bindings);
  assert.ok(!outcomes.includes('wrong-key'));
  assert.ok(sentenceSessionFinished(session));
});

test('JISの物理配列で、利用者が割り当てたIntlRoはJISの対応より優先され、そのキーで き を打てる', () => {
  const { plans } = plansOf();
  const bindings = browserKeyBindingsForShape('jis-row-staggered', { IntlRo: 'caps-lock' });
  assert.equal(browserCodeToPhysicalKey('IntlRo', bindings), 'caps-lock');
  const { session, outcomes } = playAll(plans, (b) => physical('\\', 'IntlRo', b), bindings);
  assert.ok(!outcomes.includes('wrong-key'));
  assert.ok(sentenceSessionFinished(session));
});

test('割り当てが無いJISのIntlRoは格子のキーになるので、caps-lockの代わりにならない', () => {
  const { plans } = plansOf();
  const bindings = browserKeyBindingsForShape('jis-row-staggered', {});
  assert.equal(browserCodeToPhysicalKey('IntlRo', bindings), 'r3c10');
  const { outcomes } = playAll(plans, (b) => physical('\\', 'IntlRo', b), bindings);
  assert.ok(outcomes.includes('wrong-key'));
});

test('月林檎配列は測れ、親指のキーを使う配列は測れないまま', () => {
  const unmeasurableLayouts: string[] = [];
  const layouts = [...paneCatalog(BASE).setupCatalog.layouts.keys()];
  for (const layoutId of layouts) {
    const failed = MEASUREMENT_SENTENCES.some((text) => {
      const result = build({ ...SELECTION, layoutId }, text);
      return !result.ok || sentenceUnmeasurable(sentenceSteps(result.analysis)) !== undefined;
    });
    if (failed) unmeasurableLayouts.push(layoutId);
  }
  assert.ok(!unmeasurableLayouts.includes('tsuki-ringo'));
  assert.ok(unmeasurableLayouts.includes('nicola'));
});
