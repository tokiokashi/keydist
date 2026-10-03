import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { OptionsWriteLogsProvider } from './OptionsWriteLogsContext.ts';
import { createOptionsWriteLogs } from './options-write-log.ts';
import { useOptionsDraft } from './use-options-draft.ts';

// 書き込みの記録が渡されない画面は、静かに保存の反響で入力が巻き戻る不具合（#935）へ戻る。
// ページの名前や組み立て場所に関係なく気づけるよう、下書きは記録が無ければ描画で例外を投げる。

const stored = { on: true };

function Draft() {
  const [draft] = useOptionsDraft(stored, 'standalone');
  return createElement('span', null, String(draft.on));
}

test('OptionsWriteLogsProviderの外で解析設定の下書きを使うと、描画が例外になる', () => {
  assert.throws(() => renderToString(createElement(Draft)), /OptionsWriteLogsProviderの外/);
});

test('OptionsWriteLogsProviderで包めば描画できる', () => {
  const html = renderToString(createElement(OptionsWriteLogsProvider, { logs: createOptionsWriteLogs(), children: createElement(Draft) }));
  assert.match(html, /true/);
});
