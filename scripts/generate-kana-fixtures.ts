import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ROW_WIDTHS = [13, 12, 12, 11] as const;
const TARGET_ROW_WIDTHS = [12, 12, 11, 10] as const;
const SOURCE_DIR = join(process.cwd(), 'test', 'fixtures', 'sources');
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures');

interface SourceFace {
  trigger: string[];
  mode: 'prefix' | 'suffix' | 'simultaneous';
  /** 出典から転記した値。omission対象も消さずに保持する。 */
  sourceRows: string[];
  /** ANSI fixtureへ採用する値。除外セルは空文字にする。 */
  rows: string[][];
}

type OmissionReason = 'jis-only-key' | 'function-key' | 'symbol' | 'source-only';

interface Omission {
  faceIndex: number;
  row: number;
  column: number;
  value: string;
  reason: OmissionReason;
}

export interface SourceManifest {
  version: 2;
  layoutId: string;
  source: {
    url: string;
    sha: string;
    path: string;
    transform: string;
  };
  faces: SourceFace[];
  omissions: Omission[];
}

interface Fixture {
  version: 1;
  layoutId: string;
  source: SourceManifest['source'];
  faces: Array<Pick<SourceFace, 'trigger' | 'mode'> & { cells: string[][] }>;
  omissions: SourceManifest['omissions'];
}

const OMISSION_REASONS = new Set<OmissionReason>([
  'jis-only-key',
  'function-key',
  'symbol',
  'source-only',
]);

function omissionKey(faceIndex: number, row: number, column: number) {
  return `${faceIndex}:${row}:${column}`;
}

export function validateSourceManifest(fileName: string, manifest: SourceManifest) {
  if (manifest.version !== 2) throw new Error(`${fileName}: 未対応のsource fixture version`);
  if (manifest.faces.length === 0) throw new Error(`${fileName}: 面が空`);

  const decodedSourceRows = manifest.faces.map((face, faceIndex) => {
    if (face.sourceRows.length !== SOURCE_ROW_WIDTHS.length) {
      throw new Error(`${fileName}: face ${faceIndex} sourceRows の行数が4ではない`);
    }
    return face.sourceRows.map((row, rowIndex) => {
      const cells = row.split('\t');
      if (cells.length !== SOURCE_ROW_WIDTHS[rowIndex]) {
        throw new Error(
          `${fileName}: face ${faceIndex} sourceRows row ${rowIndex} の列数が${SOURCE_ROW_WIDTHS[rowIndex]}ではない`,
        );
      }
      return cells;
    });
  });

  for (const [faceIndex, face] of manifest.faces.entries()) {
    if (face.rows.length !== SOURCE_ROW_WIDTHS.length) {
      throw new Error(`${fileName}: face ${faceIndex} rows の行数が4ではない`);
    }
    for (const [rowIndex, row] of face.rows.entries()) {
      if (row.length !== SOURCE_ROW_WIDTHS[rowIndex]) {
        throw new Error(
          `${fileName}: face ${faceIndex} rows row ${rowIndex} の列数が${SOURCE_ROW_WIDTHS[rowIndex]}ではない`,
        );
      }
    }
  }

  const omissionKeys = new Set<string>();
  for (const omission of manifest.omissions) {
    const face = manifest.faces[omission.faceIndex];
    if (!face) throw new Error(`${fileName}: 除外のface ${omission.faceIndex} が無い`);
    if (omission.row < 0 || omission.row >= SOURCE_ROW_WIDTHS.length) {
      throw new Error(`${fileName}: 除外の行番号が範囲外`);
    }
    if (omission.column < 0 || omission.column >= SOURCE_ROW_WIDTHS[omission.row]) {
      throw new Error(`${fileName}: 除外の列番号が範囲外`);
    }
    if (!OMISSION_REASONS.has(omission.reason)) {
      throw new Error(`${fileName}: 未定義の除外理由 ${omission.reason}`);
    }
    if (omission.value.length === 0) {
      throw new Error(`${fileName}: 除外値が空`);
    }

    const key = omissionKey(omission.faceIndex, omission.row, omission.column);
    if (omissionKeys.has(key)) {
      throw new Error(
        `${fileName}: 除外が重複している (face ${omission.faceIndex}, row ${omission.row}, column ${omission.column})`,
      );
    }
    omissionKeys.add(key);

    const sourceCell = decodedSourceRows[omission.faceIndex][omission.row][omission.column];
    const selectedCell = face.rows[omission.row][omission.column];
    if (sourceCell !== omission.value) {
      throw new Error(
        `${fileName}: sourceRowsの値と omissions.value が一致しない (face ${omission.faceIndex}, row ${omission.row}, column ${omission.column})`,
      );
    }
    if (selectedCell !== '') {
      throw new Error(
        `${fileName}: omission対象セルが採用側rowsで空欄になっていない (face ${omission.faceIndex}, row ${omission.row}, column ${omission.column})`,
      );
    }
  }

  for (const [faceIndex, face] of manifest.faces.entries()) {
    for (const [rowIndex, sourceRow] of decodedSourceRows[faceIndex].entries()) {
      const selectedRow = face.rows[rowIndex];
      for (let column = 0; column < sourceRow.length; column += 1) {
        const sourceCell = sourceRow[column];
        const selectedCell = selectedRow[column];
        const key = omissionKey(faceIndex, rowIndex, column);
        const omitted = omissionKeys.has(key);
        const inAnsi = column < TARGET_ROW_WIDTHS[rowIndex];

        if (!inAnsi && selectedCell !== '') {
          throw new Error(
            `${fileName}: ANSI対象外セルが採用側rowsに残っている (face ${faceIndex}, row ${rowIndex}, column ${column})`,
          );
        }

        if (sourceCell === selectedCell) continue;

        if (sourceCell !== '' && selectedCell === '') {
          if (!omitted) {
            throw new Error(
              `${fileName}: sourceから除外されたセルに omissions が無い (face ${faceIndex}, row ${rowIndex}, column ${column})`,
            );
          }
          continue;
        }

        throw new Error(
          `${fileName}: sourceRowsと採用側rowsの差分がomissionとして表現されていない (face ${faceIndex}, row ${rowIndex}, column ${column})`,
        );
      }
    }
  }
}

function readManifest(fileName: string): SourceManifest {
  const manifest = JSON.parse(readFileSync(join(SOURCE_DIR, fileName), 'utf8')) as SourceManifest;
  validateSourceManifest(fileName, manifest);
  return manifest;
}

function projectToAnsi(manifest: SourceManifest): Fixture {
  return {
    version: 1,
    layoutId: manifest.layoutId,
    source: manifest.source,
    faces: manifest.faces.map(({ trigger, mode, rows }) => ({
      trigger,
      mode,
      cells: rows.map((row, rowIndex) => row.slice(0, TARGET_ROW_WIDTHS[rowIndex])),
    })),
    omissions: manifest.omissions,
  };
}

function generateFixtures() {
  for (const fileName of readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.json')).sort()) {
    const fixture = projectToAnsi(readManifest(fileName));
    writeFileSync(
      join(FIXTURE_DIR, `${fixture.layoutId}.json`),
      `${JSON.stringify(fixture, null, 2)}\n`,
      'utf8',
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  generateFixtures();
}
