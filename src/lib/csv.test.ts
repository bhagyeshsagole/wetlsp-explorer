import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvObjects, toCsv } from './csv';
import { parseCatalogCsv, indexCatalog } from './catalog';

describe('csv', () => {
  it('handles quotes, embedded commas and newlines', () => {
    const rows = parseCsv('a,b\n"x, y","he said ""hi"""\n');
    expect(rows[1]).toEqual(['x, y', 'he said "hi"']);
  });

  it('handles CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')[1]).toEqual(['1', '2']);
  });

  it('round-trips through toCsv', () => {
    const csv = toCsv(['a', 'b'], [['x, y', 'plain']]);
    expect(parseCsv(csv)[1]).toEqual(['x, y', 'plain']);
  });

  it('builds objects from the header row', () => {
    expect(parseCsvObjects('site_id,lat\nCA-DB2,49.1\n')[0]).toEqual({
      site_id: 'CA-DB2',
      lat: '49.1',
    });
  });
});

describe('catalog parsing', () => {
  const csv = [
    'site_id,site_name,country,lat,lon,base_network,tower_height_m,canopy_height_m,wetlsp_2021,wetlsp_2022,wetlsp_2023,wetlsp_2024,notes',
    'CA-DB2,Delta Bog 2,Canada,49.13,-122.98,AmeriFlux,4.2,0.4,1,1,TRUE,0,peatland',
    'US-Myb,Mayberry,United States,38.05,-121.77,AmeriFlux,,,yes,no,,,',
    ',orphan row with no id,,,,,,,,,,,',
  ].join('\n');

  const sites = parseCatalogCsv(csv);

  it('drops rows with no site id', () => {
    expect(sites).toHaveLength(2);
  });

  it('reads coordinates and heights as numbers, leaving blanks undefined', () => {
    expect(sites[0]).toMatchObject({ lat: 49.13, lon: -122.98, tower_height_m: 4.2 });
    expect(sites[1].tower_height_m).toBeUndefined();
  });

  it('treats 1/true/yes as available and everything else as not', () => {
    expect(sites[0].years).toEqual({ 2021: true, 2022: true, 2023: true, 2024: false });
    expect(sites[1].years[2021]).toBe(true);
    expect(sites[1].years[2022]).toBe(false);
  });

  it('keeps unknown columns rather than dropping them', () => {
    expect(sites[0].extra.notes).toBe('peatland');
  });

  it('indexes both separator spellings so lookups always hit', () => {
    const idx = indexCatalog(sites);
    expect(idx.get('CA-DB2')?.site_name).toBe('Delta Bog 2');
    expect(idx.get('CA_DB2')?.site_name).toBe('Delta Bog 2');
  });
});
