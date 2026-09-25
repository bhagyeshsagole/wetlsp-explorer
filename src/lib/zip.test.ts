import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { listZip, openZipMember } from './zip';

/** Build a real archive: one stored member, one deflated member in a folder. */
function makeZip(members: Array<{ name: string; data: Uint8Array; deflate: boolean }>): Blob {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const m of members) {
    const name = enc.encode(m.name);
    const body = m.deflate ? new Uint8Array(deflateRawSync(m.data)) : m.data;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, m.deflate ? 8 : 0, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, m.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, body);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(10, m.deflate ? 8 : 0, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, m.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, members.length, true);
  eocd.setUint16(10, members.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)] as BlobPart[]);
}

describe('zip reader', () => {
  const big = new Uint8Array(200_000).map((_, i) => (i * 7) % 251);
  const zip = makeZip([
    { name: 'CA-DSM/README_parquet.md', data: new TextEncoder().encode('# hello'), deflate: false },
    { name: 'CA-DSM/', data: new Uint8Array(0), deflate: false },
    { name: 'CA-DSM/CA_DSM_pixels_geom.parquet', data: big, deflate: true },
  ]);

  it('lists members and skips directory entries', async () => {
    const members = await listZip(zip);
    expect(members.map((m) => [m.path, m.size])).toEqual([
      ['CA-DSM/README_parquet.md', 7],
      ['CA-DSM/CA_DSM_pixels_geom.parquet', 200_000],
    ]);
  });

  it('streams stored and deflated members back byte-for-byte', async () => {
    const [readme, geom] = await listZip(zip);
    const text = await new Response(await openZipMember(zip, readme)).text();
    expect(text).toBe('# hello');
    const bytes = new Uint8Array(await new Response(await openZipMember(zip, geom)).arrayBuffer());
    expect(bytes).toEqual(big);
  });

  it('rejects something that is not a zip', async () => {
    await expect(listZip(new Blob(['not a zip at all']))).rejects.toThrow(/damaged or incomplete/);
  });
});
