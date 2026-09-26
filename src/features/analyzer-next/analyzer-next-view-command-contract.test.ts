import test from 'node:test';
import type {
  AnalysisDistanceCommand,
  AnalysisTimingCommand,
} from './views/view-contract.ts';

test('condition command types keep key/value correlation', () => {
  const distance: AnalysisDistanceCommand = {
    scope: { kind: 'default' },
    key: 'windowSize',
    value: 5,
  };
  const timing: AnalysisTimingCommand = {
    scope: { kind: 'layout', layoutId: 'qwerty' },
    key: 'speedMultiplier',
    value: 1.25,
  };
  const resetTiming: AnalysisTimingCommand = {
    scope: { kind: 'layout', layoutId: 'qwerty' },
    key: 'speedMultiplier',
    value: undefined,
  };
  void distance;
  void timing;
  void resetTiming;

  if (false) {
    // Keep each invalid assignment on one line so @ts-expect-error guards the assignment itself.
    // @ts-expect-error windowSize requires a number, not a ChainPolicy-like object.
    const wrongDistance: AnalysisDistanceCommand = { scope: { kind: 'default' }, key: 'windowSize', value: { breakOnSameFinger: true } };
    // @ts-expect-error speedMultiplier requires a number.
    const wrongTiming: AnalysisTimingCommand = { scope: { kind: 'layout', layoutId: 'qwerty' }, key: 'speedMultiplier', value: true };
    // @ts-expect-error default scope cannot reset to undefined.
    const wrongDefaultReset: AnalysisTimingCommand = { scope: { kind: 'default' }, key: 'speedMultiplier', value: undefined };
    void wrongDistance;
    void wrongTiming;
    void wrongDefaultReset;
  }
});
