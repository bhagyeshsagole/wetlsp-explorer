/**
 * EVI time series: per-pixel "spaghetti", the daily mean, and the interquartile
 * ribbon — the Shiny plot, but WebGL and interactive.
 *
 * The aggregates come back from SQL already reduced to one row per date x
 * series, so the ribbon costs the same whether it summarises 250 pixels or 5000.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { PlotData } from 'plotly.js-dist-min';
import { Boxes, Download, LineChart, RefreshCw, Table } from 'lucide-react';
import { PLOT_CONFIG, PlotlyChart, plotTheme, type PlotlyHandle } from '@/components/PlotlyChart';
import { Button, Card, Chip, EmptyState, Field, Segmented, Slider, Toggle } from '@/components/ui';
import { useAppStore, useActiveSite } from '@/store/useAppStore';
import { ErrorPanel, LoadingPanel, seriesColor, useAsyncData, useDark } from './shared';
import {
  getDailySummary,
  getTimeseries,
  samplePixelIds,
  type TimeseriesBundle,
} from '@/engine/queries';
import { DEFAULT_PIXEL_SAMPLE, MAX_PIXEL_SAMPLE } from '@/engine/sql';
import { downloadCsv, timestampedName } from '@/lib/export';
import { formatCount, isoFromMs } from '@/lib/format';
import type { DailySummaryRow } from '@/lib/types';
import { pixelLines, type PixelLine } from './timeseriesPlot';

interface Loaded {
  bundle: TimeseriesBundle;
  summary: DailySummaryRow[];
  requestedPixels: number;
  availablePixels: number;
  usedSelection: boolean;
}

function useTimeseriesData() {
  const site = useActiveSite();
  const ts = useAppStore((s) => s.timeseries);
  const selection = useAppStore((s) => s.selection);
  const setPlottedPixels = useAppStore((s) => s.setPlottedPixels);

  const manifest = site?.manifest ?? null;
  const year = ts.year;
  const seriesKey = ts.series.join(',');
  const selectionKey = ts.useSelection ? selection.join(',') : '';
  const rangeKey = ts.dateRange ? ts.dateRange.join('..') : '';

  const enabled = Boolean(manifest?.timeseries && year !== null && ts.series.length > 0);

  return useAsyncData<Loaded>(
    async ({ signal, onProgress }) => {
      if (!manifest || year === null) throw new Error('No site selected.');
      const years = [year];

      let pixelIds: Int32Array;
      let available: number;
      if (ts.useSelection) {
        if (selection.length === 0) {
          throw new Error(
            'No pixels are selected. Draw a selection on the Pixel Map, or switch back to a random sample.',
          );
        }
        pixelIds = Int32Array.from(selection);
        available = selection.length;
      } else {
        const sampled = await samplePixelIds(manifest, years, ts.series, ts.maxPixels, {
          signal,
          onProgress,
        });
        pixelIds = sampled.ids;
        available = sampled.available;
      }

      if (pixelIds.length === 0) {
        throw new Error(`No pixels carry ${ts.series.join(' or ')} data for ${year}.`);
      }

      const filters = {
        years,
        series: ts.series,
        pixelIds,
        dateRange: ts.dateRange,
      };

      const [bundle, summary] = await Promise.all([
        getTimeseries(manifest, filters, { signal, onProgress }),
        getDailySummary(manifest, filters, { signal, onProgress }),
      ]);

      setPlottedPixels(pixelIds);
      return {
        bundle,
        summary,
        requestedPixels: pixelIds.length,
        availablePixels: available,
        usedSelection: ts.useSelection,
      };
    },
    [manifest?.siteId, year, seriesKey, ts.maxPixels, selectionKey, rangeKey, ts.useSelection],
    { enabled, keepPrevious: true },
  );
}

export function TimeSeriesView() {
  const site = useActiveSite();
  const ts = useAppStore((s) => s.timeseries);
  const dark = useDark();
  const chartRef = useRef<PlotlyHandle>(null);
  const state = useTimeseriesData();

  const pixelPlot = useMemo(
    () => state.data && !ts.mode3d ? pixelLines(state.data.bundle) : null,
    [state.data, ts.mode3d],
  );

  const traces = useMemo(
    () => (state.data ? buildTraces(state.data, ts.series, dark, ts.mode3d, pixelPlot?.lines ?? []) : []),
    [state.data, ts.series, dark, ts.mode3d, pixelPlot],
  );

  const layout = useMemo(() => {
    const base = plotTheme(dark);
    if (ts.mode3d) {
      return {
        ...base,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        scene: {
          xaxis: { title: { text: 'Date' }, color: dark ? '#98a3b3' : '#666d7a' },
          yaxis: { title: { text: 'Pixel' }, color: dark ? '#98a3b3' : '#666d7a' },
          zaxis: { title: { text: 'EVI' }, color: dark ? '#98a3b3' : '#666d7a' },
          camera: { eye: { x: 1.5, y: -1.6, z: 0.85 } },
          aspectratio: { x: 1.9, y: 1, z: 0.55 },
        },
        showlegend: false,
      };
    }
    return {
      ...base,
      hovermode: 'x unified',
      xaxis: { ...(base.xaxis as object), title: { text: 'Date' }, type: 'date' },
      yaxis: { ...(base.yaxis as object), title: { text: 'EVI' } },
    };
  }, [dark, ts.mode3d]);

  if (!site) {
    return (
      <div className="card h-full">
        <EmptyState
          icon={<LineChart size={26} />}
          title="No site open"
          body="Import a WetLSP site folder to plot its EVI trajectories."
        />
      </div>
    );
  }

  if (!site.manifest.timeseries) {
    return (
      <div className="card h-full">
        <EmptyState
          icon={<LineChart size={26} />}
          title="This site has no time series table"
          body="`pixels_timeseries.parquet` was not part of the import, so there is nothing to plot here. The Phenometrics and Overview views still work."
        />
      </div>
    );
  }

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            value={ts.mode3d ? '3d' : '2d'}
            onChange={(v) => useAppStore.getState().updateTimeseries({ mode3d: v === '3d' })}
            options={[
              { value: '2d', label: 'Chart', title: 'Spaghetti, mean and IQR ribbon' },
              { value: '3d', label: '3D ribbon', title: 'The same data as a surface over date × pixel' },
            ]}
          />
          {state.loading && (
            <Chip tone="accent">
              <RefreshCw size={11} className="animate-spin" />
              {state.progress?.detail ?? 'Loading'}
            </Chip>
          )}
        </div>
        <ExportButtons state={state} chartRef={chartRef} />
      </div>

      {pixelPlot?.simplified && (
        <div className="border-b border-[var(--border)] px-4 py-1.5 text-[11.5px] text-[var(--text-muted)]">
          Trajectory preview: all {formatCount(state.data!.bundle.pixelsLoaded)} pixels, {formatCount(pixelPlot.points)} points preserving endpoints and local extremes. Mean, IQR and CSV include every loaded observation.
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {state.error && !state.data ? (
          <ErrorPanel message={state.error} onRetry={state.reload} />
        ) : !state.data && state.loading ? (
          <LoadingPanel progress={state.progress} onCancel={state.cancel} label="Querying pixels" />
        ) : !state.data ? (
          <EmptyState
            icon={<LineChart size={24} />}
            title="Nothing plotted yet"
            body="Choose a year and a series in the inspector."
          />
        ) : (
          <PlotlyChart
            ref={chartRef}
            data={traces}
            layout={layout}
            config={PLOT_CONFIG}
            className="absolute inset-0 p-1"
          />
        )}
      </div>

      <StatusFooter state={state} />
    </div>
  );
}

/* ------------------------------------------------------------- building */

function buildTraces(
  loaded: Loaded,
  seriesOrder: string[],
  dark: boolean,
  mode3d: boolean,
  lines: PixelLine[],
): PlotData[] {
  const { bundle, summary } = loaded;
  if (mode3d) return build3dTraces(bundle, dark);

  const traces: PlotData[] = [];

  // Spaghetti: one WebGL trace per series, pixels separated by a null gap so a
  // single trace can hold thousands of independent lines.
  for (const { series: name, x, y } of lines) {
    traces.push({
      type: 'scattergl',
      mode: 'lines',
      name: `${name} · pixels`,
      x,
      y,
      line: { color: seriesColor(name, dark), width: 0.7 },
      opacity: 0.09,
      hoverinfo: 'skip',
      showlegend: true,
      legendgroup: name,
    });
  }

  // IQR ribbon per series, drawn under the mean.
  for (const name of seriesOrder) {
    const rows = summary.filter((r) => r.series === name);
    if (rows.length === 0) continue;
    const color = seriesColor(name, dark);
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: `${name} q25`,
      x: rows.map((r) => r.date),
      y: rows.map((r) => r.q25),
      line: { width: 0 },
      hoverinfo: 'skip',
      showlegend: false,
      legendgroup: name,
    });
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: `${name} · IQR`,
      x: rows.map((r) => r.date),
      y: rows.map((r) => r.q75),
      line: { width: 0 },
      fill: 'tonexty',
      fillcolor: hexWithAlpha(color, 0.18),
      hoverinfo: 'skip',
      legendgroup: name,
    });
  }

  // Bold daily mean on top.
  for (const name of seriesOrder) {
    const rows = summary.filter((r) => r.series === name);
    if (rows.length === 0) continue;
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: `${name} · daily mean`,
      x: rows.map((r) => r.date),
      y: rows.map((r) => r.mean),
      line: { color: seriesColor(name, dark), width: 2.4 },
      legendgroup: name,
      customdata: rows.map((r) => [r.q25, r.q75, r.n]),
      hovertemplate:
        `<b>${name}</b><br>mean %{y:.4f}` +
        '<br>IQR %{customdata[0]:.4f} – %{customdata[1]:.4f}' +
        '<br>%{customdata[2]} pixels<extra></extra>',
    });
  }

  return traces;
}

/** The same filtered rows as a surface over date × pixel. */
function build3dTraces(bundle: TimeseriesBundle, dark: boolean): PlotData[] {
  const MAX_PIXELS = 150;
  const MAX_DATES = 220;

  const times = [...new Set(Array.from(bundle.time))].sort((a, b) => a - b);
  const pixels = [...new Set(Array.from(bundle.pixelId))].sort((a, b) => a - b);
  const tStep = Math.ceil(times.length / MAX_DATES);
  const pStep = Math.ceil(pixels.length / MAX_PIXELS);
  const keptTimes = times.filter((_, i) => i % tStep === 0);
  const keptPixels = pixels.filter((_, i) => i % pStep === 0);
  const tIndex = new Map(keptTimes.map((t, i) => [t, i]));
  const pIndex = new Map(keptPixels.map((p, i) => [p, i]));

  const z: Array<Array<number | null>> = keptPixels.map(() =>
    new Array<number | null>(keptTimes.length).fill(null),
  );
  for (let i = 0; i < bundle.rows; i++) {
    const pi = pIndex.get(bundle.pixelId[i]);
    const ti = tIndex.get(bundle.time[i]);
    if (pi === undefined || ti === undefined) continue;
    z[pi][ti] = bundle.evi[i];
  }

  return [
    {
      type: 'surface',
      z,
      x: keptTimes.map((t) => isoFromMs(t)),
      y: keptPixels,
      colorscale: [
        [0, dark ? '#0b2b2b' : '#f7fcf5'],
        [0.35, '#74c476'],
        [0.7, '#238b45'],
        [1, '#00441b'],
      ],
      showscale: true,
      colorbar: { title: { text: 'EVI' }, thickness: 10, len: 0.6, outlinewidth: 0 },
      contours: { z: { show: true, usecolormap: true, project: { z: false } } },
      hovertemplate: 'pixel %{y}<br>%{x}<br>EVI %{z:.4f}<extra></extra>',
    },
  ];
}

function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* --------------------------------------------------------------- footer */

function StatusFooter({ state }: { state: ReturnType<typeof useTimeseriesData> }) {
  const d = state.data;
  const parts: string[] = [];
  if (d) {
    parts.push(`${formatCount(d.bundle.rows)} rows`);
    parts.push(
      d.usedSelection
        ? `${formatCount(d.bundle.pixelsLoaded)} selected pixels`
        : `${formatCount(d.bundle.pixelsLoaded)} of ${formatCount(d.availablePixels)} pixels sampled`,
    );
    if (d.summary.length) parts.push(`${formatCount(d.summary.length)} daily aggregates`);
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2 text-[11.5px] text-[var(--text-muted)]">
      <span className="truncate">{parts.join(' · ') || 'Nothing loaded yet'}</span>
      {d && !d.usedSelection && d.availablePixels > d.bundle.pixelsLoaded && (
        <span className="shrink-0 text-[var(--text-faint)]">
          showing a random sample — raise the pixel cap to widen it
        </span>
      )}
      {state.error && state.data && (
        <span className="shrink-0 text-amber-600 dark:text-amber-400">{state.error}</span>
      )}
    </div>
  );
}

function ExportButtons({
  state,
  chartRef,
}: {
  state: ReturnType<typeof useTimeseriesData>;
  chartRef: React.RefObject<PlotlyHandle | null>;
}) {
  const site = useActiveSite();
  const ts = useAppStore((s) => s.timeseries);
  const toast = useAppStore((s) => s.toast);
  const d = state.data;

  const exportPng = useCallback(async () => {
    try {
      await chartRef.current?.toPng(
        timestampedName([site?.manifest.siteId, 'evi', ts.year, ts.series.join('-')], 'png').replace(
          /\.png$/,
          '',
        ),
      );
    } catch (err) {
      toast({
        kind: 'error',
        title: 'PNG export failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }, [chartRef, site, ts.year, ts.series, toast]);

  const exportRows = useCallback(() => {
    if (!d) return;
    const b = d.bundle;
    const rows: Array<Array<unknown>> = new Array(b.rows);
    for (let i = 0; i < b.rows; i++) {
      rows[i] = [b.pixelId[i], b.seriesNames[b.seriesIdx[i]], isoFromMs(b.time[i]), b.evi[i]];
    }
    downloadCsv(
      timestampedName([site?.manifest.siteId, 'evi-pixels', ts.year], 'csv'),
      ['pixel_id', 'series', 'date', 'evi'],
      rows,
    );
  }, [d, site, ts.year]);

  const exportSummary = useCallback(() => {
    if (!d) return;
    downloadCsv(
      timestampedName([site?.manifest.siteId, 'evi-daily', ts.year], 'csv'),
      ['date', 'series', 'mean', 'q25', 'q75', 'n_pixels'],
      d.summary.map((r) => [r.date, r.series, r.mean, r.q25, r.q75, r.n]),
    );
  }, [d, site, ts.year]);

  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" icon={<Download size={13} />} onClick={exportPng} disabled={!d}>
        PNG
      </Button>
      <Button size="sm" icon={<Table size={13} />} onClick={exportSummary} disabled={!d}>
        Daily CSV
      </Button>
      <Button size="sm" icon={<Boxes size={13} />} onClick={exportRows} disabled={!d}>
        Pixel CSV
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------ inspector */

export function TimeSeriesInspector() {
  const site = useActiveSite();
  const ts = useAppStore((s) => s.timeseries);
  const update = useAppStore((s) => s.updateTimeseries);
  const selection = useAppStore((s) => s.selection);
  const setView = useAppStore((s) => s.setView);
  const [pixelDraft, setPixelDraft] = useState<number | null>(null);

  if (!site?.facts) {
    return (
      <EmptyState compact title="No site loaded" body="Import a dataset to see its controls." />
    );
  }

  const facts = site.facts;
  const draft = pixelDraft ?? ts.maxPixels;
  const dateBounds: [string, string] | null =
    facts.dateMin && facts.dateMax ? [facts.dateMin, facts.dateMax] : null;
  const yearBounds: [string, string] | null =
    ts.year !== null ? [`${ts.year}-01-01`, `${ts.year}-12-31`] : dateBounds;

  return (
    <div className="space-y-3">
      <Card title="Filters">
        <div className="space-y-3.5">
          <Field label="Year" htmlFor="ts-year">
            <div className="flex flex-wrap gap-1.5">
              {facts.years.map((y) => (
                <button
                  key={y}
                  onClick={() => update({ year: y, dateRange: null })}
                  className={
                    y === ts.year
                      ? 'chip border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]'
                      : 'chip hover:bg-[var(--bg-hover)]'
                  }
                >
                  {y}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Series">
            <div className="flex flex-wrap gap-1.5">
              {facts.series.map((s) => {
                const on = ts.series.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() =>
                      update({
                        series: on
                          ? ts.series.filter((x) => x !== s)
                          : [...ts.series, s].sort((a, b) =>
                              a === 'spline' ? -1 : b === 'spline' ? 1 : a.localeCompare(b),
                            ),
                      })
                    }
                    className="chip"
                    style={
                      on
                        ? {
                            borderColor: seriesColor(s, document.documentElement.classList.contains('dark')),
                            color: seriesColor(s, document.documentElement.classList.contains('dark')),
                            background: 'transparent',
                          }
                        : undefined
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: on
                          ? seriesColor(s, document.documentElement.classList.contains('dark'))
                          : 'var(--border-strong)',
                      }}
                    />
                    {s}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            label="Max pixels"
            hint={`${formatCount(draft)} / ${formatCount(MAX_PIXEL_SAMPLE)}`}
          >
            <Slider
              min={25}
              max={MAX_PIXEL_SAMPLE}
              step={25}
              value={draft}
              disabled={ts.useSelection}
              onChange={(v) => setPixelDraft(v)}
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-[var(--text-faint)]">
                default {DEFAULT_PIXEL_SAMPLE}
              </span>
              {pixelDraft !== null && pixelDraft !== ts.maxPixels && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    update({ maxPixels: pixelDraft });
                    setPixelDraft(null);
                  }}
                >
                  Load {formatCount(pixelDraft)} pixels
                </Button>
              )}
            </div>
          </Field>

          {yearBounds && (
            <Field label="Date range">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={ts.dateRange?.[0] ?? yearBounds[0]}
                  min={yearBounds[0]}
                  max={ts.dateRange?.[1] ?? yearBounds[1]}
                  onChange={(e) =>
                    update({ dateRange: [e.target.value, ts.dateRange?.[1] ?? yearBounds[1]] })
                  }
                  className="h-8 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-[12.5px]"
                />
                <span className="text-[var(--text-faint)]">→</span>
                <input
                  type="date"
                  value={ts.dateRange?.[1] ?? yearBounds[1]}
                  min={ts.dateRange?.[0] ?? yearBounds[0]}
                  max={yearBounds[1]}
                  onChange={(e) =>
                    update({ dateRange: [ts.dateRange?.[0] ?? yearBounds[0], e.target.value] })
                  }
                  className="h-8 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-[12.5px]"
                />
              </div>
              {ts.dateRange && (
                <button
                  onClick={() => update({ dateRange: null })}
                  className="pt-1 text-[11.5px] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
                >
                  Reset to the whole year
                </button>
              )}
            </Field>
          )}
        </div>
      </Card>

      <Card title="Pixel source">
        <Toggle
          checked={ts.useSelection}
          onChange={(v) => update({ useSelection: v })}
          label="Use the map selection"
          hint={
            selection.length
              ? `${formatCount(selection.length)} pixels selected`
              : 'Nothing selected yet'
          }
          disabled={selection.length === 0 && !ts.useSelection}
        />
        {selection.length === 0 && (
          <button
            onClick={() => setView('pixelmap')}
            className="mt-1.5 px-2 text-[11.5px] text-[var(--accent)] underline underline-offset-2"
          >
            Draw a selection on the Pixel Map →
          </button>
        )}
      </Card>

      <Card title="How to read it">
        <ul className="space-y-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
          <li>
            <span className="font-medium text-[var(--text)]">Thin lines</span> — one per pixel, the
            raw spread.
          </li>
          <li>
            <span className="font-medium text-[var(--text)]">Shaded band</span> — the interquartile
            range across the plotted pixels, per day.
          </li>
          <li>
            <span className="font-medium text-[var(--text)]">Bold line</span> — the daily mean.
          </li>
          <li>
            <span className="font-medium text-[var(--text)]">spline</span> is gap-filled daily;{' '}
            <span className="font-medium text-[var(--text)]">raw</span> is the observed, sparser
            record.
          </li>
        </ul>
      </Card>
    </div>
  );
}
