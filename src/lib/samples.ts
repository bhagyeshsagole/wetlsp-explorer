/**
 * Sample sites bundled with the desktop app.
 *
 * `npm run samples` extracts the lab's chosen sites into `samples/`, and the
 * desktop installer ships that folder beside the app. The local server exposes
 * it at `/samples/`, and first launch streams each site into offline storage
 * through the ordinary importer. The bundled copy stays in the installer, so a
 * sample the user deletes to make room can be restored later in Settings.
 *
 * Builds without the folder (the hosted web app) get an empty list and never
 * mention samples.
 */
import type { IngestEntry } from './ingest';

export interface SampleSite {
  siteId: string;
  name: string;
  description: string;
  bytes: number;
  files: Array<{ path: string; size: number }>;
}

const BASE = `${import.meta.env.BASE_URL}samples/`;

export async function loadSampleIndex(): Promise<SampleSite[]> {
  try {
    const res = await fetch(`${BASE}index.json`, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as { sites?: SampleSite[] };
    return Array.isArray(body.sites) ? body.sites : [];
  } catch {
    return [];
  }
}

/** Importer entries that stream each bundled file from the local server. */
export function sampleEntries(sample: SampleSite): IngestEntry[] {
  return sample.files.map((f) => ({
    path: `${sample.siteId}/${f.path}`,
    size: f.size,
    open: async () => {
      const url = `${BASE}${encodeURIComponent(sample.siteId)}/${f.path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok || !res.body) {
        throw new Error(`The bundled copy of ${sample.siteId} is missing ${f.path}.`);
      }
      return res.body;
    },
  }));
}
