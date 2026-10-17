import { useCallback, useEffect, useRef, useState } from 'react';
import { pressSentenceSessionKey, startSentenceSession, type SentenceSession, type SentencePlan } from '#interpretation/timing/sentence-session.ts';
import { captureCalibrationKeys } from './key-capture.ts';

export interface SentenceRunOptions {
  /** 案内と照合に使う、キーidに対応する刻印の名前。 */
  readonly keyLabel: (keyId: string) => string;
  /** 全文の全回が済んだ時。最新の描画の値で呼ばれる。 */
  readonly onFinished: (session: SentenceSession) => void;
}

export interface SentenceRunController {
  /** 測定中の進行。測定中でなければ無い。 */
  readonly session: SentenceSession | undefined;
  /** 直前の打鍵が違うキーだった時の、次に打つキーの名前。次の正しい打鍵で消える。 */
  readonly wrongKey: string | undefined;
  start(plans: readonly SentencePlan[]): void;
  cancel(): void;
}

/**
 * 示す文を打つ測定の進行を持ち、測定中だけキー入力を取る。キーの取得は`start`から、全文の全回が済むか
 * `cancel`するまでの間だけ登録する（`key-capture.ts`）。
 */
export function useSentenceRun(options: SentenceRunOptions): SentenceRunController {
  const [session, setSession] = useState<SentenceSession | undefined>(undefined);
  const [wrongKey, setWrongKey] = useState<string | undefined>(undefined);
  // 打鍵ごとに最新の進行を読む。描画を待たずに続けて届く打鍵でも取りこぼさないよう、refにも持つ。
  const sessionRef = useRef<SentenceSession | undefined>(undefined);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const active = session !== undefined;

  useEffect(() => {
    if (!active) return undefined;
    return captureCalibrationKeys(document, (event) => {
      const current = sessionRef.current;
      if (current === undefined) return;
      const { keyLabel, onFinished } = optionsRef.current;
      const pressed = pressSentenceSessionKey(current, event, event.timeStamp, keyLabel);
      if (pressed.outcome.kind === 'wrong-key') {
        // 違うキーを押したストロークは、間隔を数えない印を進行に残す。
        sessionRef.current = pressed.session;
        setSession(pressed.session);
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
        sessionRef.current = undefined;
        setSession(undefined);
        onFinished(pressed.session);
        return;
      }
      sessionRef.current = pressed.session;
      setSession(pressed.session);
    });
  }, [active]);

  const start = useCallback((plans: readonly SentencePlan[]) => {
    if (plans.length === 0 || plans.some((plan) => plan.units.length === 0)) return;
    const next = startSentenceSession(plans);
    sessionRef.current = next;
    setWrongKey(undefined);
    setSession(next);
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current = undefined;
    setWrongKey(undefined);
    setSession(undefined);
  }, []);

  return { session, wrongKey, start, cancel };
}
