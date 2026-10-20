import { deflateRawSync } from 'node:zlib';
import { DICTIONARY_ENTRY_NAMES, DICTIONARY_NOTICE_ENTRY } from './dictionary-spec.ts';

/** テスト用にzipを組む。`deflate` が偽のエントリは無圧縮で入れる。 */
export function buildZip(entries: readonly { name: string; content: Uint8Array; deflate?: boolean }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.deflate === true ? new Uint8Array(deflateRawSync(entry.content)) : entry.content;
    const method = entry.deflate === true ? 8 : 0;
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, method, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, entry.content.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, entry.content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let position = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

/** 辞書の9ファイルと告知文を `lindera-ipadic/` の下に持つzip。中身は本物の辞書ではない。 */
export function buildDictionaryZip(options: { omit?: string; metadata?: string } = {}): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const entries = DICTIONARY_ENTRY_NAMES.filter((name) => name !== options.omit).map((name, index) => ({
    name: `lindera-ipadic/${name}`,
    content: name === 'metadata.json' ? encoder.encode(options.metadata ?? '{"name":"test"}') : encoder.encode(`${name}:${index}`),
    deflate: index % 2 === 0,
  }));
  entries.push({ name: 'lindera-ipadic/', content: new Uint8Array(0), deflate: false });
  entries.push({ name: `lindera-ipadic/${DICTIONARY_NOTICE_ENTRY}`, content: encoder.encode('notice'), deflate: true });
  return buildZip(entries);
}
