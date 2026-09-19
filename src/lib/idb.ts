/** Small-state persistence: manifests, settings and per-site derived metadata. */
import { createStore, get, set, del, keys } from 'idb-keyval';
import type { SiteManifest, SiteMeta } from './types';

const store = createStore('wetlsp-explorer', 'state');

const manifestKey = (siteId: string) => `manifest:${siteId}`;
const metaKey = (siteId: string) => `meta:${siteId}`;

export async function saveManifest(m: SiteManifest): Promise<void> {
  await set(manifestKey(m.siteId), m, store);
}

export async function loadManifest(siteId: string): Promise<SiteManifest | undefined> {
  return get<SiteManifest>(manifestKey(siteId), store);
}

export async function loadAllManifests(): Promise<SiteManifest[]> {
  const ks = await keys(store);
  const out: SiteManifest[] = [];
  for (const k of ks) {
    if (typeof k === 'string' && k.startsWith('manifest:')) {
      const m = await get<SiteManifest>(k, store);
      if (m) out.push(m);
    }
  }
  return out.sort((a, b) => a.siteId.localeCompare(b.siteId));
}

export async function deleteManifest(siteId: string): Promise<void> {
  await del(manifestKey(siteId), store);
  await del(metaKey(siteId), store);
}

export async function saveSiteMeta(siteId: string, meta: SiteMeta): Promise<void> {
  await set(metaKey(siteId), meta, store);
}

export async function loadSiteMeta(siteId: string): Promise<SiteMeta | undefined> {
  return get<SiteMeta>(metaKey(siteId), store);
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  await set(`setting:${key}`, value, store);
}

export async function loadSetting<T>(key: string): Promise<T | undefined> {
  return get<T>(`setting:${key}`, store);
}
