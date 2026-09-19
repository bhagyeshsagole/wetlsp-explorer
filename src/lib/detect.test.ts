import { describe, expect, it } from 'vitest';
import {
  detectDataset,
  isIngestable,
  parseNetcdfName,
  siteIdFromTableName,
  stripCommonRoot,
} from './detect';

const KB = 1024;

/** The verified CA-DB2 export from the data contract. */
const singleFileSite = [
  { path: 'CA-DB2/CA_DB2_pixels_geom.parquet', size: 420 * KB },
  { path: 'CA-DB2/CA_DB2_pixels_meta.parquet', size: 6 * KB },
  { path: 'CA-DB2/CA_DB2_pixels_timeseries.parquet', size: 190 * KB * KB },
  { path: 'CA-DB2/CA-DB2-wetlsp-2021.nc', size: 40 * KB * KB },
  { path: 'CA-DB2/CA-DB2-wetlsp-2022.nc', size: 40 * KB * KB },
  { path: 'CA-DB2/CA-DB2-wetlsp-2023.nc', size: 40 * KB * KB },
  { path: 'CA-DB2/CA-DB2-wetlsp-2024.nc', size: 40 * KB * KB },
  { path: 'CA-DB2/README_parquet.md', size: 4 * KB },
  { path: 'CA-DB2/README_parquet.json', size: 2 * KB },
];

const batchedSite = [
  { path: 'US-Myb/pixels_geom_ds/geom_batch_001.parquet', size: 100 * KB },
  { path: 'US-Myb/pixels_geom_ds/geom_batch_002.parquet', size: 100 * KB },
  { path: 'US-Myb/pixels_meta_ds/meta.parquet', size: 5 * KB },
  { path: 'US-Myb/pixels_timeseries_ds/ts_batch_001.parquet', size: 60 * KB * KB },
  { path: 'US-Myb/pixels_timeseries_ds/ts_batch_002.parquet', size: 60 * KB * KB },
  { path: 'US-Myb/pixels_timeseries_ds/ts_batch_010.parquet', size: 60 * KB * KB },
  { path: 'US-Myb/US-Myb-wetlsp-2022.nc', size: 30 * KB * KB },
];

describe('stripCommonRoot', () => {
  it('drops the shared site folder but keeps the filenames', () => {
    const out = stripCommonRoot(singleFileSite);
    expect(out[0].path).toBe('CA_DB2_pixels_geom.parquet');
    expect(out[3].path).toBe('CA-DB2-wetlsp-2021.nc');
  });

  it('keeps nested batch directories intact', () => {
    const out = stripCommonRoot(batchedSite);
    expect(out[0].path).toBe('pixels_geom_ds/geom_batch_001.parquet');
  });

  it('is a no-op on already-stripped paths', () => {
    const once = stripCommonRoot(singleFileSite);
    expect(stripCommonRoot(once).map((f) => f.path)).toEqual(once.map((f) => f.path));
  });

  it('leaves flat multi-file selections alone', () => {
    const flat = [
      { path: 'CA_DB2_pixels_geom.parquet', size: 1 },
      { path: 'CA-DB2-wetlsp-2021.nc', size: 1 },
    ];
    expect(stripCommonRoot(flat).map((f) => f.path)).toEqual(flat.map((f) => f.path));
  });
});

describe('name parsing', () => {
  it('reads the site and year out of a NetCDF filename', () => {
    expect(parseNetcdfName('CA-DB2-wetlsp-2021.nc')).toEqual({ siteId: 'CA-DB2', year: 2021 });
    expect(parseNetcdfName('US_Myb_wetlsp_2024.nc')).toEqual({ siteId: 'US_Myb', year: 2024 });
  });

  it('ignores files that are not WetLSP exports', () => {
    expect(parseNetcdfName('random.nc').year).toBeNull();
  });

  it('reads the site id out of a parquet table name', () => {
    expect(siteIdFromTableName('CA_DB2_pixels_timeseries.parquet')).toBe('CA_DB2');
    expect(siteIdFromTableName('meta.parquet')).toBeNull();
  });
});

describe('detectDataset — single-file layout', () => {
  const d = detectDataset(singleFileSite);

  it('prefers the NetCDF spelling of the site id', () => {
    expect(d.siteId).toBe('CA-DB2');
  });

  it('classifies all three tables as single files', () => {
    expect(d.geom?.kind).toBe('file');
    expect(d.meta?.kind).toBe('file');
    expect(d.timeseries?.kind).toBe('file');
    expect(d.timeseries?.parts[0].path).toBe('CA_DB2_pixels_timeseries.parquet');
  });

  it('collects one NetCDF per year, in order', () => {
    expect(d.netcdf.map((n) => n.year)).toEqual([2021, 2022, 2023, 2024]);
  });

  it('keeps the READMEs and reports no missing files', () => {
    expect(d.readme).toHaveLength(2);
    expect(d.warnings).toHaveLength(0);
    expect(d.layout).toBe('single-file');
    expect(isIngestable(d)).toBe(true);
  });
});

describe('detectDataset — batched `_ds` layout', () => {
  const d = detectDataset(batchedSite);

  it('treats each `_ds` directory as one logical table', () => {
    expect(d.layout).toBe('batched');
    expect(d.geom?.kind).toBe('directory');
    expect(d.geom?.parts).toHaveLength(2);
    expect(d.timeseries?.parts).toHaveLength(3);
  });

  it('orders batch parts naturally, not lexically', () => {
    expect(d.timeseries?.parts.map((p) => p.path)).toEqual([
      'pixels_timeseries_ds/ts_batch_001.parquet',
      'pixels_timeseries_ds/ts_batch_002.parquet',
      'pixels_timeseries_ds/ts_batch_010.parquet',
    ]);
  });

  it('still identifies the site', () => {
    expect(d.siteId).toBe('US-Myb');
  });
});

describe('detectDataset — partial and messy input', () => {
  it('ingests what is there and names what is missing', () => {
    const d = detectDataset([
      { path: 'CA-DB2/CA_DB2_pixels_timeseries.parquet', size: 10 },
      { path: 'CA-DB2/CA-DB2-wetlsp-2021.nc', size: 10 },
    ]);
    expect(isIngestable(d)).toBe(true);
    expect(d.geom).toBeNull();
    expect(d.warnings.some((w) => w.includes('pixels_geom'))).toBe(true);
    expect(d.warnings.some((w) => w.includes('pixels_meta'))).toBe(true);
  });

  it('refuses a folder with nothing WetLSP in it', () => {
    const d = detectDataset([{ path: 'photos/cat.jpg', size: 10 }]);
    expect(isIngestable(d)).toBe(false);
    expect(d.unrecognised).toHaveLength(1);
  });

  it('keeps the largest file when a year is duplicated', () => {
    const d = detectDataset([
      { path: 'S/S-wetlsp-2021.nc', size: 10 },
      { path: 'S/S-wetlsp-2021 (1).nc', size: 99 },
    ]);
    expect(d.netcdf).toHaveLength(1);
    expect(d.netcdf[0].size).toBe(99);
  });

  it('skips dotfiles', () => {
    const d = detectDataset([
      ...singleFileSite,
      { path: 'CA-DB2/.DS_Store', size: 6148 },
    ]);
    expect(d.unrecognised).toHaveLength(0);
  });

  it('prefers the `_ds` directory over a stray same-role single file', () => {
    const d = detectDataset([
      { path: 'S/pixels_geom_ds/a.parquet', size: 1 },
      { path: 'S/pixels_geom_ds/b.parquet', size: 1 },
      { path: 'S/S_pixels_geom.parquet', size: 1 },
      { path: 'S/S-wetlsp-2021.nc', size: 1 },
    ]);
    expect(d.geom?.kind).toBe('directory');
    expect(d.geom?.parts).toHaveLength(2);
    expect(d.layout).toBe('mixed');
  });
});
