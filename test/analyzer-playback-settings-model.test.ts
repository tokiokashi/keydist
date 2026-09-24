import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnalyzerPlaybackSettingsModel,
  type AnalyzerPlaybackSettingsData,
} from '../src/analyzer-playback-settings-model.ts';

test('Playback settings model keeps only ephemeral resolved data', () => {
  const model = createAnalyzerPlaybackSettingsModel();
  let notifications = 0;
  model.subscribe(() => { notifications += 1; });

  const data = {
    layout: { id: 'test-layout', name: 'Test' },
    options: { windowSize: 3 },
    playback: {
      showFingers: true,
      showRomajiPlan: false,
      showPlanKeys: true,
      showTrail: true,
      trailTau: 3,
      showOrderLabels: true,
      showSameFingerMotion: true,
      keyFeedbackStyle: 'fade',
      fingerPreparationSeconds: 0,
      sameFingerDelay: true,
      allFingerMovementDelay: false,
      useCalibration: false,
      showChain: true,
      showArpeggio: true,
      showChainOnRateChart: false,
      showArpeggioOnRateChart: false,
      scale: 1,
      stepsPerSecond: 5,
      speedMultiplier: 1,
    },
    rate: {
      playbackRateAverage: 'sma',
      playbackRateWindow: 5,
      playbackRateHalfLifeSeconds: 1,
    },
    chainPolicy: {
      breakOnSameFinger: true,
      breakOnTriggerOnly: true,
      breakOnThumbOnly: true,
      breakOnOppositeHandSimultaneous: true,
    },
    arpeggioPolicy: {
      includeThumb: false,
      bridgeSameFinger: false,
      includeSingleRedirectTail: false,
    },
    triggerRealization: { useHold: true },
    actionRealization: { triggerActivation: 'semantic' },
    layoutOverride: false,
    calibrationAvailable: false,
  } as unknown as AnalyzerPlaybackSettingsData;

  model.setData(data);
  assert.equal(model.getSnapshot().revision, 1);
  assert.equal(model.getSnapshot().data, data);
  assert.equal(notifications, 1);

  model.clear();
  assert.equal(model.getSnapshot().data, undefined);
  assert.equal(model.getSnapshot().revision, 2);
  assert.equal(notifications, 2);
});
