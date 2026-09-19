/**
 * Site catalog: a bundled CSV ships with the app so the Overview world map works
 * offline before anything is uploaded, and a user-supplied CSV/JSON replaces it.
 */
import { parseCsvObjects } from './csv';
import { loadSetting, saveSetting } from './idb';
import type { CatalogSite } from './types';

const BUNDLED_URL = `${import.meta.env.BASE_URL}catalog/wetlsp_site_catalog.csv`;
const OVERRIDE_KEY = 'catalog.override';

const TRUTHY = new Set(['1', 'true', 't', 'yes', 'y', 'available']);

function num(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function rowToSite(row: Record<string, string>): CatalogSite | null {
  const keys = Object.keys(row);
  const find = (...names: string[]) => {
    for (const n of names) {
      const k = keys.find((key) => key.toLowerCase() === n);
      if (k && row[k] !== '') return row[k];
    }
    return undefined;
  };

  const siteId = find('site_id', 'siteid', 'site');
  if (!siteId) return null;

  const years: Record<number, boolean> = {};
  for (const k of keys) {
    const m = k.toLowerCase().match(/^wetlsp[_-]?(\d{4})$/);
    if (m) years[Number(m[1])] = TRUTHY.has(row[k].trim().toLowerCase());
  }

  const known = new Set([
    'site_id',
    'site_name',
    'country',
    'lat',
    'lon',
    'base_network',
    'tower_height_m',
    'canopy_height_m',
  ]);
  const extra: Record<string, string> = {};
  for (const k of keys) {
    if (known.has(k.toLowerCase()) || /^wetlsp[_-]?\d{4}$/i.test(k)) continue;
    if (row[k] !== '') extra[k] = row[k];
  }

  return {
    site_id: siteId,
    site_name: find('site_name', 'name'),
    country: find('country'),
    lat: num(find('lat', 'latitude')),
    lon: num(find('lon', 'long', 'longitude')),
    base_network: find('base_network', 'network'),
    tower_height_m: num(find('tower_height_m', 'tower_height')),
    canopy_height_m: num(find('canopy_height_m', 'canopy_height')),
    years,
    extra,
  };
}

export function parseCatalogCsv(text: string): CatalogSite[] {
  return parseCsvObjects(text)
    .map(rowToSite)
    .filter((s): s is CatalogSite => s !== null);
}

export function parseCatalogJson(text: string): CatalogSite[] {
  const data = JSON.parse(text) as unknown;
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as { sites?: unknown }).sites)
      ? ((data as { sites: unknown[] }).sites)
      : [];
  return arr
    .map((row) => rowToSite(row as Record<string, string>))
    .filter((s): s is CatalogSite => s !== null);
}

export interface CatalogLoad {
  sites: CatalogSite[];
  source: 'bundled' | 'user' | 'none';
  note?: string;
}

export async function loadCatalog(): Promise<CatalogLoad> {
  const override = await loadSetting<{ text: string; kind: 'csv' | 'json'; name: string }>(
    OVERRIDE_KEY,
  );
  if (override) {
    try {
      const sites =
        override.kind === 'json'
          ? parseCatalogJson(override.text)
          : parseCatalogCsv(override.text);
      if (sites.length > 0) return { sites, source: 'user', note: override.name };
    } catch {
      /* fall back to the bundled copy rather than starting up broken */
    }
  }

  try {
    const res = await fetch(BUNDLED_URL, { cache: 'force-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const sites = parseCatalogCsv(await res.text());
    return { sites, source: sites.length ? 'bundled' : 'none' };
  } catch {
    return { sites: [], source: 'none' };
  }
}

export async function setCatalogOverride(name: string, text: string): Promise<CatalogSite[]> {
  const kind: 'csv' | 'json' = /\.json$/i.test(name) ? 'json' : 'csv';
  const sites = kind === 'json' ? parseCatalogJson(text) : parseCatalogCsv(text);
  if (sites.length === 0) {
    throw new Error(`"${name}" has no rows with a recognisable \`site_id\` column.`);
  }
  await saveSetting(OVERRIDE_KEY, { text, kind, name });
  return sites;
}

export async function clearCatalogOverride(): Promise<void> {
  await saveSetting(OVERRIDE_KEY, undefined);
}

export function indexCatalog(sites: CatalogSite[]): Map<string, CatalogSite> {
  const map = new Map<string, CatalogSite>();
  for (const s of sites) {
    map.set(s.site_id, s);
    // Exports spell ids with both separators; index both so lookups always hit.
    map.set(s.site_id.replace(/-/g, '_'), s);
    map.set(s.site_id.replace(/_/g, '-'), s);
  }
  return map;
}
