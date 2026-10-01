import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MOBILE_MAX_WIDTH, MOBILE_QUERY } from './breakpoints.ts';

// CSSの@mediaには変数が使えない。スマホ幅の境目は1つの定数（breakpoints.ts）から作り、
// CSS側は直書きの値がそれと一致していることをここで検査する。
// 幅の条件は `(max-width: 760px)` の1つの書き方に限る。range構文・rem/em・大文字・空白違いは、
// 値を読み違えて素通りするので、正規形でなければ落とす。

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** 旧Analyzer（切り替え時に削除）は検査の対象にしない。 */
function sourceFiles(dir: string, extension: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'legacy' ? [] : sourceFiles(path, extension);
    return extension.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/** スマホ幅の境目ではない、別の目的の幅の条件（正規形の文字列と理由）。ここに無い条件を足すと下のテストが落ちる。 */
const OTHER_CONDITIONS: ReadonlyMap<string, string> = new Map([
  ['max-width: 560px', 'app.css: 狭い幅の詰め方'],
  ['max-width: 640px', 'pane-frame.css: 条件のモーダルの中の対象ごとの差の並べ方'],
  ['max-width: 700px', 'standalone-view.css: 単体ページの中身の並べ方'],
  ['min-width: 901px', 'app.css: 中間幅の並べ方'],
  ['max-width: 900px', 'app.css: 中間幅の並べ方'],
  ['max-width: 1200px', 'app.css: 広い幅の並べ方'],
]);

const MOBILE_CONDITION = `max-width: ${MOBILE_MAX_WIDTH}px`;

/** `@media` の前置きに現れる、幅に関する括弧の中身（コメントを除いた原文のまま）。 */
function cssWidthConditions(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const preludes = [...withoutComments.matchAll(/@media([^{]*)\{/gi)].map((match) => match[1] ?? '');
  return preludes.flatMap((prelude) =>
    [...prelude.matchAll(/\(([^()]*)\)/g)].map((match) => match[1] ?? '').filter((inner) => /width/i.test(inner)));
}

/** TSの中の、幅の問い合わせを組み立てている箇所（テンプレート・連結・range構文を含む）。 */
function tsWidthQueries(source: string): string[] {
  // 式の `(width < x)` を拾わないよう、文字列の始まり（引用符の直後）か `and` の後の括弧に限る。
  const pattern = /(?:['"`]|\band\s)\s*\(\s*(?:(?:(?:min|max)-)?width\s*[:<>=]|\d+(?:\.\d+)?(?:px|r?em)\s*[<>]=?\s*width)/gi;
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

test('スマホ幅の問い合わせは定数から作る', () => {
  assert.equal(MOBILE_QUERY, `(${MOBILE_CONDITION})`);
});

test('検査自体: 素通りしやすい書き方を拾う', () => {
  const css = (query: string) => cssWidthConditions(`@media ${query} { a { color: red } }`);
  for (const query of ['(width <= 640px)', '(max-width: 40rem)', '(max-width : 640px)', '(MAX-WIDTH: 640px)', '(min-width: 641px)', '(640px <= width)', '(max-width:640px)']) {
    const conditions = css(query);
    assert.equal(conditions.length, 1, query);
    assert.ok(conditions[0] !== MOBILE_CONDITION && !OTHER_CONDITIONS.has(conditions[0]!), `${query} は正規形でない`);
  }
  assert.deepEqual(css('(max-width: 760px) and (prefers-reduced-motion: reduce)'), [MOBILE_CONDITION]);
  assert.deepEqual(css('(prefers-reduced-motion: reduce)'), []);
  for (const literal of ["'(width <= 640px)'", '`(max-width: ${640}px)`', "'(max-width:' + 640 + 'px)'", "'(max-width : 640px)'", "'(MIN-WIDTH: 641px)'", "'(640px <= width)'"]) {
    assert.notEqual(tsWidthQueries(literal).length, 0, literal);
  }
  assert.deepEqual(tsWidthQueries('const style = `width: ${w}px`;'), []);
});

test('CSSの@mediaの幅の条件は、スマホ幅の境目か、理由を書いた別の条件のどちらかである', () => {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(SRC, /\.css$/)) found.set(relative(SRC, file), cssWidthConditions(readFileSync(file, 'utf8')));
  const stray = [...found].flatMap(([file, conditions]) =>
    conditions.filter((condition) => condition !== MOBILE_CONDITION && !OTHER_CONDITIONS.has(condition)).map((condition) => `${file}: (${condition})`));
  assert.deepEqual(stray, [], `スマホ幅の境目は (${MOBILE_CONDITION})（ui/theme/breakpoints.ts）。別の幅にする理由があれば OTHER_CONDITIONS に足す`);
  const mobileFiles = [...found].filter(([, conditions]) => conditions.includes(MOBILE_CONDITION)).map(([file]) => file);
  // スマホ幅の出し方を持つCSSが定数の値で書かれていること（定数だけ変えて取り残されたCSSを拾う）。
  for (const expected of [
    'app/app.css',
    'app/shell/shell.css',
    'hosts/shared/context-bar.css',
    'hosts/shared/pane-frame.css',
    'hosts/shared/target-selection.css',
    'hosts/shared/condition-editor.css',
    'hosts/standalone/standalone.css',
  ]) {
    assert.ok(mobileFiles.includes(expected), `${expected} に @media (${MOBILE_CONDITION}) が無い`);
  }
});

test('TypeScriptは breakpoints.ts の外で幅の問い合わせを組み立てない', () => {
  const offenders = sourceFiles(SRC, /\.tsx?$/)
    .filter((file) => !file.endsWith('breakpoints.ts'))
    .flatMap((file) => tsWidthQueries(readFileSync(file, 'utf8')).map((hit) => `${relative(SRC, file)}: ${hit}`));
  assert.deepEqual(offenders, []);
});
