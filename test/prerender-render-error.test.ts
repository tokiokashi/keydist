import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderErrorPages } from '../scripts/prerender-render-error.ts';

// 描画が成功したページ（Suspense境界の開始・終了のマーカーだけ）
const healthyHtml = '<main class="app-shell"><!--$--><p>本文</p><!--/$--></main>';
// 描画中に例外を投げた境界（`<!--$!-->` の中身は空でブラウザ描画に任される）
const failedHtml = '<main class="app-shell"><!--$!--><template></template><!--/$--></main>';

describe('prerenderの描画エラーの判定', () => {
  it('描画に成功したページは対象にしない', () => {
    assert.deepEqual(renderErrorPages([{ path: 'about/index.html', html: healthyHtml }]), []);
  });

  it('描画中に例外を投げた境界のあるページのパスを返す', () => {
    assert.deepEqual(
      renderErrorPages([
        { path: 'about/index.html', html: healthyHtml },
        { path: 'analyzer/heatmap/index.html', html: failedHtml },
      ]),
      ['analyzer/heatmap/index.html'],
    );
  });
});
