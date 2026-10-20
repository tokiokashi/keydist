import { DICTIONARY_ENTRY_NAMES, DICTIONARY_NOTICE_ENTRY } from './dictionary-spec.ts';
import { extractZip, ZipFormatError } from './zip.ts';

/** `loadDictionaryFromBytes` に渡す9ファイル（`DICTIONARY_ENTRY_NAMES` の順） */
export type DictionaryFiles = readonly Uint8Array[];

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * 辞書のzipを展開し、辞書の9ファイルを順に取り出す。
 * 辞書として使えない中身（zipでない・ファイルが足りない・空・`metadata.json` がJSONでない）は
 * `ZipFormatError` で拒む。配信側がHTMLを返した時などに、壊れた物を使わない・保存しないための検査。
 */
export async function readDictionaryZip(zip: ArrayBuffer | Uint8Array): Promise<DictionaryFiles> {
  const entries = await extractZip(zip);
  const byName = new Map<string, Uint8Array>();
  for (const [path, content] of entries) byName.set(baseName(path), content);
  const files = DICTIONARY_ENTRY_NAMES.map((name) => {
    const content = byName.get(name);
    if (content === undefined || content.length === 0) throw new ZipFormatError(`辞書の ${name} がzipに無い`);
    return content;
  });
  try {
    JSON.parse(new TextDecoder().decode(files[0]));
  } catch {
    throw new ZipFormatError('辞書のmetadata.jsonがJSONとして読めない');
  }
  return files;
}

/** zipの中の告知文。無ければundefined。 */
export async function readDictionaryNotice(zip: ArrayBuffer | Uint8Array): Promise<Uint8Array | undefined> {
  for (const [path, content] of await extractZip(zip)) {
    if (baseName(path) === DICTIONARY_NOTICE_ENTRY) return content;
  }
  return undefined;
}
