import assert from 'node:assert/strict';
import test from 'node:test';
import { MEASUREMENT_SENTENCE_BREAKS, MEASUREMENT_SENTENCES } from '#editors/personal-speed/calibration-text.ts';
import { sentenceSetupOf } from '#editors/personal-speed/sentence-setup.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { browserCodeToPhysicalKey } from '#input/shapes/browser-key-codes.ts';
import { isThumbKeyId } from '#input/shapes/geometry.ts';
import { calibrationKeyLabel } from '#interpretation/timing/calibration-session.ts';
import {
  pressSentenceSessionKey,
  sentenceSessionFinished,
  sentenceUsesThumbKeys,
  startSentenceSession,
  type SentenceKeyEvent,
  type SentencePlan,
} from '#interpretation/timing/sentence-session.ts';
import { paneCatalog } from '../standalone/catalog.ts';
import { personalSpeedSentenceBuilder } from './sentence-source.ts';

const BASE = { userLayouts: [], userRomajiRules: [], fingerAssignments: [] };
const build = personalSpeedSentenceBuilder({ ...BASE, setupLibrary: { setups: [], overrides: EMPTY_SETTINGS_OVERRIDES } });
const catalog = paneCatalog(BASE).setupCatalog;

/** 親指のキーを使う組み込みのかな配列。 */
const THUMB_LAYOUTS = ['naginata-v18', 'shin-jis-prefix', 'shin-jis-simultaneous', 'nicola', 'shin-koume', 'asuka', 'kawasemi-plus'] as const;

/** 同じ親指のキーを含むストロークが続く箇所がある配列。 */
const HOLDING_LAYOUTS: readonly string[] = ['naginata-v18', 'shin-jis-simultaneous', 'nicola', 'shin-koume', 'asuka'];

function setupOf(layoutId: string) {
  const builds = MEASUREMENT_SENTENCES.map((text) => build({ layoutId, shapeId: 'row-staggered', fingerAssignmentId: 'default' }, text));
  return sentenceSetupOf(builds, MEASUREMENT_SENTENCE_BREAKS);
}

for (const layoutId of THUMB_LAYOUTS) {
  test(`${layoutId}は、物理配列row-staggered・指の割り当ての既定で、文章を打つ測定を始められ、親指のキーの押下を受け付ける`, () => {
    const setup = setupOf(layoutId);
    assert.ok(setup.ok, setup.ok ? '' : setup.message);
    assert.equal(sentenceUsesThumbKeys(setup.plans), true);
  });
}

/** 標準の対応で親指のキーに引ける押下。右手の親指のキーはSpace、左手の親指のキーは無変換。 */
function thumbPress(id: string): SentenceKeyEvent {
  const code = id === 'thumb-l' ? 'NonConvert' : 'Space';
  const physicalKey = browserCodeToPhysicalKey(code);
  assert.ok(physicalKey !== undefined && isThumbKeyId(physicalKey));
  return { key: id === 'thumb-l' ? 'NonConvert' : ' ', code, physicalKey };
}

/**
 * 全文を3回ずつ打ち終えるまで、押下の列を流す。`hold`が真なら、親指のキーを押したまま次のストロークへ進み、
 * 親指のキーを使わないストロークと回の最初で離す（親指のキーを押し続けて打つ人）。偽なら、ストロークごとに親指のキーを押し直す。
 * 返すのは、違うキーの押下の数と、親指のキーを押し続けた状態で文字のキーだけを押したストロークの数。
 */
function playAll(layoutId: string, plans: readonly SentencePlan[], hold: boolean) {
  const layout = catalog.layouts.get(layoutId);
  assert.ok(layout !== undefined);
  const keyLabel = (id: string) => calibrationKeyLabel(layout.legends, id);
  let session = startSentenceSession(plans);
  let atMs = 0;
  let wrong = 0;
  let heldStrokes = 0;
  let held: string[] = [];
  const press = (event: SentenceKeyEvent) => {
    atMs += 100;
    const pressed = pressSentenceSessionKey(session, event, atMs, keyLabel);
    session = pressed.session;
    if (pressed.outcome.kind === 'wrong-key') wrong += 1;
  };
  for (const plan of plans) {
    for (let round = 0; round < 3; round++) {
      held = [];
      for (const step of plan.baseSteps.flat()) {
        const thumbs = step.keys.filter(isThumbKeyId);
        const chars = step.keys.filter((key) => !isThumbKeyId(key));
        if (thumbs.length === 0) held = [];
        let newThumbs = 0;
        for (const id of thumbs) {
          // 親指のキーだけのストロークは、押し続けを使わず、新しい押下を求める。
          if (hold && chars.length > 0 && held.includes(id)) continue;
          press(thumbPress(id));
          newThumbs += 1;
          if (!held.includes(id)) held.push(id);
        }
        if (hold && thumbs.length > 0 && chars.length > 0 && newThumbs === 0) heldStrokes += 1;
        for (const id of chars) press({ key: keyLabel(id), code: '', physicalKey: id, heldThumbKeys: hold ? [...held] : [] });
        if (!hold) held = [];
      }
    }
  }
  return { session, wrong, heldStrokes };
}

for (const layoutId of THUMB_LAYOUTS) {
  for (const hold of [false, true]) {
    test(`${layoutId}の全文を、親指のキーを${hold ? '押し続けて' : '押し直して'}打ち終えられ、違うキーは1つも出ない`, () => {
      const setup = setupOf(layoutId);
      assert.ok(setup.ok);
      const played = playAll(layoutId, setup.plans, hold);
      assert.equal(played.wrong, 0);
      assert.equal(sentenceSessionFinished(played.session), true);
      // 同じ親指のキーを含むストロークが続く配列では、押し続けた状態で文字のキーだけを押すストロークがある
      if (hold && HOLDING_LAYOUTS.includes(layoutId)) assert.ok(played.heldStrokes > 0);
    });
  }
}
