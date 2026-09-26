import test from 'node:test';
import type {
  AnalysisDistanceCommand,
  AnalysisTimingCommand,
} from '../src/features/analyzer-next/views/view-contract.ts';

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
    const wrongDistance: AnalysisDistanceCommand = {
      scope: { kind: 'default' },
      key: 'windowSize',
      // @ts-expect-error windowSize requires a number, not a ChainPolicy-like object.
      value: { breakOnSameFinger: true },
    };
    const wrongTiming: AnalysisTimingCommand = {
      scope: { kind: 'layout', layoutId: 'qwerty' },
      key: 'speedMultiplier',
      // @ts-expect-error speedMultiplier requires a number.
      value: true,
    };
    const wrongDefaultReset: AnalysisTimingCommand = {
      scope: { kind: 'default' },
      key: 'speedMultiplier',
      // @ts-expect-error default scope cannot reset to undefined.
      value: undefined,
    };
    void wrongDistance;
    void wrongTiming;
    void wrongDefaultReset;
  }
});
