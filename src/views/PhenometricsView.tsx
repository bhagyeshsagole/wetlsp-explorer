/**
 * Phenometrics: the NetCDF layer browser and the raster visualiser.
 *
 * One to four site-years render side by side on a shared colour scale, in three
 * modes — plain figure, georeferenced on a basemap, and 3D relief.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BitmapLayer } from '@deck.gl/layers';
import { Download, Layers, Maximize2, Plus, X } from 'lucide-react';
import { MapCanvas, type MapCanvasHandle } from '@/components/MapCanvas';
import {
  IDENTITY_VIEW, RasterFigure, type FigureView, type Probe, type RasterFigureHandle,
} from '@/components/RasterFigure';
import { Raster3D, type Raster3DHandle } from '@/components/Raster3D';
import { Button, Card, Chip, EmptyState, Field, Segmented, Slider, Toggle } from '@/components/ui';
import { useActiveSite, useAppStore } from '@/store/useAppStore';
import { ErrorPanel, LoadingPanel, useAsyncData, useBasemap, useDark } from './shared';
import { DEFAULT_CELL_BUDGET, getNetcdfInfo, intersectLayers, readRaster } from '@/engine/netcdf';
import { makeColorScale, rampToCssGradient, type ColorScale } from '@/lib/colorscales';
import { rasterDomain, rasterToCanvas } from '@/lib/raster';
import { LAYER_ORDER, isTimingLayer, layerInfo, phenometricScaleType } from '@/lib/layers';
import { doyToDateLabel, formatCount, formatValue } from '@/lib/format';
import { downloadCanvasPng, exportBackground, timestampedName } from '@/lib/export';
import type { NetcdfInfo, RasterSlice } from '@/lib/types';

type Mode = 'figure' | 'map' | 'relief';

interface PanelData {
  siteId: string;
  year: number;
  info: NetcdfInfo;
  slice: RasterSlice | null;
  error?: string;
}

export function PhenometricsView() {
  const site = useActiveSite();
  const sites = useAppStore((s) => s.sites);
  const ph = useAppStore((s) => s.phenometrics);
  const update = useAppStore((s) => s.updatePhenometrics);
  const dark = useDark();
  const basemap = useBasemap();
  const [mode, setMode] = useState<Mode>('figure');
  const [view, setView] = useState<FigureView>(IDENTITY_VIEW);
  const [probe, setProbe] = useState<(Probe & { panel: number }) | null>(null);
  const figureRefs = useRef<Array<RasterFigureHandle | null>>([]);
  const reliefRef = useRef<Raster3DHandle | null>(null);
  const mapRefs = useRef<Array<MapCanvasHandle | null>>([]);

  const panels = ph.panels;
  const panelKey = panels.map((p) => `${p.siteId}:${p.year}`).join('|');

  const infos = useAsyncData<NetcdfInfo[]>(
    async ({ signal, onProgress }) =>
      Promise.all(
        panels.map((p) => {
          const manifest = sites[p.siteId]?.manifest;
          if (!manifest) throw new Error(`${p.siteId} is no longer loaded.`);
          return getNetcdfInfo(manifest, p.year, { signal, onProgress });
        }),
      ),
    [panelKey],
    { enabled: panels.length > 0 },
  );

  const sharedLayers = useMemo(() => {
    if (!infos.data || infos.data.length === 0) return [];
    const shared = intersectLayers(infos.data);
    const known = LAYER_ORDER.filter((l) => shared.includes(l));
    const extra = shared.filter((l) => !LAYER_ORDER.includes(l)).sort();
    return [...known, ...extra];
  }, [infos.data]);

  // Land on a sensible layer the moment a file opens, so the view is never blank.
  useEffect(() => {
    if (sharedLayers.length === 0) return;
    if (ph.layer && sharedLayers.includes(ph.layer)) return;
    update({ layer: sharedLayers.includes('OGI') ? 'OGI' : sharedLayers[0] });
  }, [sharedLayers, ph.layer, update]);

  const layer = ph.layer && sharedLayers.includes(ph.layer) ? ph.layer : null;

  const rasters = useAsyncData<PanelData[]>(
    async ({ signal, onProgress }) => {
      if (!layer || !infos.data) return [];
      return Promise.all(
        panels.map(async (p, i) => {
          const manifest = sites[p.siteId]?.manifest;
          if (!manifest) throw new Error(`${p.siteId} is no longer loaded.`);
          try {
            const slice = await readRaster(manifest, p.year, layer, ph.maxCells, {
              signal,
              onProgress,
            });
            return { siteId: p.siteId, year: p.year, info: infos.data![i], slice };
          } catch (err) {
            return {
              siteId: p.siteId,
              year: p.year,
              info: infos.data![i],
              slice: null,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );
    },
    [panelKey, layer, ph.maxCells, infos.data],
    { enabled: Boolean(layer) && Boolean(infos.data), keepPrevious: true },
  );

  const domains = useMemo(() => {
    const slices = (rasters.data ?? []).map((p) => p.slice).filter((s): s is RasterSlice => !!s);
    if (slices.length === 0) return null;
    const shared = rasterDomain(slices);
    return { shared, per: slices.map((s) => rasterDomain([s])) };
  }, [rasters.data]);

  // keepPrevious can show the preceding layer while a new request is running.
  // Palette, legend, tooltip and export names must describe that same data.
  const displayedLayer = rasters.data?.find((p) => p.slice)?.slice?.layer ?? layer;

  const scales = useMemo(() => {
    if (!layer || !domains || !rasters.data) return null;
    let k = 0;
    return rasters.data.map((p) =>
      p.slice
        ? makeColorScale(p.slice.layer, ph.syncScale ? domains.shared : domains.per[k++])
        : makeColorScale(layer, [0, 1]),
    );
  }, [layer, domains, rasters.data, ph.syncScale]);

  const exportPng = async () => {
    const name = timestampedName(
      ['wetlsp', displayedLayer ?? 'layer', ...(rasters.data ?? []).map((p) => `${p.siteId}-${p.year}`)],
      'png',
    );
    try {
      if (mode === 'relief') {
        const canvas = reliefRef.current?.canvas();
        if (!canvas) throw new Error('The 3D view is not ready yet.');
        await downloadCanvasPng(flatten([canvas], 1), name);
        return;
      }
      const canvases = (mode === 'map' ? mapRefs.current : figureRefs.current)
        .map((r) => r?.canvas() ?? null)
        .filter((c): c is HTMLCanvasElement => Boolean(c));
      if (mode === 'map') mapRefs.current.forEach((r) => r?.repaint());
      if (canvases.length === 0) throw new Error('There is nothing on screen to export yet.');
      await downloadCanvasPng(flatten(canvases, Math.min(2, canvases.length)), name);
    } catch (err) {
      useAppStore.getState().toast({
        kind: 'error',
        title: 'PNG export failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (!site) {
    return (
      <div className="card h-full">
        <EmptyState icon={<Layers size={26} />} title="No site open" body="Import a dataset first." />
      </div>
    );
  }

  if (panels.length === 0) {
    return (
      <div className="card h-full">
        <EmptyState
          icon={<Layers size={26} />}
          title="Pick a site-year to render"
          body={
            site.manifest.netcdf.length === 0
              ? 'This site has no WetLSP NetCDF files, so there are no phenometrics to show.'
              : 'Choose one to four site-years in the inspector, then pick a layer.'
          }
          action={
            site.manifest.netcdf.length > 0 ? (
              <Button
                variant="primary"
                icon={<Plus size={14} />}
                onClick={() =>
                  update({
                    panels: [
                      {
                        siteId: site.manifest.siteId,
                        year: site.manifest.netcdf[site.manifest.netcdf.length - 1].year,
                      },
                    ],
                  })
                }
              >
                Add {site.manifest.netcdf[site.manifest.netcdf.length - 1].year}
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  const renderedPanels = mode === 'relief'
    ? (rasters.data?.[0]?.slice ? 1 : 0)
    : (rasters.data ?? []).filter((p) => p.slice).length;
  const cols = (rasters.data?.length ?? 0) <= 1 ? 1 : 2;
  const rows = (rasters.data?.length ?? 0) <= 2 ? 1 : 2;

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'figure', label: 'Figure', title: 'Equal-aspect axes in projected metres' },
              { value: 'map', label: 'Map', title: 'Georeferenced over a basemap' },
              { value: 'relief', label: '3D relief', title: 'Extruded surface with orbit controls' },
            ]}
          />
          {displayedLayer && (
            <Chip tone="accent" title={layerInfo(displayedLayer).description}>
              {displayedLayer}
            </Chip>
          )}
          {rasters.data?.[0]?.slice && rasters.data[0].slice.downsample > 1 && (
            <Chip title={`Mean-pooled ${rasters.data[0].slice.downsample}× to stay inside the cell budget`}>
              {rasters.data[0].slice.downsample}× pooled
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span role="status" className="text-[11px] text-[var(--text-muted)]">
            {infos.loading || rasters.loading
              ? `Loading ${panels.length} ${panels.length === 1 ? 'panel' : 'panels'}…`
              : `${renderedPanels} ${renderedPanels === 1 ? 'panel' : 'panels'} rendered`}
          </span>
          {mode === 'figure' && (
            <Button size="sm" icon={<Maximize2 size={13} />} onClick={() => setView(IDENTITY_VIEW)}>
              Reset zoom
            </Button>
          )}
          <Button size="sm" icon={<Download size={13} />} onClick={exportPng}>
            PNG
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {/*
          Each branch keys off `loading` before `data`: a run that resolved with
          nothing must not be indistinguishable from one still in flight, or the
          view spins forever.
        */}
        {infos.error ? (
          <ErrorPanel message={infos.error} onRetry={infos.reload} />
        ) : infos.loading ? (
          <LoadingPanel progress={infos.progress} label="Opening NetCDF" onCancel={infos.cancel} />
        ) : !infos.data ? (
          <EmptyState
            icon={<Layers size={24} />}
            title="Those files could not be opened"
            body="Nothing came back for the selected site-years."
            action={
              <Button variant="primary" onClick={infos.reload}>
                Try again
              </Button>
            }
          />
        ) : !layer ? (
          <EmptyState
            icon={<Layers size={24} />}
            title="No layer shared by these files"
            body="The selected site-years have no variable in common. Remove one, or pick different years."
          />
        ) : rasters.error ? (
          <ErrorPanel message={rasters.error} onRetry={rasters.reload} />
        ) : rasters.loading && !rasters.data ? (
          <LoadingPanel
            progress={rasters.progress}
            label={`Reading ${layer}`}
            onCancel={rasters.cancel}
          />
        ) : !rasters.data ? (
          <EmptyState
            icon={<Layers size={24} />}
            title={`"${layer}" could not be read`}
            body="Pick another layer, or raise the cell budget and try again."
            action={
              <Button variant="primary" onClick={rasters.reload}>
                Try again
              </Button>
            }
          />
        ) : mode === 'relief' ? (
          rasters.data[0]?.slice && scales ? (
            <Raster3D
              ref={reliefRef}
              slice={rasters.data[0].slice}
              scale={scales[0]}
              getTooltip={(cell) =>
                tooltipHtml(rasters.data![0].slice!.layer, rasters.data![0].year, cell.value, cell.col, cell.row)
              }
            />
          ) : (
            <ErrorPanel message={rasters.data[0]?.error ?? 'That layer could not be read.'} />
          )
        ) : (
          <div
            className="grid h-full w-full gap-2 p-2"
            data-testid="comparison-grid"
            data-rendered-panels={renderedPanels}
            aria-busy={rasters.loading}
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {rasters.data.map((panel, i) => (
              <Panel
                key={`${panel.siteId}-${panel.year}`}
                panel={panel}
                index={i}
                mode={mode}
                layer={panel.slice?.layer ?? layer}
                scale={scales?.[i] ?? null}
                dark={dark}
                basemap={basemap}
                view={view}
                onView={setView}
                onProbe={(p) => setProbe(p ? { ...p, panel: i } : null)}
                figureRef={(r) => (figureRefs.current[i] = r)}
                mapRef={(r) => (mapRefs.current[i] = r)}
                onRemove={
                  panels.length > 1
                    ? () => update({ panels: panels.filter((p) => p.siteId !== panel.siteId || p.year !== panel.year) })
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {!infos.loading && !infos.error && displayedLayer && scales?.[0] && (
        <LegendBar
          layer={displayedLayer}
          scale={scales[0]}
          probe={probe}
          panelYear={probe ? (rasters.data?.[probe.panel]?.year ?? null) : null}
          synced={ph.syncScale && renderedPanels > 1}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- panel */

function Panel({
  panel, index, mode, layer, scale, dark, basemap, view, onView, onProbe, figureRef, mapRef, onRemove,
}: {
  panel: PanelData;
  index: number;
  mode: Mode;
  layer: string;
  scale: ColorScale | null;
  dark: boolean;
  basemap: ReturnType<typeof useBasemap>;
  view: FigureView;
  onView: (v: FigureView) => void;
  onProbe: (p: Probe | null) => void;
  figureRef: (r: RasterFigureHandle | null) => void;
  mapRef: (r: MapCanvasHandle | null) => void;
  onRemove?: () => void;
}) {
  const image = useMemo(
    () => (panel.slice && scale ? rasterToCanvas(panel.slice, scale) : null),
    [panel.slice, scale],
  );

  return (
    <div className="relative min-h-0 overflow-hidden rounded-[11px] border border-[var(--border)] bg-[var(--bg-sunken)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2">
        <span className="chip pointer-events-auto bg-[var(--bg-elevated)] font-medium text-[var(--text)]">
          {panel.siteId} — {panel.year}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label={`Remove ${panel.siteId} ${panel.year}`}
            className="pointer-events-auto grid h-6 w-6 place-items-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-faint)] hover:text-[var(--text)]"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {!panel.slice || !scale ? (
        <ErrorPanel message={panel.error ?? `"${layer}" is not in this file.`} />
      ) : mode === 'map' ? (
        panel.slice.bboxWgs84 ? (
          <MapCanvas
            ref={mapRef}
            basemap={basemap}
            dark={dark}
            initialBounds={panel.slice.bboxWgs84}
            layers={
              image
                ? [
                    new BitmapLayer({
                      id: `raster-${index}`,
                      image,
                      bounds: panel.slice.bboxWgs84,
                      opacity: 0.92,
                      textureParameters: {
                        minFilter: 'nearest',
                        magFilter: 'nearest',
                      },
                    }),
                  ]
                : []
            }
            className="h-full w-full"
          />
        ) : (
          <ErrorPanel message="This file carries no georeferencing, so it cannot be placed on a basemap. The Figure mode still works." />
        )
      ) : (
        <RasterFigure
          ref={figureRef}
          slice={panel.slice}
          scale={scale}
          view={view}
          onView={onView}
          onProbe={onProbe}
          dark={dark}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- legend */

function LegendBar({
  layer, scale, probe, panelYear, synced,
}: {
  layer: string;
  scale: ColorScale;
  probe: (Probe & { panel: number }) | null;
  panelYear: number | null;
  synced: boolean;
}) {
  const info = layerInfo(layer);
  const ticks = scale.ticks(scale.discrete ? 4 : 5);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] px-4 py-2.5">
      <div className="min-w-[220px] flex-1">
        <div
          className="h-2.5 w-full rounded-full border border-[var(--border)]"
          style={{ background: rampToCssGradient(scale.stops, scale.discrete) }}
        />
        <div className="mt-1 flex justify-between text-[10.5px] tabular-nums text-[var(--text-muted)]">
          {ticks.map((t, i) => (
            <span key={i}>{scale.discrete ? `class ${t}` : formatValue(t, 3)}</span>
          ))}
        </div>
      </div>

      <div className="text-[11.5px] leading-tight text-[var(--text-muted)]">
        <div className="font-medium text-[var(--text)]">{layer}</div>
        <div>
          {info.units || 'unitless'}
          {Number.isFinite(info.validMin) &&
            ` · valid ${formatCount(info.validMin)}–${formatCount(info.validMax)}`}
          {synced && ' · scale shared across panels'}
        </div>
      </div>

      <div className="ml-auto min-w-[170px] text-right text-[11.5px] tabular-nums">
        {probe && Number.isFinite(probe.value) ? (
          <>
            <div className="font-semibold text-[var(--text)]">
              {formatValue(probe.value, 4)} {info.units && info.units !== 'unitless' ? info.units : ''}
            </div>
            <div className="text-[var(--text-muted)]">
              {isTimingLayer(layer) && panelYear !== null
                ? `${doyToDateLabel(probe.value, panelYear)} · `
                : ''}
              cell {probe.col}, {probe.row}
              {probe.projected
                ? ` · ${Math.round(probe.projected[0]).toLocaleString('en-US')}, ${Math.round(
                    probe.projected[1],
                  ).toLocaleString('en-US')} m`
                : ''}
            </div>
          </>
        ) : (
          <span className="text-[var(--text-faint)]">
            {probe ? 'no data here' : 'hover the raster to probe values'}
          </span>
        )}
      </div>
    </div>
  );
}

function tooltipHtml(layer: string, year: number, value: number, col: number, row: number): string {
  const info = layerInfo(layer);
  const lines = [
    `<b>${formatValue(value, 4)}</b> ${info.units && info.units !== 'unitless' ? info.units : ''}`,
  ];
  if (isTimingLayer(layer)) lines.push(doyToDateLabel(value, year));
  lines.push(`<span style="opacity:.7">cell ${col}, ${row}</span>`);
  return lines.join('<br/>');
}

/** Tile panel canvases into one image for export. */
function flatten(canvases: HTMLCanvasElement[], cols: number): HTMLCanvasElement {
  const rows = Math.ceil(canvases.length / cols);
  const w = Math.max(...canvases.map((c) => c.width));
  const h = Math.max(...canvases.map((c) => c.height));
  const out = document.createElement('canvas');
  out.width = w * cols;
  out.height = h * rows;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = exportBackground();
  ctx.fillRect(0, 0, out.width, out.height);
  canvases.forEach((c, i) => {
    ctx.drawImage(c, (i % cols) * w, Math.floor(i / cols) * h, w, h);
  });
  return out;
}

/* ------------------------------------------------------------- inspector */

export function PhenometricsInspector() {
  const site = useActiveSite();
  const sites = useAppStore((s) => s.sites);
  const order = useAppStore((s) => s.siteOrder);
  const ph = useAppStore((s) => s.phenometrics);
  const update = useAppStore((s) => s.updatePhenometrics);
  const [budgetDraft, setBudgetDraft] = useState<number | null>(null);

  const infos = useAsyncData<NetcdfInfo[]>(
    async ({ signal }) =>
      Promise.all(
        ph.panels.map((p) => {
          const manifest = sites[p.siteId]?.manifest;
          if (!manifest) throw new Error(`${p.siteId} is not loaded.`);
          return getNetcdfInfo(manifest, p.year, { signal });
        }),
      ),
    [ph.panels.map((p) => `${p.siteId}:${p.year}`).join('|')],
    { enabled: ph.panels.length > 0 },
  );

  const available = useMemo(() => {
    if (!infos.data || infos.data.length === 0) return [];
    const shared = intersectLayers(infos.data);
    const known = LAYER_ORDER.filter((l) => shared.includes(l));
    return [...known, ...shared.filter((l) => !LAYER_ORDER.includes(l)).sort()];
  }, [infos.data]);

  const varByName = useMemo(() => {
    const m = new Map<string, { units: string; longName: string }>();
    for (const v of infos.data?.[0]?.variables ?? []) {
      m.set(v.name, { units: v.units, longName: v.longName });
    }
    return m;
  }, [infos.data]);

  if (!site) return <EmptyState compact title="No site loaded" />;

  const budget = budgetDraft ?? ph.maxCells;
  const togglePanel = (siteId: string, year: number) => {
    const exists = ph.panels.some((p) => p.siteId === siteId && p.year === year);
    if (exists) {
      update({ panels: ph.panels.filter((p) => !(p.siteId === siteId && p.year === year)) });
      return;
    }
    if (ph.panels.length >= 4) {
      useAppStore.getState().toast({
        kind: 'warning',
        title: 'Four panels is the limit',
        detail: 'Remove one before adding another.',
      });
      return;
    }
    update({ panels: [...ph.panels, { siteId, year }] });
  };

  return (
    <div className="space-y-3">
      <Card title="Panels" subtitle="Up to four site-years, compared side by side">
        <div className="space-y-2.5">
          {order.map((siteId) => {
            const netcdf = sites[siteId]?.manifest.netcdf ?? [];
            if (netcdf.length === 0) return null;
            return (
              <div key={siteId}>
                <div className="mb-1 text-[11.5px] font-medium text-[var(--text-muted)]">
                  {siteId}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {netcdf.map((n) => {
                    const on = ph.panels.some((p) => p.siteId === siteId && p.year === n.year);
                    return (
                      <button
                        key={n.year}
                        onClick={() => togglePanel(siteId, n.year)}
                        className={
                          on
                            ? 'chip border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]'
                            : 'chip hover:bg-[var(--bg-hover)]'
                        }
                      >
                        {n.year}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="Layers"
        subtitle={
          available.length
            ? `${available.length} shared by the selected files`
            : 'Open a site-year to list its layers'
        }
      >
        {infos.loading && <div className="skeleton h-24 w-full" />}
        {!infos.loading && available.length === 0 && (
          <p className="text-[12.5px] text-[var(--text-muted)]">
            No variables in common. Try a single panel first.
          </p>
        )}
        <ul className="-mx-1 max-h-[340px] space-y-0.5 overflow-y-auto">
          {available.map((name) => {
            const info = layerInfo(name);
            const attrs = varByName.get(name);
            const active = ph.layer === name;
            return (
              <li key={name}>
                <button
                  onClick={() => update({ layer: name })}
                  className={
                    active
                      ? 'flex w-full items-start gap-2 rounded-[9px] bg-[var(--bg-hover)] px-2 py-1.5 text-left'
                      : 'flex w-full items-start gap-2 rounded-[9px] px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]'
                  }
                >
                  <span
                    className="mt-[3px] h-3 w-3 shrink-0 rounded-[3px] border border-[var(--border)]"
                    style={{ background: familySwatch(name) }}
                    title={`${phenometricScaleType(name)} scale`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px] font-medium">{name}</span>
                      <span className="shrink-0 text-[10.5px] text-[var(--text-faint)]">
                        {attrs?.units || info.units}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
                      {attrs?.longName || info.description}
                    </span>
                    {Number.isFinite(info.validMin) && (
                      <span className="mt-0.5 block text-[10.5px] tabular-nums text-[var(--text-faint)]">
                        valid {formatCount(info.validMin)} – {formatCount(info.validMax)}
                        {info.scale !== 1 && ` · scale ${info.scale}`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Rendering">
        <div className="space-y-3">
          <Field label="Max cells" hint={formatCount(budget)}>
            <Slider
              min={10_000}
              max={1_200_000}
              step={10_000}
              value={budget}
              onChange={setBudgetDraft}
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-[var(--text-faint)]">
                default {formatCount(DEFAULT_CELL_BUDGET)}
              </span>
              {budgetDraft !== null && budgetDraft !== ph.maxCells && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    update({ maxCells: budgetDraft });
                    setBudgetDraft(null);
                  }}
                >
                  Re-read
                </Button>
              )}
            </div>
          </Field>
          <Toggle
            checked={ph.syncScale}
            onChange={(v) => update({ syncScale: v })}
            label="Share one colour scale"
            hint="Panels become directly comparable"
          />
        </div>
      </Card>
    </div>
  );
}

function familySwatch(layer: string): string {
  switch (phenometricScaleType(layer)) {
    case 'timing':
      return 'linear-gradient(90deg,#2c00ff,#00e5a8,#ffff00,#9e0000)';
    case 'greenness':
      return 'linear-gradient(90deg,#f7fcf5,#74c476,#00441b)';
    case 'qa':
      return 'linear-gradient(90deg,#f7f7f7 25%,#cccccc 25% 50%,#969696 50% 75%,#525252 75%)';
    default:
      return 'linear-gradient(90deg,#440154,#26828e,#6ece58,#fde725)';
  }
}
