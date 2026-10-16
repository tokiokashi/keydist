import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { WindowTitle } from './window-title.ts';

// 解析設定と図の表示の小窓は、見出しの語をh2にする。その中のグループの見出し（h3）の1つ上になる。
// キーの詳細は見出しを持たせない（本文のh4以下との並びを変えない）。
// 小窓の本体はbodyへ出すポータルなので、ここでは見出しの部分だけを描いて確かめる。

test('見出しにする小窓の語はh2になる', () => {
  const html = renderToString(createElement(WindowTitle, { title: '解析設定', heading: true }));
  assert.equal(html, '<span class="settings-window-title"><h2 class="settings-window-title-text">解析設定</h2></span>');
});

test('見出しにしない小窓の語はspanのままになる', () => {
  const html = renderToString(createElement(WindowTitle, { title: 'キーの詳細', heading: false }));
  assert.equal(html, '<span class="settings-window-title"><span class="settings-window-title-text">キーの詳細</span></span>');
});

test('ペイン名は見出しの外の別の要素として出る', () => {
  const html = renderToString(createElement(WindowTitle, { title: '図', paneName: 'Bigram Flow', heading: true }));
  assert.equal(
    html,
    '<span class="settings-window-title"><h2 class="settings-window-title-text">図</h2><span class="settings-window-pane">Bigram Flow</span></span>',
  );
});
