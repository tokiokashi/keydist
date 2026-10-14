import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calibrationTaskAcceptsSpace,
  currentCalibrationTask,
  pressCalibrationKey,
  startCalibrationRun,
  type CalibrationRun,
  type CalibrationScope,
  type CalibrationTask,
} from '#interpretation/timing/calibration-session.ts';
import { captureCalibrationKeys } from './key-capture.ts';

export interface CalibrationRunOptions {
  /** 案内と照合に使う、キーidに対応する刻印の名前。 */
  readonly keyLabel: (keyId: string) => string;
  /** 全項目が済んだ時。最新の描画の値で呼ばれる。 */
  readonly onFinished: (run: CalibrationRun) => void;
}

export interface CalibrationRunController {
  /** 測定中の進行。測定中でなければ無い。 */
  readonly run: CalibrationRun | undefined;
  /** 直前の打鍵が次のキーと違った時の、次に打つキーの名前。次の正しい打鍵で消える。 */
  readonly wrongKey: string | undefined;
  start(scope: CalibrationScope, tasks: readonly CalibrationTask[]): void;
  cancel(): void;
}

/**
 * 測定の進行を持ち、測定中だけキー入力を取る。キーの取得は`start`から、全項目が済むか
 * `cancel`するまでの間だけ登録する（`key-capture.ts`）。
 */
export function useCalibrationRun(options: CalibrationRunOptions): CalibrationRunController {
  const [run, setRun] = useState<CalibrationRun | undefined>(undefined);
  const [wrongKey, setWrongKey] = useState<string | undefined>(undefined);
  // 打鍵ごとに最新の進行を読む。描画を待たずに続けて届く打鍵でも取りこぼさないよう、refにも持つ。
  const runRef = useRef<CalibrationRun | undefined>(undefined);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const active = run !== undefined;

  useEffect(() => {
    if (!active) return undefined;
    const stop = captureCalibrationKeys(document, (event) => {
      const current = runRef.current;
      if (current === undefined) return;
      const { keyLabel, onFinished } = optionsRef.current;
      const pressed = pressCalibrationKey(current, event, event.timeStamp, keyLabel);
      if (pressed.outcome.kind === 'wrong-key') {
        setWrongKey(keyLabel(pressed.outcome.expectedKey));
        return;
      }
      // 次に打つキーだった。ブラウザの検索などの働きと、他の層のキー操作へ渡さない。
      event.preventDefault();
      event.stopPropagation();
      if (pressed.outcome.kind === 'ignored') return;
      setWrongKey(undefined);
      if (pressed.outcome.kind === 'run-finished') {
        runRef.current = undefined;
        setRun(undefined);
        onFinished(pressed.run);
        return;
      }
      runRef.current = pressed.run;
      setRun(pressed.run);
    }, {
      // 親指との同時押しを測る間だけSpaceを受け付ける。その間のSpaceは、スクロールとボタンの押下へ渡さない。
      acceptsSpace: () => runRef.current !== undefined && calibrationTaskAcceptsSpace(currentCalibrationTask(runRef.current)),
    });
    return stop;
  }, [active]);

  const start = useCallback((scope: CalibrationScope, tasks: readonly CalibrationTask[]) => {
    if (tasks.length === 0) return;
    const next = startCalibrationRun(scope, tasks);
    runRef.current = next;
    setWrongKey(undefined);
    setRun(next);
  }, []);

  const cancel = useCallback(() => {
    runRef.current = undefined;
    setWrongKey(undefined);
    setRun(undefined);
  }, []);

  return { run, wrongKey, start, cancel };
}
