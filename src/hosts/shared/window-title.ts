import { createElement } from 'react';

/**
 * 小窓の見出しの語（`FloatingWindow`が使う）。`.ts`で書くのは、unit testが`.tsx`を読めないため
 * （`OptionsWriteLogsContext.ts`と同じ理由）。
 * 見出しにするのは語だけにする。ペイン名は読み上げ名（dialogのaria-label）に含まれ、見出しの名前を語と一致させるため外に置く。
 * 見出しの大きさ・太さ・余白は`pane-frame.css`の`.settings-window-title-text`が決めるので、h2にしても見た目は変わらない。
 */
export function WindowTitle({ title, paneName, heading }: {
  readonly title: string;
  readonly paneName?: string | undefined;
  readonly heading: boolean;
}) {
  return createElement(
    'span',
    { className: 'settings-window-title' },
    createElement(heading ? 'h2' : 'span', { className: 'settings-window-title-text' }, title),
    paneName === undefined ? null : createElement('span', { className: 'settings-window-pane' }, paneName),
  );
}
