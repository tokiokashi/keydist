import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bigramFlowConfigFromSearch,
  bigramFlowConfigSearchPatch,
  validateBigramFlowSearch,
} from '../src/features/analyzer-next/bigram-flow-route-state.ts';

test('Bigram Flow route search validates binding and bookmark-worthy ViewConfig', () => {
  assert.deepEqual(validateBigramFlowSearch({
    mode: 'ja',
    layout: 'qwerty',
    source: 'within-hand',
    fingers: 'ring,index,invalid,pinky',
    lineScale: 'log',
    layerOrder: 'cross-hand-top',
    ignored: 'x',
  }), {
    mode: 'ja',
    layout: 'qwerty',
    source: 'within-hand',
    fingers: 'ring,index',
    lineScale: 'log',
    layerOrder: 'cross-hand-top',
  });
});

test('Bigram Flow route config uses definition defaults for absent or invalid params', () => {
  const search = validateBigramFlowSearch({
    source: 'broken',
    fingers: 'broken',
    lineScale: 'power',
    layerOrder: 'random',
  });
  assert.deepEqual(bigramFlowConfigFromSearch(search), {
    source: 'actual',
    selectedFingers: [],
    lineScale: 'linear',
    layerOrder: 'weight',
  });
});

test('Bigram Flow route omits default ViewConfig from the URL patch', () => {
  assert.deepEqual(bigramFlowConfigSearchPatch({
    source: 'actual',
    selectedFingers: [],
    lineScale: 'linear',
    layerOrder: 'weight',
  }), {
    source: undefined,
    fingers: undefined,
    lineScale: undefined,
    layerOrder: undefined,
  });

  assert.deepEqual(bigramFlowConfigSearchPatch({
    source: 'within-hand',
    selectedFingers: ['middle', 'ring'],
    lineScale: 'sqrt',
    layerOrder: 'same-hand-top',
  }), {
    source: 'within-hand',
    fingers: 'middle,ring',
    lineScale: 'sqrt',
    layerOrder: 'same-hand-top',
  });
});
