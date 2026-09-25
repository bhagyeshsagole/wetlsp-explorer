/**
 * Minimal streaming ZIP reader for imports.
 *
 * Google Drive hands out site folders as `CA-DSM-2026…-1-001.zip`. Reading the
 * central directory takes a few KB from the end of the archive; each member is
 * then inflated with the browser's native `DecompressionStream` straight into
 * OPFS, so a 300 MB archive is never resident in memory. Stored (method 0) and
 * deflated (method 8) members are supported, including ZIP64 sizes/offsets.
 */

export interface ZipMember {
  /** Path inside the archive, `/`-separated. */
  path: string;
  compressedSize: number;
  size: number;
  method: number;
  /** Offset of the member's local file header. */
  localOffset: number;
}

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MAX_COMMENT = 0xffff;

async function bytes(blob: Blob, start: number, end: number): Promise<DataView> {
  const buf = await blob.slice(start, end).arrayBuffer();
  return new DataView(buf);
}

function u64(view: DataView, offset: number): number {
  // Archive offsets stay far below 2^53; Number is exact here.
  return view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 2 ** 32;
}

export function isZipPath(path: string): boolean {
  return /\.zip$/i.test(path);
}

/** List the members of a ZIP archive without reading their contents. */
export async function listZip(archive: Blob): Promise<ZipMember[]> {
  const tailStart = Math.max(0, archive.size - (22 + MAX_COMMENT));
  const tail = await bytes(archive, tailStart, archive.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This .zip file is damaged or incomplete (no central directory).');

  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);

  // ZIP64: the classic record holds 0xFFFF/0xFFFFFFFF and a locator precedes it.
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || tail.getUint32(loc, true) !== ZIP64_LOCATOR_SIG) {
      throw new Error('This .zip file uses an unsupported ZIP64 layout.');
    }
    const z64Offset = u64(tail, loc + 8);
    const z64 = await bytes(archive, z64Offset, z64Offset + 56);
    if (z64.getUint32(0, true) !== ZIP64_EOCD_SIG) {
      throw new Error('This .zip file has a damaged ZIP64 directory.');
    }
    count = u64(z64, 32);
    cdSize = u64(z64, 40);
    cdOffset = u64(z64, 48);
  }

  const cd = await bytes(archive, cdOffset, cdOffset + cdSize);
  const decoder = new TextDecoder();
  const out: ZipMember[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== CENTRAL_SIG) {
      throw new Error('This .zip file has a damaged central directory.');
    }
    const method = cd.getUint16(p + 10, true);
    let compressedSize = cd.getUint32(p + 20, true);
    let size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localOffset = cd.getUint32(p + 42, true);
    const name = decoder.decode(
      new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen),
    );

    // ZIP64 extra field: only the saturated values are present, in this order.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = cd.getUint16(e, true);
      const len = cd.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = u64(cd, q); q += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(cd, q); q += 8; }
        if (localOffset === 0xffffffff) { localOffset = u64(cd, q); }
      }
      e += 4 + len;
    }

    p = extraEnd + commentLen;
    // Directories carry no data.
    if (name.endsWith('/')) continue;
    out.push({ path: name.replace(/\\/g, '/'), compressedSize, size, method, localOffset });
  }
  return out;
}

/** Stream one member's decompressed bytes. */
export async function openZipMember(
  archive: Blob,
  member: ZipMember,
): Promise<ReadableStream<Uint8Array>> {
  const header = await bytes(archive, member.localOffset, member.localOffset + 30);
  if (header.getUint32(0, true) !== LOCAL_SIG) {
    throw new Error(`"${member.path}" could not be located inside the .zip file.`);
  }
  const start =
    member.localOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const raw = archive.slice(start, start + member.compressedSize).stream();
  if (member.method === 0) return raw;
  if (member.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot unzip archives. Extract the .zip first, then import the folder.');
    }
    return raw.pipeThrough(
      new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>,
    );
  }
  throw new Error(
    `"${member.path}" uses zip compression method ${member.method}, which is not supported. Extract the .zip first.`,
  );
}
