// コーパスの、繰り返し現れる文字列（極大な繰り返し）の一覧と統計量を出す。定義は`docs/corpus-ngram.md`の「文字列の候補の一覧」。
// 結果はMarkdownとして標準出力に出し、全体の一覧はTSVのファイルに書く。一覧はリポジトリに置かない。
//
//   node --experimental-strip-types scripts/corpus-ngram-candidates.ts --out <ディレクトリ>
//   ... --min-count 5        出現回数の下限（既定は5）
//   ... --top 100            標準出力に出す、出現回数の上位の件数（既定は100）
//   ... --top-per-length 10  標準出力に出す、長さごとの上位の件数（既定は10）
//   ... --source <zipのパス> 取得済みの青空文庫のzipを使う
//
// 辞書（IPADIC）は .cache/dictionary/ に取る（CONTRIBUTING.md「読みの辞書」）。無ければ取得する。
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CANDIDATE_MIN_COUNT, extractRepeatCandidates, type Candidate } from '#interpretation/corpus-candidates.ts';
import { buildCorpusSequences } from '#interpretation/corpus-ngram.ts';
import { BUNSETSU_SPLITTER } from '#platform/bunsetsu/info.ts';
import { DICTIONARY_SPEC, LIBRARY_SPEC } from '#platform/reading/dictionary-spec.ts';
import { AOZORA_SOURCE } from './generate-neko-sample.ts';
import { loadStandardCorpus, sha256Of } from './corpus-ngram-load.ts';

function parseArgs(argv: readonly string[]): {
  minCount: number;
  top: number;
  topPerLength: number;
  source: string | undefined;
  out: string | undefined;
} {
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
  const out = value('--out');
  return {
    minCount: integer('--min-count', CANDIDATE_MIN_COUNT),
    top: integer('--top', 100),
    topPerLength: integer('--top-per-length', 10),
    source: source === undefined ? undefined : resolve(source),
    out: out === undefined ? undefined : resolve(out),
  };
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

const HEADER = [
  '文字列',
  '長さ',
  '出現回数',
  '左の種類',
  '右の種類',
  '左のエントロピー',
  '右のエントロピー',
  '境界にそろう割合',
  '出現する章の数',
  'DP',
  'DP（最大1に直した値）',
];

function row(candidate: Candidate): string[] {
  const { dispersion } = candidate;
  return [
    candidate.text,
    String(candidate.length),
    String(candidate.count),
    String(candidate.leftKinds),
    String(candidate.rightKinds),
    candidate.leftEntropy.toFixed(3),
    candidate.rightEntropy.toFixed(3),
    candidate.alignedRatio.toFixed(3),
    dispersion === undefined ? '' : String(dispersion.chaptersPresent),
    dispersion === undefined ? '' : dispersion.dp.toFixed(3),
    dispersion === undefined ? '' : dispersion.dpNormalized.toFixed(3),
  ];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { corpus, reading, sourceBoundaryCount, readingBoundaries, chapterReadingBoundaries } = await loadStandardCorpus(args.source);
  const sequences = buildCorpusSequences(reading.text, readingBoundaries, chapterReadingBoundaries);
  if (sequences.chapterStarts.length !== chapterReadingBoundaries.length) {
    throw new Error(`章の始まりが前処理で消えた: ${chapterReadingBoundaries.length}個のうち${sequences.chapterStarts.length}個が残った`);
  }

  let crossing = 0;
  let offset = 0;
  for (const run of sequences.kana) {
    if (sequences.chapterStarts.some((start) => start > offset && start < offset + run.length)) crossing++;
    offset += run.length;
  }

  const edgeStarts = sequences.runEdges.filter((edge) => edge.start).length;
  const edgeEnds = sequences.runEdges.filter((edge) => edge.end).length;
  const started = performance.now();
  const result = extractRepeatCandidates(sequences.kana, sequences.bunsetsu, {
    minCount: args.minCount,
    chapterStarts: sequences.chapterStarts,
    runEdges: sequences.runEdges,
  });
  const seconds = (performance.now() - started) / 1000;
  const { candidates } = result;

  const out: string[] = [];
  out.push('# コーパスの文字列の候補の一覧', '');
  out.push('定義は `docs/corpus-ngram.md` の「文字列の候補の一覧」。出現回数の降順で並べる。点数や順位は作らない。', '');
  out.push('## 再現の条件', '');
  out.push(
    `- コーパス: 青空文庫『${AOZORA_SOURCE.title}』（作品789）。zip ${AOZORA_SOURCE.fileName}（sha256 ${AOZORA_SOURCE.sha256}）。注記を除いた全文のsha256 ${sha256Of(corpus)}（${[...corpus].length}文字）`,
  );
  out.push('- 統計は1作品（明治期の小説、一人称の語り）から出たもの。ジャンルの区分は無い。日本語の文章一般の統計として読まない');
  out.push(
    `- 文節の分割器: ${BUNSETSU_SPLITTER.name} ${BUNSETSU_SPLITTER.version}（日本語のモデル）。読みに直す前の原文に1回だけ当てた（原文の区切り${sourceBoundaryCount}個、読みの上${readingBoundaries.length}個）`,
  );
  out.push(
    `- 読みへの変換: ${LIBRARY_SPEC.name} ${LIBRARY_SPEC.version} + ${DICTIONARY_SPEC.name} ${DICTIONARY_SPEC.version}。原文のルビは使わない。読みに置き換えた語${reading.replacedWords}個`,
  );
  out.push('- 前処理と系列: `docs/corpus-ngram.md` の「入力」と「系列」と同じ。候補は走り（かなの系列の1つの走り）の中だけで取り出す');
  out.push(`- 走りの数: ${sequences.kana.length}。かなの数: ${result.units}`);
  out.push(`- 取り出し: 接尾辞配列とLCP配列で、出現回数が${args.minCount}以上の極大な繰り返し。長さの上限は置かない`);
  out.push(`- 章: 全${result.chapterSizes.length}章。章ごとのかなの数 ${result.chapterSizes.join('・')}`);
  out.push(
    `- 文節の境界にそろう割合: 走りの端は、空白か読みの上の文節の区切りに当たる時だけ境界に数える（走りの始まり${edgeStarts}個・終わり${edgeEnds}個が境界）。章の間のばらつき: 出現は始まりの位置の章に数え、章の大きさはかなの数`,
  );
  out.push(`- 章の切れ目をまたぐ走り: ${crossing}個`);
  out.push(`- 計算: 取り出しと統計量に${seconds.toFixed(1)}秒（Node ${process.version}。メモリは別のプロセスで、取り出しだけを測る）`);
  out.push('');

  const byLength = new Map<number, Candidate[]>();
  for (const candidate of candidates) {
    const list = byLength.get(candidate.length);
    if (list === undefined) byLength.set(candidate.length, [candidate]);
    else list.push(candidate);
  }
  out.push(`## 件数`, '');
  out.push(`極大な繰り返し（出現回数${args.minCount}以上）は全${candidates.length}件。`, '');
  const lengthRows = [...byLength.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([length, list]) => {
      const aligned = list.filter((candidate) => candidate.alignedRatio >= 0.5).length;
      return [String(length), String(list.length), String(list[0]!.count), String(aligned)];
    });
  out.push(table(['長さ', '件数', '最大の出現回数', '境界にそろう割合が0.5以上の件数'], lengthRows), '');

  out.push(`## 出現回数の上位${args.top}件`, '');
  out.push(table(HEADER, candidates.slice(0, args.top).map(row)), '');

  if (args.topPerLength > 0) {
    out.push(`## 長さごとの、出現回数の上位${args.topPerLength}件`, '');
    const rows: string[][] = [];
    for (const [, list] of [...byLength.entries()].sort((a, b) => a[0] - b[0])) {
      for (const candidate of list.slice(0, args.topPerLength)) rows.push(row(candidate));
    }
    out.push(table(HEADER, rows), '');
  }
  console.log(out.join('\n'));

  if (args.out !== undefined) {
    await mkdir(args.out, { recursive: true });
    const lines = [HEADER.join('\t'), ...candidates.map((candidate) => row(candidate).join('\t'))];
    await writeFile(resolve(args.out, 'candidates.tsv'), `${lines.join('\n')}\n`);
    await writeFile(resolve(args.out, 'candidates.md'), `${out.join('\n')}\n`);
  }
}

await main();
