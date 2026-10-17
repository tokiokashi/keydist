import type { PresetFileIo } from '#hosts/shared/preset-file-io.ts';
import { downloadJson } from '#platform/browser-download.ts';
import { readTextFile } from '#platform/browser-file.ts';

/** 書き出しファイルの保存・読み取りのブラウザ実装。条件のモーダル・Workspaceの画面・サイドバーが同じものを使う。 */
export const PRESET_FILE_IO: PresetFileIo = { saveJson: downloadJson, readText: readTextFile };
