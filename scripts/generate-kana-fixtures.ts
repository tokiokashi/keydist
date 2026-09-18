import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_ROW_WIDTHS = [13, 12, 12, 11] as const;
const TARGET_ROW_WIDTHS = [12, 12, 11, 10] as const;
const SOURCE_DIR = join(process.cwd(), 'test', 'fixtures', 'sources');
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures');

interface SourceFace {
  trigger: string[];
  mode: 'prefix' | 'suffix' | 'simultaneous';
  rows: string[][];
}

interface SourceManifest {
  version: 1;
  layoutId: string;
  source: {
    url: string;
    sha: string;
    path: string;
    transform: string;
  };
  faces: SourceFace[];
  omissions: Array<{
    faceIndex: number;
    row: number;
    column: number;
    value: string;
    reason: 'jis-only-key' | 'function-key' | 'symbol' | 'source-only';
  }>;
}

interface Fixture {
  version: 1;
  layoutId: string;
  source: SourceManifest['source'];
  faces: Array<Pick<SourceFace, 'trigger' | 'mode'> & { cells: string[][] }>;
  omissions: SourceManifest['omissions'];
}

function readManifest(fileName: string): SourceManifest {
  const manifest = JSON.parse(readFileSync(join(SOURCE_DIR, fileName), 'utf8')) as SourceManifest;
  if (manifest.version !== 1) throw new Error(`${fileName}: 未対応のsource fixture version`);
  if (manifest.faces.length === 0) throw new Error(`${fileName}: 面が空`);
  for (const [faceIndex, face] of manifest.faces.entries()) {
    if (face.rows.length !== SOURCE_ROW_WIDTHS.length) {
      throw new Error(`${fileName}: face ${faceIndex} の行数が4ではない`);
    }
    for (const [rowIndex, row] of face.rows.entries()) {
      if (row.length !== SOURCE_ROW_WIDTHS[rowIndex]) {
        throw new Error(`${fileName}: face ${faceIndex} row ${rowIndex} の列数が${SOURCE_ROW_WIDTHS[rowIndex]}ではない`);
      }
    }
  }
  for (const omission of manifest.omissions) {
    const face = manifest.faces[omission.faceIndex];
    if (!face) throw new Error(`${fileName}: 除外のface ${omission.faceIndex} が無い`);
    if (omission.row < 0 || omission.row >= SOURCE_ROW_WIDTHS.length) {
      throw new Error(`${fileName}: 除外の行番号が範囲外`);
    }
    if (omission.column < 0 || omission.column >= SOURCE_ROW_WIDTHS[omission.row]) {
      throw new Error(`${fileName}: 除外の列番号が範囲外`);
    }
    if (omission.column < TARGET_ROW_WIDTHS[omission.row] && face.rows[omission.row][omission.column] !== '') {
      throw new Error(`${fileName}: ANSI対象列の除外セルが空欄になっていない`);
    }
  }
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

for (const fileName of readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.json')).sort()) {
  const fixture = projectToAnsi(readManifest(fileName));
  writeFileSync(
    join(FIXTURE_DIR, `${fixture.layoutId}.json`),
    `${JSON.stringify(fixture, null, 2)}\n`,
    'utf8',
  );
}
