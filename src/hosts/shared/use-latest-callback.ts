import { useCallback, useRef } from 'react';

/**
 * 呼ぶたびに最新の関数を実行する、参照の変わらない関数を返す。
 * 器（`app`）は元に戻すを描画のたびに作り直す（待っている書き込みを先に反映する処理を包むため）。
 * そのまま`PaneEnvironment`へ入れると、器の描画のたびに環境の参照が変わるので、参照を固定して渡す。
 */
export function useLatestCallback<A extends readonly unknown[], R>(callback: (...args: A) => R): (...args: A) => R {
  const ref = useRef(callback);
  ref.current = callback;
  return useCallback((...args: A) => ref.current(...args), []);
}
