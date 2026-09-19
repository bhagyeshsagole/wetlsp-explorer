import type { TimeseriesBundle } from '@/engine/queries';

/** Includes the null separators between individual pixel trajectories. */
export const PIXEL_VERTEX_BUDGET = 50_000;

export interface PixelLine {
  series: string;
  x: Array<number | null>;
  y: Array<number | null>;
}

/**
 * Bound Plotly's synchronous WebGL preparation while retaining every pixel.
 * Each trajectory keeps its endpoints and the min/max of consecutive time
 * bins, in chronological order. SQL summaries and export rows are untouched.
 * The query sorts rows by series, pixel, date, so no large sort/copy is needed.
 */
export function pixelLines(bundle: TimeseriesBundle, budget = PIXEL_VERTEX_BUDGET, fullResolutionThreshold = 100_000): {
  lines: PixelLine[];
  points: number;
  simplified: boolean;
} {
  const groups: Array<{ start: number; end: number; series: number }> = [];
  for (let start = 0; start < bundle.rows;) {
    let end = start + 1;
    while (end < bundle.rows && bundle.pixelId[end] === bundle.pixelId[start] &&
      bundle.seriesIdx[end] === bundle.seriesIdx[start]) end++;
    groups.push({ start, end, series: bundle.seriesIdx[start] });
    start = end;
  }
  // Four values preserve endpoints and both extrema even at the 5k × 2-series
  // cap. The standard 50k budget has room for these plus every line separator.
  const slots = bundle.rows + groups.length <= fullResolutionThreshold
    ? bundle.rows
    : Math.max(4, Math.floor(budget / Math.max(1, groups.length)) - 1);
  const lines = bundle.seriesNames.map((series) => ({ series, x: [] as Array<number | null>, y: [] as Array<number | null> }));
  let points = 0;
  for (const { start, end, series } of groups) {
    const line = lines[series];
    if (line.x.length) { line.x.push(null); line.y.push(null); }
    const add = (i: number) => { line.x.push(bundle.time[i]); line.y.push(bundle.evi[i]); points++; };
    if (end - start <= slots) {
      for (let i = start; i < end; i++) add(i);
      continue;
    }
    add(start);
    const bins = Math.max(1, Math.floor((slots - 2) / 2));
    const interior = end - start - 2;
    for (let bin = 0; bin < bins; bin++) {
      const first = start + 1 + Math.floor(bin * interior / bins);
      const last = start + 1 + Math.floor((bin + 1) * interior / bins);
      let min = first, max = first;
      for (let i = first + 1; i < last; i++) {
        if (bundle.evi[i] < bundle.evi[min]) min = i;
        if (bundle.evi[i] > bundle.evi[max]) max = i;
      }
      add(Math.min(min, max));
      if (min !== max) add(Math.max(min, max));
    }
    add(end - 1);
  }
  return { lines: lines.filter((line) => line.x.length), points, simplified: points < bundle.rows };
}
