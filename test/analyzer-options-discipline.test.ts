import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkOptionsDiscipline } from '#analyzers/options.ts';
import type { AnalyzerDefinition } from '#analyzers/contract.ts';

/**
 * 解析設定の入れ忘れ防止テストを、全Analyzerに対して自動で回す横断テスト。
 *
 * ## 列挙の方式と置き場所
 *
 * `src/analyzers/*​/*.ts`（`.tsx`・`.test.ts`は除く）をファイルシステムから列挙し、
 * ソースに`defineSingleAnalyzer(`または`defineSetAnalyzer(`の呼び出しがあるファイルだけを
 * 動的importして、中身が実際に`AnalyzerDefinition`（`cardinality`が`'single'`/`'set'`で
 * `optionsDiscipline`を持つ）として使える値をすべて拾う。**手書きの一覧・登録は無い**:
 * 新しいAnalyzerディレクトリを足して`defineSingleAnalyzer`/`defineSetAnalyzer`を呼べば、
 * このテストは次に実行された時に自動でそれを見つける（「一覧に入れ忘れる」余地が無い）。
 *
 * 置き場所を`src/analyzers/`直下や`src/engine/`ではなくリポジトリ直下の`test/`にした理由:
 * `test/architecture-layers.test.ts`の依存規則により、
 * - `analyzers/`直下（契約側）は個別のAnalyzerユニット（`analyzers/bigram-flow/`等）を
 *   importできない（「analyzers の契約は個別のAnalyzerに依存しない」）
 * - `engine`も個別のAnalyzerユニットをimportできない（「engine は Analyzer の契約
 *   （analyzers/ 直下）だけを知る」）
 * ため、全Analyzerユニットを横断してimportする場所はどちらにも置けない。`hosts/`配下は
 * host同士のimport制限は無くAnalyzerユニットのimportも許されるが、これは本番のUI組み立て
 * のための層であり、テストの列挙ロジックを持ち込む場ではない。一方でリポジトリ直下の`test/`は
 * `architecture-layers.test.ts`の依存規則の対象外（`src/`だけを検査する。
 * `architecture-layers.test.ts`自身が同じ理由でここに置かれ、`src/`全体を横断している）なので、
 * 全Analyzerを横断する検査を書くのに最も自然な場所として選んだ。
 *
 * ## なぜ`.tsx`を除外するか
 *
 * `npm test`（`node --experimental-strip-types`）はTypeScriptの型だけを剥がし、JSX構文は
 * 変換できない。Analyzerの契約（抽出・設定）は`docs/architecture.md`の設計で最初から
 * `.tsx`を使わない`.ts`に置かれる（可視化componentとの結び付けだけが`.tsx`＝
 * `definition.tsx`）ので、動的importの対象を`.ts`に絞ることは制約ではなく設計と一致する。
 */

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ANALYZERS_DIR = join(ROOT, 'src', 'analyzers');

const DEFINITION_CALL_PATTERN = /\bdefine(?:Single|Set)Analyzer\s*\(/;

function listAnalyzerTsFiles(): readonly string[] {
  const files: string[] = [];
  for (const unit of readdirSync(ANALYZERS_DIR)) {
    const unitPath = join(ANALYZERS_DIR, unit);
    if (!statSync(unitPath).isDirectory()) continue; // contract.ts / options.ts 等、直下のファイルは対象外
    for (const entry of readdirSync(unitPath)) {
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue; // .tsxとunit testは除く
      files.push(join(unitPath, entry));
    }
  }
  return files;
}

/** `AnalyzerDefinition`らしい値かどうかを実行時に判定する（構造的ダックタイピング）。 */
function looksLikeAnalyzerDefinition(value: unknown): value is AnalyzerDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.cardinality === 'single' || candidate.cardinality === 'set')
    && typeof candidate.id === 'string'
    && typeof candidate.extractKeyOf === 'function'
    && typeof candidate.extract === 'function'
    && typeof candidate.optionsDiscipline === 'object' && candidate.optionsDiscipline !== null
    && typeof candidate.optionsItems === 'object' && candidate.optionsItems !== null
  );
}

interface DiscoveredDefinition {
  readonly file: string;
  readonly exportName: string;
  readonly definition: AnalyzerDefinition;
}

async function discoverAnalyzerDefinitions(): Promise<{
  readonly definitions: readonly DiscoveredDefinition[];
  readonly candidateFiles: readonly string[];
}> {
  const candidateFiles = listAnalyzerTsFiles().filter((file) =>
    DEFINITION_CALL_PATTERN.test(readFileSync(file, 'utf8')),
  );

  const definitions: DiscoveredDefinition[] = [];
  for (const file of candidateFiles) {
    const module = await import(pathToFileURL(file).href) as Record<string, unknown>;
    for (const [exportName, value] of Object.entries(module)) {
      if (looksLikeAnalyzerDefinition(value)) {
        definitions.push({ file, exportName, definition: value });
      }
    }
  }
  return { definitions, candidateFiles };
}

test('全Analyzerの解析設定に入れ忘れが無い（宣言から機械的に検査する横断テスト）', async () => {
  const { definitions, candidateFiles } = await discoverAnalyzerDefinitions();

  // 列挙そのものが機能しているかの確認（0件だとテストが「何も検査していないのに green」
  // という静かな壊れ方をする。最低でもBigram Flowの1件がある）。
  assert.ok(
    definitions.length > 0,
    'AnalyzerDefinitionが1件も見つからなかった（列挙ロジックが壊れている可能性）',
  );

  // `defineSingleAnalyzer`/`defineSetAnalyzer`の呼び出しがあるファイルは、必ず
  // 実際にexportされたAnalyzerDefinitionを1件以上持つはず。呼び出しはあるのにexportに
  // 現れない（ローカル変数のまま・exportし忘れ等）状態を検出する。
  const filesWithDefinitions = new Set(definitions.map((d) => d.file));
  const filesWithoutExportedDefinition = candidateFiles.filter((file) => !filesWithDefinitions.has(file));
  assert.deepEqual(
    filesWithoutExportedDefinition,
    [],
    'defineSingleAnalyzer/defineSetAnalyzerを呼んでいるのに、AnalyzerDefinitionがexportされていないファイルがある',
  );

  for (const { file, exportName, definition } of definitions) {
    const label = `${file.replace(ROOT, '')}#${exportName} (id: ${definition.id})`;

    // `AnalyzerDefinition`（`import type`）はOptionsの実の型を消してある（Analyzerごとに
    // 違う型を横断的に1つの配列へ集めるため）ので、ここでは`unknown`を実の型（`R`）へ
    // 合わせるための境界のcastが要る。`checkOptionsDiscipline`自身は宣言（`items`）を
    // 舐めるだけの実装で、`Options`の実の形を型として要求はしない（`OptionsValueMap<R>`は
    // 実行時には素のオブジェクトでしかない）ため、ここでのcastは安全側（実行時の検査は
    // 型が示す通りに機械的に行われる）。
    const result = checkOptionsDiscipline(
      { items: definition.optionsItems, extractKeyOf: definition.extractKeyOf } as never,
      definition.optionsDiscipline as never,
    );

    assert.deepEqual(
      result.keyViolations,
      [],
      `${label}: affectsの宣言とextractKeyOfの実装が食い違う項目がある: ${result.keyViolations.join(', ')}`,
    );
    assert.deepEqual(
      result.viewExtractionViolations,
      [],
      `${label}: affects:'view'の項目を変えたのに実際のextract結果が変わった（誤分類）: ${result.viewExtractionViolations.join(', ')}`,
    );
  }
});
