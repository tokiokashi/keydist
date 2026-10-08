#!/usr/bin/env node
// リリースPRの差分がversionの変更だけかを確かめる。release-plan.shが呼ぶ。
//
// 使い方: release-version-only.cjs <fork> <head> <version>
//   package.jsonのversionと、package-lock.jsonのversion（ルートとpackages[""]）を
//   <version> と確かめた上で取り除き、forkとheadの両ファイルが一致することを確かめる。
//   行の形ではなく解析したJSONで比べるので、依存関係のversion行やscriptsの変更は
//   versionの行に見えても通らない。外れた箇所は標準出力へ1行ずつ書き、1で終わる。
'use strict';
const { execFileSync } = require('node:child_process');

// 値の違いをJSONのパスで列挙する
function diffPaths(a, b, path = '') {
  if (a === b) return [];
  const isObj = (v) => v !== null && typeof v === 'object';
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) return [path || '(ルート)'];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((k) => diffPaths(a[k], b[k], `${path}/${k}`));
}

// versionを置く位置。ここだけが変わってよい
const versionPaths = {
  'package.json': [['version']],
  'package-lock.json': [['version'], ['packages', '', 'version']],
};

const parent = (root, p) => p.slice(0, -1).reduce((o, k) => o?.[k], root);

function check(readAt, version) {
  const problems = [];
  for (const [file, paths] of Object.entries(versionPaths)) {
    const before = JSON.parse(readAt('before', file));
    const after = JSON.parse(readAt('after', file));
    for (const p of paths) {
      const last = p[p.length - 1];
      const a = parent(after, p);
      if (a?.[last] !== version) {
        problems.push(`${file}: /${p.join('/')} が ${version} ではない（${JSON.stringify(a?.[last])}）`);
        continue;
      }
      delete a[last];
      const b = parent(before, p);
      if (b && typeof b === 'object') delete b[last];
    }
    for (const d of diffPaths(before, after)) problems.push(`${file}: ${d} がversion以外で変わっている`);
  }
  return problems;
}

module.exports = { check };

if (require.main === module) {
  const [fork, head, version] = process.argv.slice(2);
  const readAt = (side, file) =>
    execFileSync('git', ['show', `${side === 'before' ? fork : head}:${file}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
  let problems;
  try {
    problems = check(readAt, version);
  } catch (e) {
    // JSONが壊れている・ファイルが無いなど。原因を違反として出し、公開を止める
    problems = [`検査を実行できない: ${String(e.message).split('\n')[0]}`];
  }
  for (const p of problems) console.log(p);
  process.exit(problems.length ? 1 : 0);
}
