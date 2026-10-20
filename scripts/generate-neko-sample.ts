// 組み込みのサンプル『吾輩は猫である』の本文（src/input/text/sample-ja-neko*.ts）を、青空文庫の原文から作る。
//
// 原文は青空文庫の作品 789（夏目漱石）。ルビ・入力者注・外字などの記法を取り除いて、評価に渡す本文にする
// （規則はscripts/aozora-core.ts）。ビルドとnpm testでは取りに行かない（本文をリポジトリに置く）。
//
//   node --experimental-strip-types scripts/generate-neko-sample.ts           本文を作り直して書く
//   node --experimental-strip-types scripts/generate-neko-sample.ts --check   置いてある本文が同じ原文から作れるかを確かめる
//   ... --source <zipのパス>                                                    取得済みのzipを使う
//
// 取ったzipは .cache/aozora/ に置く（追跡しない）。sha256が合わなければ止まる。
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractZip } from '../src/platform/reading/zip.ts';
import { convertAozora, excerptBySentence, extractBody, firstChapterOf } from './aozora-core.ts';

/** 原文のアーカイブ。 */
export const AOZORA_SOURCE = {
  title: '吾輩は猫である',
  fileName: '789_ruby_5639.zip',
  url: 'https://www.aozora.gr.jp/cards/000148/files/789_ruby_5639.zip',
  sha256: '6545750b89ee2c57f215a65079eeab56ee7c997373b7b86e5b00ae74fe69208f',
  /** zipの中のテキスト。Shift_JIS */
  entryName: 'wagahaiwa_nekodearu.txt',
} as const;

/** 既定のサンプルの目安の字数（空白を除いた原文の字数）。 */
const EXCERPT_TARGET_CHARS = 1000;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(root, '.cache', 'aozora');
const TEXT_DIR = join(root, 'src', 'input', 'text');

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** zipを返す。引数で渡した場所（取得済みのファイル）か、置き場か、取得元から。sha256が合わなければ例外を投げる。 */
async function archiveBytes(localPath: string | undefined): Promise<Uint8Array> {
  const path = localPath ?? join(CACHE_DIR, AOZORA_SOURCE.fileName);
  const stored = await readFile(path).catch(() => undefined);
  if (stored !== undefined) {
    if (sha256Of(stored) !== AOZORA_SOURCE.sha256) throw new Error(`${path} のsha256が固定した値と違う`);
    return stored;
  }
  if (localPath !== undefined) throw new Error(`${localPath} を読めない`);
  const response = await fetch(AOZORA_SOURCE.url);
  if (!response.ok) throw new Error(`${AOZORA_SOURCE.url} を取得できなかった（応答 ${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256Of(bytes);
  if (actual !== AOZORA_SOURCE.sha256) {
    throw new Error(`sha256が固定した値と違う: ${AOZORA_SOURCE.url}\n  期待 ${AOZORA_SOURCE.sha256}\n  実際 ${actual}`);
  }
  await mkdir(CACHE_DIR, { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
  return bytes;
}

const HEADER = `// 青空文庫『${AOZORA_SOURCE.title}』（夏目漱石）の原文からscripts/generate-neko-sample.tsが作る。手で直さない。
// 底本：「夏目漱石全集1」ちくま文庫、筑摩書房、1987（昭和62）年9月29日第1刷発行
// 入力：柴田卓治、校正：渡部峰子ほか。ルビ・入力者注などの記法は取り除いてある。
// 取得元 ${AOZORA_SOURCE.url}（sha256 ${AOZORA_SOURCE.sha256}）
`;

function moduleSource(exportName: string, doc: string, text: string): string {
  // リポジトリの書式（一重引用符。長い行は代入の後で折る）に合わせて書く。npm run lintが通る形にしておく
  const quoted = `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;
  return `${HEADER}\n/** ${doc} */\nexport const ${exportName} =\n  ${quoted};\n`;
}

export interface GeneratedFile {
  readonly path: string;
  readonly source: string;
}

export function buildFiles(raw: string): { files: GeneratedFile[]; summary: Record<string, number> } {
  const body = extractBody(raw);
  const whole = convertAozora(body);
  // 既定にするのは第一章の先頭の約1000字（文末で切る）。長くすると、打鍵再生の図が長くなりすぎ、Workspaceが数値を出すまでも延びる。
  // 章の境目は、変換が見出しの行を取り除く前の本文で決める
  const chapter = convertAozora(firstChapterOf(body)).text.trim();
  const excerpt = excerptBySentence(chapter, EXCERPT_TARGET_CHARS);
  const files: GeneratedFile[] = [
    {
      path: join(TEXT_DIR, 'sample-ja-neko.ts'),
      source: moduleSource('SAMPLE_TEXT_JA_NEKO', '既定の日本語サンプル。『吾輩は猫である』の第一章の先頭の約1000字（文末まで）。', excerpt),
    },
  ];
  return {
    files,
    summary: {
      全文の字数: [...whole.text.replace(/\s+/g, '')].length,
      第一章の字数: [...chapter.replace(/\s+/g, '')].length,
      既定の字数: [...excerpt.replace(/\s+/g, '')].length,
      外字を字に直した数: whole.gaijiConverted,
      外字を取り除いた数: whole.gaijiRemoved,
      章見出しの行: whole.headingLinesRemoved,
    },
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const sourceIndex = args.indexOf('--source');
  const localSource = sourceIndex === -1 ? undefined : resolve(args[sourceIndex + 1] ?? '');

  const entries = await extractZip(await archiveBytes(localSource));
  const bytes = entries.get(AOZORA_SOURCE.entryName);
  if (bytes === undefined) throw new Error(`zipに ${AOZORA_SOURCE.entryName} が無い`);
  const { files, summary } = buildFiles(new TextDecoder('shift_jis', { fatal: true }).decode(bytes));

  if (check) {
    let failed = false;
    for (const file of files) {
      const stored = await readFile(file.path, 'utf8').catch(() => undefined);
      if (stored !== file.source) {
        console.error(`[neko-sample] ${file.path} が、固定した原文から作った本文と違う`);
        failed = true;
      }
    }
    if (failed) process.exit(1);
    console.log(`[neko-sample] 置いてある本文は固定した原文から作った本文と同じ ${JSON.stringify(summary)}`);
  } else {
    for (const file of files) await writeFile(file.path, file.source);
    console.log(`[neko-sample] ${files.map((file) => file.path).join(', ')} を書いた ${JSON.stringify(summary)}`);
  }
}
