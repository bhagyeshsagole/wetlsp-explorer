/**
 * Single app store. Everything the chrome and the five views read lives here;
 * heavy data (geometry, rasters, query results) is cached per site alongside it
 * so switching sites is instant after the first load.
 */
import { create } from 'zustand';
import type {
  CatalogSite,
  PixelGeometry,
  ProgressEvent,
  SiteFacts,
  SiteManifest,
  SiteMeta,
  ViewId,
} from '@/lib/types';
import { deleteManifest, loadAllManifests, loadSetting, loadSiteMeta, saveSetting } from '@/lib/idb';
import { deleteSite as deleteSiteFiles, siteBytes, storageUsage } from '@/lib/opfs';
import { indexCatalog, loadCatalog } from '@/lib/catalog';
import { ingestEntries, type IngestEntry } from '@/lib/ingest';
import { clearQueryCaches, getPixelGeometry, getSiteFacts, getSiteMeta } from '@/engine/queries';
import { unregisterSite } from '@/engine/duckdb';
import { releaseSite } from '@/engine/netcdf';
import { DEFAULT_PIXEL_SAMPLE, DEFAULT_SELECTION_CAP } from '@/engine/sql';
import { CancelledError } from '@/lib/rpc';
import type { BasemapId } from '@/lib/basemaps';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
  /** Milliseconds; 0 keeps it until dismissed. */
  ttl: number;
}

export interface SiteState {
  manifest: SiteManifest;
  meta: SiteMeta;
  facts: SiteFacts | null;
  geometry: PixelGeometry | null;
  bytesOnDisk: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  /** Non-fatal problems: missing files, unresolvable CRS, etc. */
  notes: string[];
}

export interface TimeseriesSettings {
  year: number | null;
  series: string[];
  maxPixels: number;
  dateRange: [string, string] | null;
  useSelection: boolean;
  mode3d: boolean;
}

export interface PhenometricSettings {
  layer: string | null;
  panels: Array<{ siteId: string; year: number }>;
  maxCells: number;
  mode3d: boolean;
  basemap: boolean;
  syncScale: boolean;
}

interface AppState {
  /* chrome */
  booted: boolean;
  theme: ThemeMode;
  view: ViewId;
  railCollapsed: boolean;
  inspectorCollapsed: boolean;
  paletteOpen: boolean;
  onboardingDone: boolean;
  /** Lets the catalog be browsed before anything is uploaded. */
  heroDismissed: boolean;
  online: boolean;
  basemap: BasemapId | 'auto';
  storage: { usage: number; quota: number; persisted: boolean };

  /* data */
  sites: Record<string, SiteState>;
  siteOrder: string[];
  activeSiteId: string | null;
  catalog: CatalogSite[];
  catalogIndex: Map<string, CatalogSite>;
  catalogSource: 'bundled' | 'user' | 'none';
  /** Catalog row the Overview map is focused on, loaded or not. */
  catalogFocusId: string | null;

  /* interaction */
  selection: number[];
  selectionCap: number;
  selectionClipped: boolean;
  focusedPixel: number | null;
  plottedPixels: number[];

  timeseries: TimeseriesSettings;
  phenometrics: PhenometricSettings;

  /* transient */
  ingest: { active: boolean; progress: ProgressEvent | null; controller: AbortController | null };
  toasts: Toast[];

  /* actions */
  boot(): Promise<void>;
  setTheme(t: ThemeMode): void;
  setView(v: ViewId): void;
  toggleRail(): void;
  toggleInspector(): void;
  setPaletteOpen(open: boolean): void;
  dismissOnboarding(): void;
  setHeroDismissed(v: boolean): void;
  setBasemap(b: BasemapId | 'auto'): void;

  toast(t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }): number;
  dismissToast(id: number): void;

  importEntries(entries: IngestEntry[], folderHint?: string): Promise<void>;
  cancelImport(): void;
  selectSite(siteId: string): Promise<void>;
  loadSite(siteId: string): Promise<void>;
  removeSite(siteId: string): Promise<void>;
  refreshStorage(): Promise<void>;
  setCatalog(sites: CatalogSite[], source: 'bundled' | 'user' | 'none'): void;
  setCatalogFocus(siteId: string | null): void;

  setSelection(ids: number[] | Int32Array, opts?: { clipped?: boolean; announce?: boolean }): void;
  togglePixel(id: number): void;
  clearSelection(): void;
  setSelectionCap(cap: number): void;
  setFocusedPixel(id: number | null): void;
  setPlottedPixels(ids: number[] | Int32Array): void;

  updateTimeseries(patch: Partial<TimeseriesSettings>): void;
  updatePhenometrics(patch: Partial<PhenometricSettings>): void;
}

let toastId = 0;

const defaultTimeseries: TimeseriesSettings = {
  year: null,
  series: ['spline'],
  maxPixels: DEFAULT_PIXEL_SAMPLE,
  dateRange: null,
  useSelection: false,
  mode3d: false,
};

const defaultPhenometrics: PhenometricSettings = {
  layer: null,
  panels: [],
  maxCells: 50_000,
  mode3d: false,
  basemap: false,
  syncScale: true,
};

export const useAppStore = create<AppState>((set, get) => ({
  booted: false,
  theme: 'light',
  view: 'overview',
  railCollapsed: false,
  inspectorCollapsed: false,
  paletteOpen: false,
  onboardingDone: false,
  heroDismissed: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  basemap: 'auto',
  storage: { usage: 0, quota: 0, persisted: false },

  sites: {},
  siteOrder: [],
  activeSiteId: null,
  catalog: [],
  catalogIndex: new Map(),
  catalogSource: 'none',
  catalogFocusId: null,

  selection: [],
  selectionCap: DEFAULT_SELECTION_CAP,
  selectionClipped: false,
  focusedPixel: null,
  plottedPixels: [],

  timeseries: defaultTimeseries,
  phenometrics: defaultPhenometrics,

  ingest: { active: false, progress: null, controller: null },
  toasts: [],

  async boot() {
    if (get().booted) return;

    const [theme, onboardingDone, rail, basemap] = await Promise.all([
      loadSetting<ThemeMode>('theme'),
      loadSetting<boolean>('onboarding.done'),
      loadSetting<boolean>('rail.collapsed'),
      loadSetting<BasemapId | 'auto'>('basemap'),
    ]);
    applyTheme(theme ?? 'light');

    const [manifests, catalog] = await Promise.all([loadAllManifests(), loadCatalog()]);

    const sites: Record<string, SiteState> = {};
    for (const manifest of manifests) {
      sites[manifest.siteId] = {
        manifest,
        meta: (await loadSiteMeta(manifest.siteId)) ?? {},
        facts: null,
        geometry: null,
        bytesOnDisk: manifest.totalBytes,
        status: 'idle',
        notes: manifest.warnings,
      };
    }

    set({
      booted: true,
      theme: theme ?? 'light',
      onboardingDone: onboardingDone ?? false,
      railCollapsed: rail ?? false,
      basemap: basemap ?? 'auto',
      sites,
      siteOrder: manifests.map((m) => m.siteId),
      catalog: catalog.sites,
      catalogIndex: indexCatalog(catalog.sites),
      catalogSource: catalog.source,
    });

    void get().refreshStorage();

    const first = manifests[0]?.siteId ?? null;
    if (first) void get().selectSite(first);
  },

  setTheme(t) {
    applyTheme(t);
    set({ theme: t });
    void saveSetting('theme', t);
  },

  setView(v) {
    set({ view: v });
  },

  toggleRail() {
    const next = !get().railCollapsed;
    set({ railCollapsed: next });
    void saveSetting('rail.collapsed', next);
  },

  toggleInspector() {
    set({ inspectorCollapsed: !get().inspectorCollapsed });
  },

  setPaletteOpen(open) {
    set({ paletteOpen: open });
  },

  dismissOnboarding() {
    set({ onboardingDone: true });
    void saveSetting('onboarding.done', true);
  },

  setHeroDismissed(v) {
    set({ heroDismissed: v });
  },

  setBasemap(b) {
    set({ basemap: b });
    void saveSetting('basemap', b);
  },

  toast(t) {
    const id = ++toastId;
    const ttl = t.ttl ?? (t.kind === 'error' ? 0 : 6000);
    set((s) => ({ toasts: [...s.toasts, { ...t, id, ttl }] }));
    if (ttl > 0) {
      window.setTimeout(() => get().dismissToast(id), ttl);
    }
    return id;
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  async importEntries(entries, folderHint) {
    if (entries.length === 0) return;
    const controller = new AbortController();
    set({ ingest: { active: true, progress: null, controller } });
    try {
      const { manifest, meta } = await ingestEntries(entries, {
        folderHint,
        signal: controller.signal,
        onProgress: (p) =>
          set((s) => ({ ingest: { ...s.ingest, progress: p } })),
      });

      set((s) => ({
        sites: {
          ...s.sites,
          [manifest.siteId]: {
            manifest,
            meta,
            facts: null,
            geometry: null,
            bytesOnDisk: manifest.totalBytes,
            status: 'idle',
            notes: manifest.warnings,
          },
        },
        siteOrder: s.siteOrder.includes(manifest.siteId)
          ? s.siteOrder
          : [...s.siteOrder, manifest.siteId],
      }));

      const fileCount =
        (manifest.geom?.parts.length ?? 0) +
        (manifest.meta?.parts.length ?? 0) +
        (manifest.timeseries?.parts.length ?? 0) +
        manifest.netcdf.length;
      get().toast({
        kind: manifest.warnings.length ? 'warning' : 'success',
        title: `${manifest.siteId} imported`,
        detail: manifest.warnings.length
          ? manifest.warnings[0]
          : `${fileCount} files ready — ${manifest.netcdf.length} NetCDF year${
              manifest.netcdf.length === 1 ? '' : 's'
            }.`,
      });

      await get().selectSite(manifest.siteId);
      void get().refreshStorage();
    } catch (err) {
      if (!(err instanceof CancelledError)) {
        get().toast({
          kind: 'error',
          title: 'Import failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      set({ ingest: { active: false, progress: null, controller: null } });
    }
  },

  cancelImport() {
    get().ingest.controller?.abort();
    set({ ingest: { active: false, progress: null, controller: null } });
  },

  async selectSite(siteId) {
    const site = get().sites[siteId];
    if (!site) return;
    const facts = site.status === 'ready' ? site.facts : null;
    const latest = site.manifest.netcdf[site.manifest.netcdf.length - 1];
    set({
      activeSiteId: siteId,
      catalogFocusId: siteId,
      selection: [],
      selectionClipped: false,
      focusedPixel: null,
      plottedPixels: [],
      timeseries: {
        ...get().timeseries,
        year: facts?.years[facts.years.length - 1] ?? null,
        series: facts ? (facts.series.includes('spline') ? ['spline'] : facts.series.slice(0, 1)) : ['spline'],
        dateRange: null,
        useSelection: false,
      },
      phenometrics: {
        ...get().phenometrics,
        panels: facts && latest ? [{ siteId, year: latest.year }] : [],
        layer: null,
      },
    });
    await get().loadSite(siteId);
  },

  async loadSite(siteId) {
    const state = get().sites[siteId];
    if (!state || state.status === 'loading' || state.status === 'ready') return;

    const patch = (p: Partial<SiteState>) =>
      set((s) =>
        s.sites[siteId] ? { sites: { ...s.sites, [siteId]: { ...s.sites[siteId], ...p } } } : {},
      );

    patch({ status: 'loading', error: undefined });
    const notes: string[] = [...state.manifest.warnings];

    try {
      const meta = Object.keys(state.meta).length
        ? state.meta
        : await getSiteMeta(state.manifest).catch(() => ({}) as SiteMeta);

      const facts = await getSiteFacts(state.manifest);

      let geometry: PixelGeometry | null = null;
      if (state.manifest.geom) {
        try {
          geometry = await getPixelGeometry(state.manifest, meta);
        } catch (err) {
          notes.push(err instanceof Error ? err.message : String(err));
        }
      }

      const bytesOnDisk = await siteBytes(siteId).catch(() => state.manifest.totalBytes);

      patch({ meta, facts, geometry, bytesOnDisk, status: 'ready', notes });

      // A load finishing in the background must not change another site's filters.
      if (get().activeSiteId !== siteId) return;

      // Defaults that make the first chart appear untouched: newest year with
      // data, `spline` if present, otherwise whatever the file has.
      const ts = get().timeseries;
      const year = ts.year ?? facts.years[facts.years.length - 1] ?? null;
      const series = facts.series.includes('spline')
        ? ['spline']
        : facts.series.slice(0, 1);
      set({
        timeseries: { ...ts, year, series: series.length ? series : ts.series },
      });

      const ph = get().phenometrics;
      if (ph.panels.length === 0 && state.manifest.netcdf.length > 0) {
        const latest = state.manifest.netcdf[state.manifest.netcdf.length - 1];
        set({ phenometrics: { ...ph, panels: [{ siteId, year: latest.year }] } });
      }
    } catch (err) {
      patch({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        notes,
      });
    }
  },

  async removeSite(siteId) {
    const state = get().sites[siteId];
    if (!state) return;
    try {
      await unregisterSite(state.manifest);
      await releaseSite(siteId);
      clearQueryCaches(siteId);
      await deleteSiteFiles(siteId);
      await deleteManifest(siteId);
    } catch (err) {
      get().toast({
        kind: 'error',
        title: `Could not remove ${siteId}`,
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    set((s) => {
      const sites = { ...s.sites };
      delete sites[siteId];
      const siteOrder = s.siteOrder.filter((id) => id !== siteId);
      return {
        sites,
        siteOrder,
        activeSiteId: s.activeSiteId === siteId ? (siteOrder[0] ?? null) : s.activeSiteId,
        phenometrics: {
          ...s.phenometrics,
          panels: s.phenometrics.panels.filter((p) => p.siteId !== siteId),
        },
      };
    });
    get().toast({ kind: 'info', title: `${siteId} removed`, detail: 'Its files were deleted from offline storage.' });
    void get().refreshStorage();
    const next = get().activeSiteId;
    if (next) void get().loadSite(next);
  },

  async refreshStorage() {
    try {
      set({ storage: await storageUsage() });
    } catch {
      /* estimate is unavailable in some browsers */
    }
  },

  setCatalog(sites, source) {
    set({ catalog: sites, catalogIndex: indexCatalog(sites), catalogSource: source });
  },

  setCatalogFocus(siteId) {
    set({ catalogFocusId: siteId });
  },

  setSelection(ids, opts = {}) {
    const arr = Array.from(ids);
    const cap = get().selectionCap;
    const clipped = opts.clipped ?? arr.length > cap;
    const kept = arr.slice(0, cap);
    set({ selection: kept, selectionClipped: clipped });
    if (clipped && opts.announce !== false) {
      get().toast({
        kind: 'warning',
        title: `Selection capped at ${cap} pixels`,
        detail: `${arr.length.toLocaleString('en-US')} pixels fell inside the shape. Raise the cap in the inspector if you need more.`,
      });
    }
  },

  togglePixel(id) {
    const current = get().selection;
    const idx = current.indexOf(id);
    if (idx >= 0) {
      set({ selection: current.filter((p) => p !== id), selectionClipped: false });
      return;
    }
    if (current.length >= get().selectionCap) {
      get().toast({
        kind: 'warning',
        title: 'Selection is full',
        detail: `The cap is ${get().selectionCap} pixels. Clear some, or raise the cap in the inspector.`,
      });
      return;
    }
    set({ selection: [...current, id] });
  },

  clearSelection() {
    set({ selection: [], selectionClipped: false, focusedPixel: null });
  },

  setSelectionCap(cap) {
    const next = Math.max(1, Math.min(5000, Math.round(cap)));
    set((s) => ({ selectionCap: next, selection: s.selection.slice(0, next) }));
  },

  setFocusedPixel(id) {
    set({ focusedPixel: id });
  },

  setPlottedPixels(ids) {
    set({ plottedPixels: Array.from(ids) });
  },

  updateTimeseries(patch) {
    set((s) => ({ timeseries: { ...s.timeseries, ...patch } }));
  },

  updatePhenometrics(patch) {
    set((s) => ({ phenometrics: { ...s.phenometrics, ...patch } }));
  },
}));

/* ------------------------------------------------------------------ theme */

export function applyTheme(mode: ThemeMode): void {
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('wetlsp.theme', mode === 'system' ? 'system' : mode);
  } catch {
    /* private mode */
  }
}

/** Keep `system` mode following the OS while the app is open. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (useAppStore.getState().theme === 'system') applyTheme('system');
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

export function watchOnline(): () => void {
  const update = () => useAppStore.setState({ online: navigator.onLine });
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}

/* --------------------------------------------------------------- helpers */

export function activeSite(): SiteState | null {
  const s = useAppStore.getState();
  return s.activeSiteId ? (s.sites[s.activeSiteId] ?? null) : null;
}

export function useActiveSite(): SiteState | null {
  return useAppStore((s) => (s.activeSiteId ? (s.sites[s.activeSiteId] ?? null) : null));
}
