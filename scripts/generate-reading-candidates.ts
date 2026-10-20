// 読みの候補の表（src/platform/reading/candidate-table.json）を、mecab-ipadicのCSVから作る。
//
// 表は辞書（lindera-ipadic）の元になったデータと同じmecab-ipadic-2.7.0-20070801から作る。
// 辞書のzipは活用した語の表記を持たず、表記から読みを引けないため、元のCSVを使う。
// 元のCSVが変わった時だけ作り直す。ビルドでは取りに行かない（表をリポジトリに置く）。
//
//   node --experimental-strip-types scripts/generate-reading-candidates.ts           表を作り直して書く
//   node --experimental-strip-types scripts/generate-reading-candidates.ts --check   置いてある表が同じCSVから作れるかを確かめる
//
// 取ったアーカイブは .cache/mecab-ipadic/ に置く（追跡しない）。sha256が合わなければ止まる。
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCandidateTable, readCsvFilesFromTarGz, serializeCandidateTable } from './reading-candidates-core.ts';

/** 表の元になるアーカイブ。 */
export const MECAB_IPADIC_SOURCE = {
  version: 'mecab-ipadic-2.7.0-20070801',
  fileName: 'mecab-ipadic-2.7.0-20070801.tar.gz',
  url: 'https://sourceforge.net/projects/mecab/files/mecab-ipadic/2.7.0-20070801/mecab-ipadic-2.7.0-20070801.tar.gz/download',
  sha256: 'b62f527d881c504576baed9c6ef6561554658b175ce6ae0096a60307e49e3523',
} as const;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(root, '.cache', 'mecab-ipadic');
const TABLE_PATH = join(root, 'src', 'platform', 'reading', 'candidate-table.json');

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** アーカイブを返す。引数で渡した場所（取り済みのファイル）か、置き場か、取得元から。sha256が合わなければ例外を投げる。 */
async function archiveBytes(localPath: string | undefined): Promise<Uint8Array> {
  const path = localPath ?? join(CACHE_DIR, MECAB_IPADIC_SOURCE.fileName);
  const stored = await readFile(path).catch(() => undefined);
  if (stored !== undefined) {
    if (sha256Of(stored) !== MECAB_IPADIC_SOURCE.sha256) throw new Error(`${path} のsha256が固定した値と違う`);
    return stored;
  }
  if (localPath !== undefined) throw new Error(`${localPath} を読めない`);
  const response = await fetch(MECAB_IPADIC_SOURCE.url);
  if (!response.ok) throw new Error(`${MECAB_IPADIC_SOURCE.url} を取得できなかった（応答 ${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256Of(bytes);
  if (actual !== MECAB_IPADIC_SOURCE.sha256) {
    throw new Error(`sha256が固定した値と違う: ${MECAB_IPADIC_SOURCE.url}\n  期待 ${MECAB_IPADIC_SOURCE.sha256}\n  実際 ${actual}`);
  }
  await mkdir(CACHE_DIR, { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
  return bytes;
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const sourceIndex = args.indexOf('--source');
const localSource = sourceIndex === -1 ? undefined : resolve(args[sourceIndex + 1] ?? '');

const files = readCsvFilesFromTarGz(await archiveBytes(localSource));
const table = buildCandidateTable(files);
const json = serializeCandidateTable(table);
const readings = Object.values(table).reduce((sum, list) => sum + list.length, 0);

if (check) {
  const stored = await readFile(TABLE_PATH, 'utf8').catch(() => undefined);
  if (stored !== json) {
    console.error('[reading-candidates] 置いてある表が、固定したCSVから作った表と違う');
    process.exit(1);
  }
  console.log(
    `[reading-candidates] 置いてある表は ${MECAB_IPADIC_SOURCE.version} から作った表と同じ（表記 ${Object.keys(table).length}・読み ${readings}）`,
  );
} else {
  await writeFile(TABLE_PATH, json);
  console.log(`[reading-candidates] ${TABLE_PATH} を書いた（表記 ${Object.keys(table).length}・読み ${readings}・${Buffer.byteLength(json)}バイト）`);
}
