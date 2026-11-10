/**
 * 保存データ（localStorage）の大きさを測る。組み込みの資産を一通り自作に写した時の各キーの大きさと、
 * 『吾輩は猫である』全文の大きさのテキストを入れた時の大きさを、保存する文字列の長さ（UTF-16の単位）で出す。
 * IndexedDBへ移す必要があるかを判断する材料にする（`docs/architecture.md`「保存容量の見積もり」）。
 *
 * 実行: node --experimental-strip-types scripts/measure-storage-size.ts
 *
 * 配列は、面から作った組み込みの配列を面の形（`UserFace`）に写し、面を持たない配列（英字の段の形）は4段の文字列で数える。
 * 組み込みのローマ字規則は、訓令式の表のうち綴りが違うものを上書きに持つ形に写す（`UserRomajiRule`）。
 */
import { LAYOUTS, LAYOUTS_JA } from '#input/layouts/index.ts';
import { faceCells } from '#input/layouts/face-geometry.ts';
import { ROMAJI_RULES } from '#input/romaji/rules.ts';
import { USER_ROMAJI_RULES_CODEC } from '#input/romaji/user-rules-codec.ts';
import { BUILTIN_TEXTS } from '#input/text/builtin.ts';
import { TEXT_LIBRARY_CODEC } from '#input/text/library-codec.ts';
import { USER_FINGER_ASSIGNMENTS_CODEC } from '#input/shapes/user-finger-assignments.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { SETUP_LIBRARY_CODEC } from '#engine/setup-codec.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from '#engine/finger-assignment.ts';
import { PRESET_LIBRARY_CODEC } from '#engine/preset-codec.ts';
import { WORKSPACE_LIBRARY_CODEC } from '#engine/workspace-codec.ts';
import { createSampleWorkspace } from '#engine/sample-workspace.ts';
import { initialWorkspaceLibrary } from '#engine/workspace.ts';
import { userAssetsFileBody } from '#engine/user-assets-file.ts';
import type { KeydistAssets } from '#engine/commands.ts';

/** ChromiumのlocalStorageに1つのサイトが入れられる文字数（UTF-16の単位）。2026-10-20に測った値。 */
const LOCAL_STORAGE_CHARS = 5_240_000;
/** 『吾輩は猫である』全文のUTF-8の大きさ（バイト）。かな・漢字は1字3バイトなので、その1/3の字数で数える。 */
const NEKO_FULL_BYTES = 958_248;

const sizeOf = (value: unknown): number => JSON.stringify(value).length;

const rows: { label: string; chars: number; note: string }[] = [];
const add = (label: string, chars: number, note = ''): void => {
  rows.push({ label, chars, note });
};

// 配列: 面から作った組み込みの配列を面の形に写す。面を持たない配列は4段の文字列
const jaIds = new Set(LAYOUTS_JA.map((layout) => layout.id));
const userLayouts = [...LAYOUTS, ...LAYOUTS_JA].flatMap((layout): ({ id: string; name: string } & Record<string, unknown>)[] => {
  const id = `user-${layout.id}`;
  if (layout.faces === undefined) {
    return [{ kind: 'alpha', id, name: layout.name, rows: ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'], romaji: 'kunrei' }];
  }
  const faces = layout.faces.map((face) => ({
    trigger: [...face.trigger],
    mode: face.mode,
    ...(face.triggerPersistence === undefined ? {} : { triggerPersistence: face.triggerPersistence }),
    inputRole: face.inputRole ?? 'layer',
    ...(face.layer === undefined ? {} : { layer: face.layer }),
    ...(face.modifierGroups === undefined ? {} : { modifierGroups: { ...face.modifierGroups } }),
    outputs: Object.fromEntries(faceCells(face)),
  }));
  return [
    jaIds.has(layout.id)
      ? { kind: 'kana', id, name: layout.name, faces, composition: { dakuten: true, handakuten: true } }
      : { kind: 'alpha', id, name: layout.name, faces },
  ];
});
add(
  '自作の配列（組み込みの全配列を写す）',
  sizeOf({ version: 1, layouts: userLayouts }),
  `${userLayouts.length}件。面を持つ配列は面の形、持たない配列は4段の文字列`,
);

// ローマ字規則
const rules = Object.entries(ROMAJI_RULES).map(([id, rule]) => ({
  id: `user-${id}`,
  name: rule.name,
  base: rule.base,
  overrides: { ...rule.overrides },
  generateSokuon: rule.generateSokuon,
}));
add('自作のローマ字規則（組み込みの全規則を写す）', sizeOf(USER_ROMAJI_RULES_CODEC.encode(rules)), `${rules.length}件`);

// 指の割り当て
const fingers = Object.values(FINGER_ASSIGNMENT_REGISTRY).map((assignment) => ({ ...assignment, id: `user-${assignment.id}` }));
add('自作の指の割り当て（組み込みの全割り当てを写す）', sizeOf(USER_FINGER_ASSIGNMENTS_CODEC.encode(fingers)), `${fingers.length}件`);

// Setup: 組み込みの配列ごとに、組み込みの物理配列を1つずつ
const shapeIds = Object.values(PHYSICAL_SHAPES).map((shape) => shape.id);
const setups = userLayouts.flatMap((layout, index) =>
  shapeIds.slice(0, 3).map((shapeId, shapeIndex) => ({
    id: `setup-${index}-${shapeIndex}`,
    number: index * 3 + shapeIndex + 1,
    layoutId: layout.id,
    shapeId,
    label: `${layout.name}/${shapeId}`,
  })),
);
add('Setup（写した配列ごとに物理配列3つ）', sizeOf(SETUP_LIBRARY_CODEC.encode({ setups, overrides: {} })), `${setups.length}件`);

// テキスト: 組み込みの全テキストを自作に写す
const builtinTexts = BUILTIN_TEXTS.map((text) => ({ id: `text-${text.id}`, name: text.name, text: text.text }));
add(
  'テキスト（組み込みの全テキストを写す）',
  sizeOf(TEXT_LIBRARY_CODEC.encode({ texts: builtinTexts })),
  `${builtinTexts.length}件、本文の合計${builtinTexts.reduce((sum, text) => sum + text.text.length, 0)}字`,
);

// プリセットとWorkspace
const presets = Array.from({ length: 20 }, (_, index) => ({
  id: `preset-${index}`,
  name: `プリセット${index}`,
  values: { windowSize: 3 + (index % 5), romajiRuleId: 'kunrei' },
}));
add('プリセット（20件）', sizeOf(PRESET_LIBRARY_CODEC.encode({ presets })), '');
let serial = 0;
const nextId = (): string => {
  serial += 1;
  return `id-${serial}`;
};
const overview = createSampleWorkspace(initialWorkspaceLibrary(), nextId, nextId, 'overview').library;
const workspaces = createSampleWorkspace(overview, nextId, nextId, 'layout-detail').library;
add('Workspace（サンプル2件）', sizeOf(WORKSPACE_LIBRARY_CODEC.encode(workspaces)), `${workspaces.length}件`);

// 『吾輩は猫である』全文の大きさのテキスト
const nekoChars = Math.floor(NEKO_FULL_BYTES / 3);
const nekoText = 'あ'.repeat(nekoChars);
add(
  '『吾輩は猫である』全文の大きさのテキスト1件',
  sizeOf(TEXT_LIBRARY_CODEC.encode({ texts: [{ id: 'text-neko', name: '全文', text: nekoText }] })),
  `${nekoChars}字（UTF-8で${NEKO_FULL_BYTES}バイト）`,
);

// 書き出しのファイル: 上の資産を全部入れた時の大きさ
const exportAssets = {
  userLayouts,
  userRomajiRules: rules,
  fingerAssignments: fingers,
  setupLibrary: { setups, overrides: {} },
  textLibrary: { texts: builtinTexts },
  presetLibrary: { presets },
  workspaces,
  personalSpeed: { calibration: undefined },
  standaloneAnalyzerOptions: {},
} as unknown as KeydistAssets;
const fileBytes = new TextEncoder().encode(`${JSON.stringify({ format: 'keydist-user-assets', ...userAssetsFileBody(exportAssets) }, null, 2)}\n`).length;

// 全文の大きさのテキストを入れた手持ちを、保存と読み込みのたびに丸ごと直列化・復元する時間（この環境のNodeでの中央値）
function medianMs(run: () => void): number {
  const times: number[] = [];
  for (let index = 0; index < 7; index += 1) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
}
const timings = [1, 8, 16].map((count) => {
  const library = { texts: Array.from({ length: count }, (_, index) => ({ id: `text-${index}`, name: `全文${index}`, text: nekoText })) };
  const raw = JSON.stringify(TEXT_LIBRARY_CODEC.encode(library));
  return {
    count,
    length: raw.length,
    save: medianMs(() => JSON.stringify(TEXT_LIBRARY_CODEC.encode(library))),
    load: medianMs(() => TEXT_LIBRARY_CODEC.decode(JSON.parse(raw))),
  };
});

const total = rows.reduce((sum, row) => sum + row.chars, 0);
console.log('| 保存するもの | 文字列の長さ | 備考 |');
console.log('|---|---:|---|');
for (const row of rows) console.log(`| ${row.label} | ${row.chars.toLocaleString('en-US')} | ${row.note} |`);
console.log(
  `| 合計 | ${total.toLocaleString('en-US')} | localStorageの枠（約${LOCAL_STORAGE_CHARS.toLocaleString('en-US')}字）の${((total / LOCAL_STORAGE_CHARS) * 100).toFixed(1)}% |`,
);
console.log('');
console.log('| 全文の大きさのテキストの件数 | 文字列の長さ | 直列化（ms） | 復元（ms） |');
console.log('|---:|---:|---:|---:|');
for (const timing of timings)
  console.log(`| ${timing.count} | ${timing.length.toLocaleString('en-US')} | ${timing.save.toFixed(1)} | ${timing.load.toFixed(1)} |`);
console.log('');
console.log(`書き出しのファイル（組み込みの資産を写したもの。全文のテキストは含まない）: ${fileBytes.toLocaleString('en-US')}バイト`);
