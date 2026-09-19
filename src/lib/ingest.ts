/**
 * Turning whatever the user dropped in into a persisted, queryable site.
 *
 * Handles three input routes — drag-and-drop of a folder, `webkitdirectory`
 * pickers and plain multi-file selection — and normalises all of them into the
 * same `{ path, file }` list before detection runs.
 */
import {
  basename,
  detectDataset,
  isIngestable,
  manifestFromDetection,
  stripCommonRoot,
  type InputFile,
} from './detect';
import { saveManifest, saveSiteMeta } from './idb';
import { requestPersistence, writeSiteFile } from './opfs';
import type { ProgressEvent, SiteManifest, SiteMeta } from './types';

export interface IngestEntry {
  path: string;
  file: File;
}

export interface IngestResult {
  manifest: SiteManifest;
  meta: SiteMeta;
  /** Bytes actually written to OPFS. */
  bytesWritten: number;
}

export interface IngestOptions {
  folderHint?: string;
  onProgress?: (p: ProgressEvent) => void;
  signal?: AbortSignal;
}

/* --------------------------------------------------------- input routes */

/** Files from `<input webkitdirectory>` or a plain multi-file `<input>`. */
export function entriesFromFileList(list: FileList | File[]): IngestEntry[] {
  return Array.from(list).map((file) => ({
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    file,
  }));
}

/** Recursively walk a legacy `FileSystemEntry` tree from a drop. */
async function walkEntry(entry: FileSystemEntry, prefix: string): Promise<IngestEntry[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [{ path: `${prefix}${entry.name}`, file }];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    children.push(...batch);
  }
  const out: IngestEntry[] = [];
  for (const child of children) {
    out.push(...(await walkEntry(child, `${prefix}${entry.name}/`)));
  }
  return out;
}

/** Recursively walk a File System Access handle from a drop. */
async function walkHandle(
  handle: FileSystemHandle,
  prefix: string,
): Promise<IngestEntry[]> {
  if (handle.kind === 'file') {
    const file = await (handle as FileSystemFileHandle).getFile();
    return [{ path: `${prefix}${handle.name}`, file }];
  }
  const out: IngestEntry[] = [];
  // @ts-expect-error - values() exists at runtime on directory handles.
  for await (const child of (handle as FileSystemDirectoryHandle).values()) {
    out.push(...(await walkHandle(child as FileSystemHandle, `${prefix}${handle.name}/`)));
  }
  return out;
}

/** Everything a drop event carries, folders expanded. */
export async function entriesFromDataTransfer(dt: DataTransfer): Promise<IngestEntry[]> {
  const items = Array.from(dt.items).filter((i) => i.kind === 'file');
  if (items.length === 0) return entriesFromFileList(dt.files);

  const supportsHandles = typeof (
    items[0] as DataTransferItem & { getAsFileSystemHandle?: unknown }
  ).getAsFileSystemHandle === 'function';

  const out: IngestEntry[] = [];
  if (supportsHandles) {
    const handles = await Promise.all(
      items.map((i) =>
        (
          i as DataTransferItem & {
            getAsFileSystemHandle: () => Promise<FileSystemHandle | null>;
          }
        ).getAsFileSystemHandle(),
      ),
    );
    for (const h of handles) {
      if (h) out.push(...(await walkHandle(h, '')));
    }
    if (out.length > 0) return out;
  }

  const roots = items
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e));
  for (const root of roots) out.push(...(await walkEntry(root, '')));
  return out.length > 0 ? out : entriesFromFileList(dt.files);
}

/** Show a directory picker via the File System Access API when available. */
export async function pickDirectory(): Promise<IngestEntry[] | null> {
  // Electron exposes showDirectoryPicker, but its browser picker can remain
  // pending without displaying a dialog. Use the native directory file-input
  // chooser in desktop builds; it also preserves nested batch-folder paths.
  if (import.meta.env.MODE === 'desktop') return null;
  const picker = (
    window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker;
  if (!picker) return null;
  try {
    const dir = await picker.call(window);
    return walkHandle(dir, '');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return [];
    throw err;
  }
}

/* -------------------------------------------------------------- ingest */

/** Copy one file into OPFS, counting bytes so progress stays honest on a 190 MB parquet. */
async function copyToOpfs(
  siteId: string,
  entry: IngestEntry,
  onBytes: (n: number) => void,
): Promise<number> {
  // Small files go through a single write; big ones stream so the whole parquet
  // is never resident in JS memory at once.
  if (entry.file.size < 8 * 1024 * 1024) {
    const size = await writeSiteFile(siteId, entry.path, entry.file);
    onBytes(size);
    return size;
  }
  let written = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      written += chunk.byteLength;
      onBytes(chunk.byteLength);
      controller.enqueue(chunk);
    },
  });
  await writeSiteFile(
    siteId,
    entry.path,
    entry.file.stream().pipeThrough(counter) as ReadableStream<Uint8Array>,
  );
  return written;
}

/**
 * Read `pixels_meta` straight from the dropped file, before anything is written
 * to disk, so the site is stored under the id the data itself declares
 * (`CA-DB2`) rather than the one its parquet filenames imply (`CA_DB2`).
 */
async function peekMeta(parts: IngestEntry[]): Promise<SiteMeta> {
  if (parts.length === 0) return {};
  const [{ getDb, sqlStr }, duckdb] = await Promise.all([
    import('@/engine/duckdb'),
    import('@duckdb/duckdb-wasm'),
  ]);
  const db = await getDb();
  const names: string[] = [];
  try {
    for (const [i, part] of parts.entries()) {
      const name = `peek_meta_${Date.now()}_${i}.parquet`;
      await db.registerFileHandle(
        name,
        part.file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true,
      );
      names.push(name);
    }
    const conn = await db.connect();
    try {
      const ref = `read_parquet([${names.map(sqlStr).join(', ')}], union_by_name = true)`;
      const desc = await conn.query(`DESCRIBE SELECT * FROM ${ref}`);
      const cols: string[] = [];
      const child = desc.getChild('column_name');
      for (let i = 0; i < (child?.length ?? 0); i++) cols.push(String(child!.get(i)));
      if (cols.length < 2) return {};
      const lower = cols.map((c) => c.toLowerCase());
      const kIdx = Math.max(
        0,
        lower.findIndex((c) => ['key', 'name', 'field', 'k', 'attribute'].includes(c)),
      );
      const vIdx = (() => {
        const i = lower.findIndex((c) => ['value', 'val', 'v'].includes(c));
        return i >= 0 ? i : 1;
      })();
      const q = `SELECT CAST("${cols[kIdx]}" AS VARCHAR) AS k, CAST("${cols[vIdx]}" AS VARCHAR) AS v FROM ${ref}`;
      const table = await conn.query(q);
      const meta: SiteMeta = {};
      const ks = table.getChild('k');
      const vs = table.getChild('v');
      for (let i = 0; i < (ks?.length ?? 0); i++) {
        meta[String(ks!.get(i))] = String(vs!.get(i));
      }
      return meta;
    } finally {
      await conn.close();
    }
  } finally {
    for (const n of names) {
      try {
        await db.dropFile(n);
      } catch {
        /* nothing to drop */
      }
    }
  }
}

export async function ingestEntries(
  entries: IngestEntry[],
  opts: IngestOptions = {},
): Promise<IngestResult> {
  // Drop OS cruft (`.DS_Store`, `._*`) before anything else looks at the list.
  const kept = entries.filter((e) => !basename(e.path).startsWith('.'));
  const input: InputFile[] = kept.map((e) => ({ path: e.path, size: e.file.size }));

  // Strip the shared folder prefix once, here, so the paths used for storage are
  // exactly the paths detection classified.
  const rel = stripCommonRoot(input).map((f) => f.path);
  const files = kept.map((e, i) => ({ path: rel[i], file: e.file }));

  const detection = detectDataset(
    files.map((f) => ({ path: f.path, size: f.file.size })),
    opts.folderHint,
  );

  if (!isIngestable(detection)) {
    throw new Error(
      'No WetLSP data found here. A site folder should contain `*pixels_geom*.parquet`, `*pixels_timeseries*.parquet` and/or `*-wetlsp-<year>.nc` files.',
    );
  }

  let siteId = detection.siteId;
  let meta: SiteMeta = {};
  const byPath = new Map(files.map((f) => [f.path, f]));
  const metaParts = (detection.meta?.parts ?? [])
    .map((p) => byPath.get(p.path))
    .filter((e): e is IngestEntry => Boolean(e));

  opts.onProgress?.({ phase: 'Identifying site', fraction: null });
  try {
    meta = await peekMeta(metaParts);
    if (meta.site_id && meta.site_id.trim()) siteId = meta.site_id.trim();
  } catch {
    // Reading meta is a nicety; detection already produced a usable id.
    detection.warnings.push(
      'Could not read `pixels_meta` while importing, so the site id came from the filenames.',
    );
  }

  await requestPersistence();

  const total = files.reduce((s, e) => s + e.file.size, 0);
  let done = 0;
  let bytesWritten = 0;
  for (const entry of files) {
    if (opts.signal?.aborted) throw new Error('Import cancelled.');
    opts.onProgress?.({
      phase: 'Copying into offline storage',
      fraction: total > 0 ? done / total : null,
      detail: entry.path,
    });
    bytesWritten += await copyToOpfs(siteId, entry, (n) => {
      done += n;
      opts.onProgress?.({
        phase: 'Copying into offline storage',
        fraction: total > 0 ? Math.min(1, done / total) : null,
        detail: entry.path,
      });
    });
  }

  const manifest = manifestFromDetection({ ...detection, siteId });
  manifest.totalBytes = bytesWritten;
  await saveManifest(manifest);
  await saveSiteMeta(siteId, meta);

  opts.onProgress?.({ phase: 'Ready', fraction: 1 });
  return { manifest, meta, bytesWritten };
}
