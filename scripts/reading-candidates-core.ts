import { gunzipSync } from 'node:zlib';
import { isCorrectableSurface, isCorrectionReading, katakanaToHiragana } from '../src/input/text/reading.ts';

/** 表記 → 読み（ひらがな）の候補。読みが2つ以上ある表記だけを持つ。 */
export type CandidateTable = Record<string, string[]>;

export interface SourceFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** mecab-ipadicのCSVの欄の位置（表層形・コスト・読み）。 */
const SURFACE = 0;
const COST = 3;
const READING = 11;
/** 読みの欄までを持つ行の欄数 */
const MIN_FIELDS = 12;
const NO_READING = '*';

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * mecab-ipadicのCSV（EUC-JP）から、漢字を含み読みが2つ以上ある表記の候補の表を作る。
 *
 * - 漢字は `\p{Script=Han}`（`々` を含む）で判定する
 * - 読みはひらがなにそろえ、利用者が打てる読み（ひらがなと長音）に収まるものだけを残す
 * - 候補は、その読みを持つ語のコストの最小が小さい順（解析が選びやすい順）、同じなら読みの順に並べる
 * - 表記は文字コードの順に並べる。同じCSVからは同じ表ができる
 */
export function buildCandidateTable(files: readonly SourceFile[]): CandidateTable {
  const decoder = new TextDecoder('euc-jp', { fatal: true });
  const costs = new Map<string, Map<string, number>>();
  for (const file of [...files].sort((a, b) => compareText(a.name, b.name))) {
    for (const line of decoder.decode(file.bytes).split('\n')) {
      const fields = line.split(',');
      if (fields.length < MIN_FIELDS) continue;
      const surface = fields[SURFACE]!;
      const katakana = fields[READING]!;
      if (!isCorrectableSurface(surface) || katakana === NO_READING) continue;
      const reading = katakanaToHiragana(katakana);
      if (!isCorrectionReading(reading)) continue;
      const cost = Number.parseInt(fields[COST]!, 10);
      let readings = costs.get(surface);
      if (readings === undefined) {
        readings = new Map();
        costs.set(surface, readings);
      }
      const known = readings.get(reading);
      if (known === undefined || cost < known) readings.set(reading, cost);
    }
  }
  const table: CandidateTable = {};
  for (const surface of [...costs.keys()].sort(compareText)) {
    const readings = costs.get(surface)!;
    if (readings.size < 2) continue;
    table[surface] = [...readings].sort((a, b) => a[1] - b[1] || compareText(a[0], b[0])).map(([reading]) => reading);
  }
  return table;
}

/** 表を、保存するJSONの文字列にする。 */
export function serializeCandidateTable(table: CandidateTable): string {
  return `${JSON.stringify(table)}\n`;
}

/** tar.gzから、最上位のディレクトリ直下の `.csv` を取り出す。 */
export function readCsvFilesFromTarGz(archive: Uint8Array): SourceFile[] {
  const tar = gunzipSync(archive);
  const files: SourceFile[] = [];
  const text = new TextDecoder('utf-8');
  const field = (header: Uint8Array, from: number, to: number) => text.decode(header.subarray(from, to)).replace(/\0.*$/s, '');
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = field(header, 0, 100);
    const size = Number.parseInt(field(header, 124, 136).trim() || '0', 8);
    const type = String.fromCharCode(header[156] ?? 0);
    const body = offset + 512;
    if ((type === '0' || type === '\0') && /^[^/]+\/[^/]+\.csv$/.test(name)) {
      files.push({ name, bytes: tar.slice(body, body + size) });
    }
    offset = body + Math.ceil(size / 512) * 512;
  }
  return files;
}
