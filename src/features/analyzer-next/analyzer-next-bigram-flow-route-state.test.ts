import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bigramFlowConfigFromSearch,
  bigramFlowConfigSearchPatch,
  validateBigramFlowSearch,
} from './bigram-flow-route-state.ts';

test('Bigram Flow route search validates binding and the current ViewConfig surface', () => {
  assert.deepEqual(validateBigramFlowSearch({
    mode: 'ja',
    layout: 'qwerty',
    source: 'within-hand',
    fingers: 'ring,index,invalid,pinky',
    lineScale: 'log',
    layerOrder: 'cross-hand-top',
    hoverScale: 'global',
    movementScale: 'fixed',
    bandwidth: '12',
    gain: '1.75',
    ignored: 'x',
  }), {
    mode: 'ja',
    layout: 'qwerty',
    source: 'within-hand',
    fingers: 'ring,index',
    lineScale: 'log',
    layerOrder: 'cross-hand-top',
    hoverScale: 'global',
    movementScale: 'fixed',
    bandwidth: 12,
    gain: 1.75,
  });
});

test('Bigram Flow route config uses current defaults for absent or invalid params', () => {
  const search = validateBigramFlowSearch({
    source: 'broken',
    fingers: 'broken',
    lineScale: 'power',
    layerOrder: 'random',
    hoverScale: 'hovered',
    movementScale: 'zoom',
    bandwidth: '3',
    gain: '9',
  });

  assert.deepEqual(bigramFlowConfigFromSearch(search), {
    source: 'actual',
    selectedFingers: [],
    lineScale: 'linear',
    layerOrder: 'weight',
    hoverScale: 'key',
    movementScaleMode: 'fit',
    polarBandwidth: 5,
    polarGain: 1,
  });
});

test('Bigram Flow route rejects fractional bandwidth and accepts numeric input', () => {
  assert.deepEqual(validateBigramFlowSearch({
    bandwidth: 10.5,
    gain: 0.5,
  }), {
    gain: 0.5,
  });

  assert.deepEqual(validateBigramFlowSearch({
    bandwidth: 10,
    gain: 3,
  }), {
    bandwidth: 10,
    gain: 3,
  });
});

test('Bigram Flow route omits default ViewConfig from the URL patch', () => {
  assert.deepEqual(bigramFlowConfigSearchPatch({
    source: 'actual',
    selectedFingers: [],
    lineScale: 'linear',
    layerOrder: 'weight',
    hoverScale: 'key',
    movementScaleMode: 'fit',
    polarBandwidth: 5,
    polarGain: 1,
  }), {
    source: undefined,
    fingers: undefined,
    lineScale: undefined,
    layerOrder: undefined,
    hoverScale: undefined,
    movementScale: undefined,
    bandwidth: undefined,
    gain: undefined,
  });
});

test('Bigram Flow route serializes non-default ViewConfig without Session state', () => {
  assert.deepEqual(bigramFlowConfigSearchPatch({
    source: 'within-hand',
    selectedFingers: ['middle', 'ring'],
    lineScale: 'sqrt',
    layerOrder: 'same-hand-top',
    hoverScale: 'global',
    movementScaleMode: 'fixed',
    polarBandwidth: 15,
    polarGain: 1.4,
  }), {
    source: 'within-hand',
    fingers: 'middle,ring',
    lineScale: 'sqrt',
    layerOrder: 'same-hand-top',
    hoverScale: 'global',
    movementScale: 'fixed',
    bandwidth: 15,
    gain: 1.4,
  });
});
