// コーパスから、文節の読みの系列とかなの系列のn-gramの表と、次数ごとの統計が足りているかの量を出す。
// 定義は`docs/corpus-ngram.md`。結果はMarkdownの表として標準出力に出す。表そのものはリポジトリに置かない。
//
//   node --experimental-strip-types scripts/corpus-ngram-tables.ts
//   ... --max-order 5      表の最大の次数（既定は5）
//   ... --top 10           次数ごとに出現回数の多い並びを何件出すか（既定は0。出さない）
//   ... --source <zipのパス> 取得済みの青空文庫のzipを使う
//
// 辞書（IPADIC）は .cache/dictionary/ に取る（CONTRIBUTING.md「読みの辞書」）。無ければ取得する。
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertToReading } from '#input/text/reading.ts';
import { mapBoundariesToReading, offsetsOfChunks } from '#input/text/segmentation.ts';
import {
  BUNSETSU_KEY_SEPARATOR,
  buildCorpusNgramTables,
  CONTEXT_SINGLETON_LIMIT,
  sufficientOrder,
  type OrderSufficiency,
} from '#interpretation/corpus-ngram.ts';
import { splitBunsetsu } from '#platform/bunsetsu/budoux.ts';
import { BUNSETSU_SPLITTER } from '#platform/bunsetsu/info.ts';
import { createReadingAnalyzer, type LinderaModule } from '#platform/reading/analyzer.ts';
import { readDictionaryZip } from '#platform/reading/dictionary-files.ts';
import { DICTIONARY_SPEC, LIBRARY_SPEC } from '#platform/reading/dictionary-spec.ts';
import { extractZip } from '#platform/reading/zip.ts';
import { ensureDictionaryZip } from './dictionary-fetch.ts';
import { convertAozora, extractBody } from './aozora-core.ts';
import { AOZORA_SOURCE, archiveBytes } from './generate-neko-sample.ts';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

function parseArgs(argv: readonly string[]): { maxOrder: number; top: number; source: string | undefined } {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  const integer = (name: string, fallback: number): number => {
    const raw = value(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name}には0以上の整数を渡す: ${raw}`);
    return parsed;
  };
  const source = value('--source');
  return { maxOrder: integer('--max-order', 5), top: integer('--top', 0), source: source === undefined ? undefined : resolve(source) };
}

const sha256Of = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

const percent = (value: number | undefined): string => (value === undefined ? '–' : `${(value * 100).toFixed(2)}%`);

function sufficiencyTable(rows: readonly OrderSufficiency[]): string {
  return table(
    [
      '次数',
      '出現数',
      '並びの種類',
      '1回だけの並び',
      '文脈の種類',
      '文脈が1回だけ',
      '文脈が1回だけの割合',
      '並びが1回だけの割合',
      `上限${percent(CONTEXT_SINGLETON_LIMIT)}`,
    ],
    rows.map((row) => [
      String(row.order),
      String(row.occurrences),
      String(row.grams),
      String(row.singletonGrams),
      String(row.contexts),
      String(row.singletonContexts),
      percent(row.contextSingletonRatio),
      percent(row.gramSingletonRatio),
      row.contextSingletonRatio === undefined ? '–' : row.contextSingletonRatio <= CONTEXT_SINGLETON_LIMIT ? '以下' : '超えた',
    ]),
  );
}

function topTable(tables: readonly ReadonlyMap<string, number>[], separator: string, top: number): string {
  const rows: string[][] = [];
  for (const [order, entries] of tables.entries()) {
    const sorted = [...entries].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, top);
    for (const [key, count] of sorted) rows.push([String(order), separator === '' ? key : key.split(separator).join(' / '), String(count)]);
  }
  return table(['次数', '並び', '出現回数'], rows);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // コーパス: 取得と除去は`scripts/generate-neko-sample.ts`と同じ
  const zip = await archiveBytes(args.source);
  const entry = (await extractZip(zip)).get(AOZORA_SOURCE.entryName);
  if (entry === undefined) throw new Error(`zipに${AOZORA_SOURCE.entryName}が無い`);
  const corpus = convertAozora(extractBody(new TextDecoder('shift_jis', { fatal: true }).decode(entry))).text;

  // 読みへの変換と文節の区切り: アプリと同じ経路（原文を形態素解析 → 読みに置き換え。分割器は原文に1回だけ当て、語の境目へ寄せて読みの位置へ写す）
  const lindera = await import('lindera-wasm');
  lindera.initSync({ module: await readFile(resolve(root, 'node_modules/lindera-wasm/lindera_wasm_bg.wasm')) });
  const analyzer = createReadingAnalyzer(lindera as unknown as LinderaModule, await readDictionaryZip(await ensureDictionaryZip()));
  const tokens = analyzer.tokenize(corpus);
  const reading = convertToReading(corpus, tokens);
  const sourceBoundaries = offsetsOfChunks(splitBunsetsu(corpus));
  const readingBoundaries = mapBoundariesToReading(corpus, tokens, sourceBoundaries);

  const result = buildCorpusNgramTables(reading.text, readingBoundaries, args.maxOrder);
  const { sequences } = result;
  const unitCount = sequences.bunsetsu.reduce((sum, run) => sum + run.length, 0);
  const kanaCount = sequences.kana.reduce((sum, run) => sum + run.length, 0);

  const out: string[] = [];
  out.push('# コーパスの文節の読みとかなのn-gramの表と、統計が足りているかの量', '');
  out.push('定義は `docs/corpus-ngram.md`。表そのものは出さず、次数ごとの量を出す。', '');
  out.push('## 再現の条件', '');
  out.push(
    `- コーパス: 青空文庫『${AOZORA_SOURCE.title}』（作品789）。zip ${AOZORA_SOURCE.fileName}（sha256 ${AOZORA_SOURCE.sha256}）。注記を除いた全文のsha256 ${sha256Of(corpus)}（${[...corpus].length}文字）`,
  );
  out.push('- 統計は1作品（明治期の小説、一人称の語り）から出たもの。ジャンルの区分は無い。日本語の文章一般の統計として読まない');
  out.push(
    `- 文節の分割器: ${BUNSETSU_SPLITTER.name} ${BUNSETSU_SPLITTER.version}（日本語のモデル）。読みに直す前の原文に1回だけ当てた（原文の区切り${sourceBoundaries.length}個、読みの上${readingBoundaries.length}個）`,
  );
  out.push(
    `- 読みへの変換: ${LIBRARY_SPEC.name} ${LIBRARY_SPEC.version} + ${DICTIONARY_SPEC.name} ${DICTIONARY_SPEC.version}。原文のルビは使わない。利用者の読みの直しは当てない。読みに置き換えた語${reading.replacedWords}個`,
  );
  out.push(
    '- 前処理: 仕様 §4.6の2段目から4段目のうち配列に依らない分（記号は `、` `。` だけ残し、英字と数字を取り除く。半角の `,` `.` は `、` `。` へ書き換える）。片仮名は書き換えない',
  );
  out.push(
    `- 系列を切った文字: 空白と改行${sequences.cuts.whitespace}個、読みに直らなかった漢字${sequences.cuts.unreadableKanji}個。前処理の後の文字数${sequences.chars}`,
  );
  out.push(`- 走りの数: かな${sequences.kana.length}、文節${sequences.bunsetsu.length}。単位の数: かな${kanaCount}、文節${unitCount}`);
  out.push(`- 表の最大の次数: ${args.maxOrder}。上限: 文脈が1回だけの割合 ${percent(CONTEXT_SINGLETON_LIMIT)}`, '');

  for (const [title, side, separator] of [
    ['文節の読みの系列', result.bunsetsu, BUNSETSU_KEY_SEPARATOR],
    ['かなの系列', result.kana, ''],
  ] as const) {
    const order = sufficientOrder(side.sufficiency);
    out.push(`## ${title}`, '');
    out.push(sufficiencyTable(side.sufficiency), '');
    out.push(`足りている最大の次数: ${order === undefined ? '決まらない' : order}`, '');
    if (args.top > 0) out.push(topTable(side.tables, separator, args.top), '');
  }
  console.log(out.join('\n'));
}

await main();
