/**
 * zip（無圧縮かdeflateの2方式）をメモリ上で展開する。辞書のzipだけを読むための最小の実装で、
 * zip64・暗号化・分割には対応しない。`DecompressionStream` が要る（ブラウザとNode 18以降にある）。
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipFormatError';
  }
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** zipの中身を、ディレクトリを除いたエントリ名（パス付き）から内容への表にして返す。 */
export async function extractZip(buffer: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array>> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new ZipFormatError('zipの終端が見つからない');
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  for (let n = 0; n < entryCount; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new ZipFormatError('zipの中央ディレクトリが壊れている');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new ZipFormatError(`zipの ${name} の位置が壊れている`);
    }
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > bytes.length) throw new ZipFormatError(`zipの ${name} が途中で切れている`);
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    let content: Uint8Array;
    if (method === 0) content = raw;
    else if (method === 8) content = await inflateRaw(raw).catch(() => Promise.reject(new ZipFormatError(`zipの ${name} を展開できない`)));
    else throw new ZipFormatError(`zipの ${name} は未対応の圧縮方式（${method}）`);
    if (content.length !== uncompressedSize) throw new ZipFormatError(`zipの ${name} の大きさが合わない`);
    entries.set(name, content);
  }
  return entries;
}
