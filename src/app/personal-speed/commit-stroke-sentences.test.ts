import assert from 'node:assert/strict';
import test from 'node:test';
import { sentenceSetupOf } from '#editors/personal-speed/sentence-setup.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { browserCodeToPhysicalKey } from '#input/shapes/browser-key-codes.ts';
import { calibrationKeyLabel, unassignedThumbKeys } from '#interpretation/timing/calibration-session.ts';
import { pressSentenceSessionKey, sentenceKeyIds, startSentenceSession, type SentenceKeyEvent } from '#interpretation/timing/sentence-session.ts';
import { paneCatalog } from '../standalone/catalog.ts';
import { personalSpeedSentenceBuilder } from './sentence-source.ts';

const BASE = { userLayouts: [], userRomajiRules: [], fingerAssignments: [] };
const build = personalSpeedSentenceBuilder({ ...BASE, setupLibrary: { setups: [], overrides: EMPTY_SETTINGS_OVERRIDES } });
const catalog = paneCatalog(BASE).setupCatalog;

test('確定の打鍵が入る文は測れ、確定の打鍵を右親指のキーの押下として照合する。押さずに続けると違うキーになる', () => {
  const layout = catalog.layouts.get('yumi');
  assert.ok(layout !== undefined);
  const keyLabel = (id: string) => calibrationKeyLabel(layout.legends, id);
  const built = build({ layoutId: 'yumi', shapeId: 'row-staggered', fingerAssignmentId: 'default' }, 'くゃ');
  assert.ok(built.ok);
  const setup = sentenceSetupOf([built], [[]]);
  assert.ok(setup.ok, setup.ok ? '' : setup.message);
  assert.deepEqual(
    setup.plans[0].baseSteps.flat().map((step) => step.keys.join('+')),
    ['n', 'thumb-r', 'b'],
  );
  assert.deepEqual(sentenceKeyIds(setup.plans).sort(), ['b', 'n', 'thumb-r']);
  // 右親指のキーに引けるcodeが無い対応では、測定を始める前に分かる
  assert.deepEqual(unassignedThumbKeys(sentenceKeyIds(setup.plans), { Space: null, Convert: null }), ['thumb-r']);

  const space = browserCodeToPhysicalKey('Space');
  assert.equal(space, 'thumb-r');
  const spaceEvent: SentenceKeyEvent = { key: ' ', code: 'Space', physicalKey: space };
  const n: SentenceKeyEvent = { key: 'n', code: '', physicalKey: 'n' };
  const b: SentenceKeyEvent = { key: 'b', code: '', physicalKey: 'b' };
  const press = (session: ReturnType<typeof startSentenceSession>, event: SentenceKeyEvent, atMs: number) =>
    pressSentenceSessionKey(session, event, atMs, keyLabel);

  let session = press(startSentenceSession(setup.plans), n, 100).session;
  assert.equal(press(session, b, 200).outcome.kind, 'wrong-key');
  session = press(session, spaceEvent, 200).session;
  assert.notEqual(press(session, b, 300).outcome.kind, 'wrong-key');
});
