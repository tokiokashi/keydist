import { useEffect, useRef, useState } from 'react';
import type { FigureImageSource } from './pane-parts.tsx';
import './copy-image-control.css';

/**
 * 図を画像にして書き出すボタンと、結果の知らせ。散布図と帯グラフが使う。
 * 書き出し先と、要素を画像にする処理はホストが持つ（`SetBodyProps.copyFigureImage`）。
 */

/** 画像の書き出しの結果を、ボタンのそばにしばらく出す時間 [ms]。 */
const COPY_STATUS_MS = 1800;
const COPY_IMAGE_LABEL = '図を画像でコピー';

/** 図を画像にして書き出すボタンと、結果の知らせ。 */
export function CopyImageControl({
  copyFigureImage,
  source,
}: {
  readonly copyFigureImage: (source: FigureImageSource) => Promise<boolean>;
  readonly source: () => FigureImageSource | undefined;
}) {
  const [result, setResult] = useState<'copied' | 'failed' | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const show = (next: 'copied' | 'failed') => {
    setResult(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setResult(undefined), COPY_STATUS_MS);
  };
  const copy = () => {
    const target = source();
    if (target === undefined) {
      show('failed');
      return;
    }
    copyFigureImage(target).then(
      (copied) => show(copied ? 'copied' : 'failed'),
      () => show('failed'),
    );
  };
  return (
    <span className="copy-image">
      <button type="button" className="copy-image-button" aria-label={COPY_IMAGE_LABEL} title={COPY_IMAGE_LABEL} onClick={copy}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <rect x="5.25" y="5.25" width="8.25" height="8.25" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M10.75 3.5V3.1c0-.9-.7-1.6-1.6-1.6H3.1c-.9 0-1.6.7-1.6 1.6v6.05c0 .9.7 1.6 1.6 1.6h.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <span className="copy-image-status" role="status">
        {result === 'copied' ? '画像をコピーしました' : result === 'failed' ? '画像をコピーできませんでした' : ''}
      </span>
    </span>
  );
}
