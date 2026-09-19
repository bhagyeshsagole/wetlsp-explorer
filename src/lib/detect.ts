/**
 * Dataset detection: given the files a user dropped in, work out which site they
 * belong to and which logical tables they form — with zero configuration.
 *
 * Filenames in the real exports mix `_` and `-` separators
 * (`CA_DB2_pixels_geom.parquet` next to `CA-DB2-wetlsp-2021.nc`), so every match
 * runs against a normalised form and never against an exact name.
 */
import type { DatasetLayout, NetcdfFile, SiteManifest, StoredFile, StoredTable } from './types';

export interface InputFile {
  /** Path as the browser reported it, e.g. `CA-DB2/CA_DB2_pixels_geom.parquet`. */
  path: string;
  size: number;
}

const TABLE_PATTERNS: Array<{ role: 'geom' | 'meta' | 'timeseries'; re: RegExp; dir: RegExp }> = [
  { role: 'geom', re: /pixels_geom/, dir: /(^|\/)pixels_geom_ds$/ },
  { role: 'meta', re: /pixels_meta/, dir: /(^|\/)pixels_meta_ds$/ },
  { role: 'timeseries', re: /pixels_timeseries/, dir: /(^|\/)pixels_timeseries_ds$/ },
];

export function normalise(s: string): string {
  return s.toLowerCase().replace(/-/g, '_');
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function extension(path: string): string {
  const b = basename(path);
  const i = b.lastIndexOf('.');
  return i === -1 ? '' : b.slice(i + 1).toLowerCase();
}

/**
 * Strip the common leading directory shared by every input path, so a manifest
 * is identical whether the user dropped the folder or its contents.
 */
export function stripCommonRoot(files: InputFile[]): InputFile[] {
  if (files.length === 0) return files;
  const split = files.map((f) => f.path.split('/').filter(Boolean));
  let prefix = 0;
  outer: for (;;) {
    const seg = split[0][prefix];
    // Never strip the final segment — that is the filename.
    if (seg === undefined || prefix >= split[0].length - 1) break;
    for (const parts of split) {
      if (parts.length - 1 <= prefix || parts[prefix] !== seg) break outer;
    }
    prefix++;
  }
  if (prefix === 0) return files;
  return files.map((f, i) => ({ ...f, path: split[i].slice(prefix).join('/') }));
}

/** `CA-DB2-wetlsp-2021.nc` -> `{ siteId: 'CA-DB2', year: 2021 }`. */
export function parseNetcdfName(path: string): { siteId: string | null; year: number | null } {
  const name = basename(path).replace(/\.nc$/i, '');
  const norm = normalise(name);
  if (!norm.includes('wetlsp')) return { siteId: null, year: null };
  const yearMatch = norm.match(/(19|20)\d{2}/);
  const year = yearMatch ? Number(yearMatch[0]) : null;
  // Site id is whatever precedes the `wetlsp` token, in its original spelling.
  const idx = norm.indexOf('wetlsp');
  const siteId = idx > 0 ? name.slice(0, idx).replace(/[-_]+$/, '') : null;
  return { siteId: siteId || null, year };
}

/** `CA_DB2_pixels_geom.parquet` -> `CA_DB2`. */
export function siteIdFromTableName(path: string): string | null {
  const name = basename(path).replace(/\.parquet$/i, '');
  const norm = normalise(name);
  const idx = norm.indexOf('pixels_');
  if (idx <= 0) return null;
  return name.slice(0, idx).replace(/[-_]+$/, '') || null;
}

export interface DetectionResult {
  siteId: string;
  /** Alternative spellings seen across filenames, for reporting. */
  siteIdCandidates: string[];
  layout: DatasetLayout;
  geom: StoredTable | null;
  meta: StoredTable | null;
  timeseries: StoredTable | null;
  netcdf: NetcdfFile[];
  readme: StoredFile[];
  unrecognised: StoredFile[];
  warnings: string[];
  totalBytes: number;
}

function makeTable(
  role: 'geom' | 'meta' | 'timeseries',
  parts: StoredFile[],
  kind: 'file' | 'directory',
  directory?: string,
): StoredTable {
  const sorted = [...parts].sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }));
  return {
    role,
    kind,
    directory,
    parts: sorted,
    totalBytes: sorted.reduce((s, p) => s + p.size, 0),
  };
}

/**
 * Classify a flat list of files into a site manifest skeleton. Pure and
 * synchronous — `ingest.ts` layers the async parts (reading meta, writing OPFS)
 * on top.
 */
export function detectDataset(rawFiles: InputFile[], folderHint?: string): DetectionResult {
  const files = stripCommonRoot(rawFiles.filter((f) => !basename(f.path).startsWith('.')));
  const warnings: string[] = [];
  const idVotes = new Map<string, number>();
  const vote = (id: string | null, weight: number) => {
    if (!id) return;
    idVotes.set(id, (idVotes.get(id) ?? 0) + weight);
  };

  const batched: Record<string, StoredFile[]> = {};
  const single: Record<string, StoredFile[]> = {};
  const netcdf: NetcdfFile[] = [];
  const readme: StoredFile[] = [];
  const unrecognised: StoredFile[] = [];
  let totalBytes = 0;

  for (const f of files) {
    const stored: StoredFile = { path: f.path, size: f.size };
    totalBytes += f.size;
    const ext = extension(f.path);
    const normDir = normalise(dirname(f.path));
    const normBase = normalise(basename(f.path));

    if (ext === 'nc' || ext === 'nc4' || ext === 'netcdf') {
      const { siteId, year } = parseNetcdfName(f.path);
      vote(siteId, 3);
      if (year === null) {
        warnings.push(`Could not read a year out of "${basename(f.path)}" — it was skipped.`);
        unrecognised.push(stored);
      } else {
        netcdf.push({ ...stored, year });
      }
      continue;
    }

    if (ext === 'parquet') {
      const dirMatch = TABLE_PATTERNS.find((p) => p.dir.test(normDir));
      if (dirMatch) {
        (batched[dirMatch.role] ??= []).push(stored);
        continue;
      }
      const nameMatch = TABLE_PATTERNS.find((p) => p.re.test(normBase));
      if (nameMatch) {
        vote(siteIdFromTableName(f.path), 2);
        (single[nameMatch.role] ??= []).push(stored);
        continue;
      }
      unrecognised.push(stored);
      continue;
    }

    if (/^readme/.test(normBase) && (ext === 'md' || ext === 'json' || ext === 'txt')) {
      readme.push(stored);
      continue;
    }

    unrecognised.push(stored);
  }

  // A `_ds` directory always wins over a same-role single file: it is the
  // complete table, the single file would be one arbitrary part.
  const resolve = (role: 'geom' | 'meta' | 'timeseries'): StoredTable | null => {
    const dirParts = batched[role];
    if (dirParts?.length) {
      const dir = dirname(dirParts[0].path);
      return makeTable(role, dirParts, 'directory', dir);
    }
    const fileParts = single[role];
    if (fileParts?.length) {
      if (fileParts.length > 1) {
        return makeTable(role, fileParts, 'directory', dirname(fileParts[0].path));
      }
      return makeTable(role, fileParts, 'file');
    }
    return null;
  };

  const geom = resolve('geom');
  const meta = resolve('meta');
  const timeseries = resolve('timeseries');

  const hasBatched = Object.keys(batched).length > 0;
  const hasSingle = Object.keys(single).length > 0;
  const layout: DatasetLayout =
    hasBatched && hasSingle
      ? 'mixed'
      : hasBatched
        ? 'batched'
        : hasSingle
          ? 'single-file'
          : netcdf.length > 0
            ? 'single-file'
            : 'unknown';

  if (folderHint) vote(folderHint.replace(/\/+$/, '').split('/').pop() ?? null, 1);

  let siteId = '';
  let best = -1;
  for (const [id, score] of idVotes) {
    if (score > best) {
      best = score;
      siteId = id;
    }
  }
  if (!siteId) siteId = 'Unknown site';

  // Warn about what is missing, naming the consequence rather than the file.
  if (!geom)
    warnings.push(
      'No `pixels_geom` table found, so pixels cannot be placed on the map. Time series still work if `pixels_timeseries` is present.',
    );
  if (!meta)
    warnings.push(
      'No `pixels_meta` table found, so the coordinate reference system is unknown. Pixels will stay in projected metres until a CRS is supplied.',
    );
  if (!timeseries)
    warnings.push('No `pixels_timeseries` table found — the EVI time series view will be empty.');
  if (netcdf.length === 0)
    warnings.push('No WetLSP NetCDF files found — the phenometrics view will be empty.');

  const dupYears = netcdf
    .map((n) => n.year)
    .filter((y, i, arr) => arr.indexOf(y) !== i)
    .filter((y, i, arr) => arr.indexOf(y) === i);
  for (const y of dupYears) {
    warnings.push(`More than one NetCDF for ${y}; the largest file was kept.`);
  }

  // Keep one NetCDF per year — the largest, which is the complete export.
  const byYear = new Map<number, NetcdfFile>();
  for (const n of netcdf) {
    const prev = byYear.get(n.year);
    if (!prev || n.size > prev.size) byYear.set(n.year, n);
  }

  return {
    siteId,
    siteIdCandidates: [...idVotes.keys()],
    layout,
    geom,
    meta,
    timeseries,
    netcdf: [...byYear.values()].sort((a, b) => a.year - b.year),
    readme,
    unrecognised,
    warnings,
    totalBytes,
  };
}

/** True when there is enough here to be worth ingesting at all. */
export function isIngestable(d: DetectionResult): boolean {
  return Boolean(d.geom || d.timeseries || d.netcdf.length > 0);
}

export function manifestFromDetection(d: DetectionResult): SiteManifest {
  return {
    siteId: d.siteId,
    layout: d.layout,
    geom: d.geom,
    meta: d.meta,
    timeseries: d.timeseries,
    netcdf: d.netcdf,
    readme: d.readme,
    unrecognised: d.unrecognised,
    warnings: d.warnings,
    totalBytes: d.totalBytes,
    importedAt: Date.now(),
  };
}
