import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, '..', '.github', 'scripts', 'release-version-only.cjs');
const root = join(import.meta.dirname, '..');

let dir = '';
const run = (cmd: string, ...args: string[]) => execFileSync(cmd, args, { cwd: dir, encoding: 'utf8' }).trim();
const git = (...args: string[]) => run('git', ...args);

// 実物の package.json と package-lock.json を置いた作業用リポジトリで、変更を1コミットにして検査を回す
function verdict(edit: () => void, version: () => string): { ok: boolean; out: string } {
  git('checkout', '-q', '-B', 'work', 'base');
  edit();
  git('commit', '-q', '-am', 'release');
  const r = spawnSync('node', [script, 'base', 'HEAD', version()], { cwd: dir, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout };
}

const editJson = (file: string, f: (j: any) => void) => {
  const j = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  f(j);
  writeFileSync(join(dir, file), JSON.stringify(j, null, 2) + '\n');
};

// package.json と package-lock.json の version（ルートと packages[""]）を揃えて書き換える
function setVersion(version: string) {
  editJson('package.json', (j) => (j.version = version));
  editJson('package-lock.json', (j) => {
    j.version = version;
    j.packages[''].version = version;
  });
}

describe('release-version-only', () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'release-version-only-'));
    git('init', '-q', '-b', 'base');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(root, f), join(dir, f));
    git('add', '.');
    git('commit', '-q', '-m', 'base');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('npm version patch の差分（package.json 1行、package-lock.json 2行）は通る', () => {
    let next = '';
    const r = verdict(
      () => {
        run('npm', 'version', 'patch', '--no-git-tag-version');
        next = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
      },
      () => next,
    );
    assert.equal(r.ok, true, r.out);
    assert.equal(git('diff', '-U0', 'base', 'HEAD', '--', 'package.json').match(/^\+ .*"version"/gm)?.length, 1);
    assert.equal(git('diff', '-U0', 'base', 'HEAD', '--', 'package-lock.json').match(/^\+ .*"version"/gm)?.length, 2);
  });

  test('npm version が出した版番号と違う版番号を期待すれば通らない', () => {
    const r = verdict(
      () => {
        run('npm', 'version', 'patch', '--no-git-tag-version');
      },
      () => '9.9.9',
    );
    assert.equal(r.ok, false);
  });

  test('依存関係を足した差分は、version の行が正しくても通らない', () => {
    const r = verdict(
      () => {
        setVersion('9.9.9');
        editJson('package.json', (j) => {
          j.dependencies = { ...j.dependencies, leftpad: '1.0.0' };
        });
      },
      () => '9.9.9',
    );
    assert.equal(r.ok, false);
    assert.match(r.out, /package\.json: \/dependencies\/leftpad/);
  });

  test('scripts の行を変えた差分は通らない', () => {
    const r = verdict(
      () => {
        setVersion('9.9.9');
        editJson('package.json', (j) => {
          j.scripts.test = 'echo hi';
        });
      },
      () => '9.9.9',
    );
    assert.equal(r.ok, false);
    assert.match(r.out, /package\.json: \/scripts\/test/);
  });

  test('package-lock.json の依存の version 行を変えた差分は、version の行でも通らない', () => {
    const r = verdict(
      () => {
        setVersion('9.9.9');
        editJson('package-lock.json', (j) => {
          const k = Object.keys(j.packages).find((p) => p.startsWith('node_modules/') && j.packages[p].version)!;
          j.packages[k].version = '0.0.0-changed';
        });
      },
      () => '9.9.9',
    );
    assert.equal(r.ok, false);
    assert.match(r.out, /package-lock\.json: \/packages\/node_modules\//);
  });

  test('package-lock.json の packages[""] の version が上がっていなければ通らない', () => {
    const r = verdict(
      () => {
        editJson('package.json', (j) => (j.version = '9.9.9'));
        editJson('package-lock.json', (j) => (j.version = '9.9.9'));
      },
      () => '9.9.9',
    );
    assert.equal(r.ok, false);
    assert.match(r.out, /packages\/\/version/);
  });
});
