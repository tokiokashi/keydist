import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pressSentenceKey,
  startSentenceRun,
  type SentenceRun,
  type SentenceStep,
} from '#interpretation/timing/sentence-session.ts';
import { captureCalibrationKeys } from './key-capture.ts';

export interface SentenceRunOptions {
  /** 案内と照合に使う、キーidに対応する刻印の名前。 */
  readonly keyLabel: (keyId: string) => string;
  /** 全ステップが済んだ時。最新の描画の値で呼ばれる。 */
  readonly onFinished: (run: SentenceRun) => void;
}

export interface SentenceRunController {
  /** 測定中の進行。測定中でなければ無い。 */
  readonly run: SentenceRun | undefined;
  /** 直前の打鍵が違うキーだった時の、次に打つキーの名前。次の正しい打鍵で消える。 */
  readonly wrongKey: string | undefined;
  start(steps: readonly SentenceStep[]): void;
  cancel(): void;
}

/**
 * 示す文を打つ測定の進行を持ち、測定中だけキー入力を取る。キーの取得は`start`から、全ステップが済むか
 * `cancel`するまでの間だけ登録する（`key-capture.ts`）。
 */
export function useSentenceRun(options: SentenceRunOptions): SentenceRunController {
  const [run, setRun] = useState<SentenceRun | undefined>(undefined);
  const [wrongKey, setWrongKey] = useState<string | undefined>(undefined);
  // 打鍵ごとに最新の進行を読む。描画を待たずに続けて届く打鍵でも取りこぼさないよう、refにも持つ。
  const runRef = useRef<SentenceRun | undefined>(undefined);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const active = run !== undefined;

  useEffect(() => {
    if (!active) return undefined;
    return captureCalibrationKeys(document, (event) => {
      const current = runRef.current;
      if (current === undefined) return;
      const { keyLabel, onFinished } = optionsRef.current;
      const pressed = pressSentenceKey(current, event, event.timeStamp, keyLabel);
      if (pressed.outcome.kind === 'wrong-key') {
        // 違うキーを押したストロークは、間隔を数えない印を進行に残す。
        runRef.current = pressed.run;
        setRun(pressed.run);
        // 出力の文字の読み方だけが残っている時は、キーボードが送る文字をそのまま案内する。
        setWrongKey(pressed.outcome.expectedIsOutput ? pressed.outcome.expectedKey.toUpperCase() : keyLabel(pressed.outcome.expectedKey));
        return;
      }
      // 打つキーだった。ブラウザの検索などの働きと、他の層のキー操作へ渡さない。
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
    });
  }, [active]);

  const start = useCallback((steps: readonly SentenceStep[]) => {
    if (steps.length === 0) return;
    const next = startSentenceRun(steps);
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
