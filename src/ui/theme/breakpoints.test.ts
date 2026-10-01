import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MOBILE_MAX_WIDTH, MOBILE_QUERY } from './breakpoints.ts';

// CSSの@mediaには変数が使えない。スマホ幅の境目は1つの定数（breakpoints.ts）から作り、
// CSS側は直書きの値がそれと一致していることをここで検査する。

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** 旧Analyzer（切り替え時に削除）は検査の対象にしない。 */
function sourceFiles(dir: string, extension: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'legacy' ? [] : sourceFiles(path, extension);
    return extension.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/** スマホ幅の境目ではない、別の目的の幅の分岐（値と理由）。ここに無い幅を足すと下のテストが落ちる。 */
const OTHER_BREAKPOINTS: ReadonlyMap<number, string> = new Map([
  [560, 'app.css: 狭い幅の詰め方'],
  [700, 'standalone-view.css: 単体ページの中身の並べ方'],
  [900, 'app.css: 中間幅の並べ方'],
  [1200, 'app.css: 広い幅の並べ方'],
]);

function maxWidths(source: string): number[] {
  return [...source.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/g)].map((match) => Number(match[1]));
}

test('スマホ幅の問い合わせは定数から作る', () => {
  assert.equal(MOBILE_QUERY, `(max-width: ${MOBILE_MAX_WIDTH}px)`);
});

test('CSSの@mediaのmax-widthは、スマホ幅の境目か、理由を書いた別の境目のどちらかである', () => {
  const found = new Map<string, number[]>();
  for (const file of sourceFiles(SRC, /\.css$/)) found.set(relative(SRC, file), maxWidths(readFileSync(file, 'utf8')));
  const stray = [...found].flatMap(([file, widths]) =>
    widths.filter((width) => width !== MOBILE_MAX_WIDTH && !OTHER_BREAKPOINTS.has(width)).map((width) => `${file}: ${width}px`));
  assert.deepEqual(stray, [], `スマホ幅の境目は ${MOBILE_MAX_WIDTH}px（ui/theme/breakpoints.ts）。別の幅にする理由があれば OTHER_BREAKPOINTS に足す`);
  const mobileFiles = [...found].filter(([, widths]) => widths.includes(MOBILE_MAX_WIDTH)).map(([file]) => file);
  // シート・縦積み・見出し1行のCSSが定数の値で書かれていること（定数だけ変えて取り残されたCSSを拾う）。
  for (const expected of ['app/shell/shell.css', 'hosts/shared/context-bar.css', 'hosts/shared/pane-frame.css', 'hosts/shared/target-selection.css', 'hosts/shared/condition-editor.css']) {
    assert.ok(mobileFiles.includes(expected), `${expected} に @media (max-width: ${MOBILE_MAX_WIDTH}px) が無い`);
  }
});

test('TypeScriptにスマホ幅の問い合わせを直書きしない（breakpoints.ts から読む）', () => {
  const literal = /\(max-width:\s*\d+px\)/;
  const offenders = sourceFiles(SRC, /\.tsx?$/)
    .filter((file) => !file.endsWith('breakpoints.ts') && literal.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file));
  assert.deepEqual(offenders, []);
});
