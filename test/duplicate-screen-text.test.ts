import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// 画面に出る失敗の理由・診断の文を、同じ意味のものは1か所にだけ書く。
// 文を手で並べて探すと、並べ漏れた文が残る。そこで、ソース（テストを除く）から日本語を含む
// 文字列リテラルを機械的に全部取り出し、同じものが2回以上出たらそれだけで落とす。
// 重複してよいのは、失敗の理由でも診断でもない文（ラベル・項目名・操作の説明など）だけで、
// 下の一覧に理由と共に明示する。一覧に無い重複は、失敗の理由・診断なら定数か関数にまとめる。

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const MIN_LENGTH = 8;

// 失敗の理由でも診断でもない文。同じ言葉が別の画面の部品で使われているだけで、直し漏れが問題になる文ではない。
const NOT_FAILURE_TEXT: ReadonlySet<string> = new Set([
  '方向分布の表示倍率',
  '距離の単位uは、キーの幅を1とした距離。',
  '同じ手の続きの割合',
  '列の見出しを押すと切り替わります。',
  '（全レイヤー合算・線形）',
  'ヒートマップ（レイヤー）',
  'レイヤーの並べ方',
  '同じ指の移動時間を考慮',
  '全指の移動時間で律速',
  '同手・別指の速度',
  '異手の方向別の速度',
  '同時押しの上乗せ',
  'Chainの動的表示',
  'Arpeggioの動的表示',
  '同指移動の動的表示',
  '押下予定キーを表示',
  '入力の行にローマ字を表示',
  '今のかなの残りキーを配列図に表示',
  '押下履歴を残すステップ数',
  '順番ラベルを表示',
  '押下フィードバック',
  '指位置の準備時間',
  'サイドバーを開く',
  '選んだキーの基本の指',
  "${fullLabel}だけを${measured ? '測り直す' : '測る'}",
  'まだ測っていません。',
  '（続け打ちは残ります）',
  '測ると、測った同時押しの上乗せが置き換わります。',
  'テキストを変更する',
  '空いた所に詰める',
  'Workspaceに追加',
  '同指連続のホーム復帰距離',
  '親指シフトの振り替え',
  'シフト系キーの押し続け',
  'チェーンの区切り',
  '日本語の記号の評価',
  '対象と条件は変わりません',
  '配列・Setupを名前で絞り込む',
  '新しいテキストがあります',
  '今の対象と解析設定を含むこの画面のURLをコピーします',
  'QWERTY最適化',
  'っ${kana}',
  '${source.name}のコピー',
  '「${title}」を元に戻す',
  '${name}の表示',
  '${name}の説明',
  '外向き ${(outwardRate * 100).toFixed(1)}%',
  '内向き ${(inwardRate * 100).toFixed(1)}%',
]);

async function sourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(path);
  }
  return files;
}

// 1行に収まる文字列リテラルで、日本語を含み、タグや属性の断片でないもの。
const LITERAL = /(['"`])((?:(?!\1).)*[぀-ヿ一-鿿](?:(?!\1).)*)\1/g;

test('日本語の文字列リテラルは、失敗の理由・診断の文を2か所に書かない', async () => {
  const found = new Map<string, string[]>();
  for (const file of await sourceFiles(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/');
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const match of line.matchAll(LITERAL)) {
        const text = match[2]!;
        if (text.length < MIN_LENGTH || /[<=]/.test(text) || /^[ :]/.test(text)) continue;
        found.set(text, [...(found.get(text) ?? []), `${rel}:${index + 1}`]);
      }
    });
  }
  const problems = [...found]
    .filter(([text, places]) => places.length > 1 && !NOT_FAILURE_TEXT.has(text.trimEnd()))
    .map(([text, places]) => `「${text}」が複数の場所にある: ${places.join(' ')}`);
  assert.deepEqual(problems, []);
});
