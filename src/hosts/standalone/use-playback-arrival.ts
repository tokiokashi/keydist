import { useEffect, useRef, useState } from 'react';
import { analysisTargetKey } from '#input/setup/index.ts';
import { decodePlaybackPositionFromUrl, decodeSingleTargetFromUrl, SHARE_POSITION_PARAM, type TargetShareSource } from './target-share.ts';

/** 別の画面の図から開いた時の最初の文字位置。 */
export interface PlaybackArrival {
  readonly charPosition: number;
  /** リンクが運んだ対象のkey。対象が運ばれていない・見つからない時は`undefined` */
  readonly targetKey: string | undefined;
}

/**
 * 別の画面の図（Run Chart）から打鍵再生の画面を開いた時の、最初の文字位置を受け取る。受け取るのは資産の初回読み込みの後の1回だけで、
 * 受け取ったらURLの`position`を消す（開いた時の位置だけを使い、URLへ書き戻さない）。
 * 共有リンクの取り込み（`useSharedLink`）が`target`をURLから消す前に対象を読めるよう、`useSharedLink`より前に呼ぶ。
 */
export function usePlaybackArrival(enabled: boolean, assetsReady: boolean, source: TargetShareSource): PlaybackArrival | undefined {
  const [arrival, setArrival] = useState<PlaybackArrival | undefined>(undefined);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const readRef = useRef(false);
  useEffect(() => {
    if (!enabled || !assetsReady || readRef.current) return;
    readRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const charPosition = decodePlaybackPositionFromUrl(params);
    if (!params.has(SHARE_POSITION_PARAM)) return;
    if (charPosition !== undefined) {
      const target = decodeSingleTargetFromUrl(params, sourceRef.current, []).target;
      setArrival({ charPosition, targetKey: target === undefined ? undefined : analysisTargetKey(target) });
    }
    params.delete(SHARE_POSITION_PARAM);
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, [enabled, assetsReady]);
  return arrival;
}
