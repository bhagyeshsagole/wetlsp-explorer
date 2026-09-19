import { describe, expect, it } from 'vitest';
import type { TimeseriesBundle } from '@/engine/queries';
import { pixelLines, PIXEL_VERTEX_BUDGET } from './timeseriesPlot';

function bundle(pixels: number, days: number, series = 1): TimeseriesBundle {
  const rows = pixels * days * series;
  const b: TimeseriesBundle = { seriesNames: ['spline', 'raw'].slice(0, series),
    pixelId: new Int32Array(rows), seriesIdx: new Uint8Array(rows),
    time: new Float64Array(rows), evi: new Float64Array(rows), rows, pixelsLoaded: pixels };
  for (let i = 0; i < rows; i++) {
    b.pixelId[i] = Math.floor(i / days) % pixels;
    b.seriesIdx[i] = Math.floor(i / (pixels * days));
    b.time[i] = i % days;
    b.evi[i] = Math.sin(i % days);
  }
  return b;
}

describe('bounded pixel trajectories', () => {
  it('retains every value for small traces and separates pixels', () => {
    const input = bundle(2, 3);
    const actual = pixelLines(input);
    expect(actual.simplified).toBe(false);
    expect(actual.lines[0].x).toEqual([0, 1, 2, null, 0, 1, 2]);
    expect(actual.points).toBe(input.rows);
  });

  it('keeps all 5000 pixels in both series within the global vertex budget', () => {
    const input = bundle(5000, 122, 2);
    const actual = pixelLines(input);
    expect(actual.simplified).toBe(true);
    expect(actual.lines.reduce((n, line) => n + line.x.length, 0)).toBeLessThanOrEqual(PIXEL_VERTEX_BUDGET);
    for (const line of actual.lines) {
      expect(line.x.filter((x) => x === null)).toHaveLength(4999);
      expect(line.x.filter((x) => x === 0)).toHaveLength(5000);
      expect(line.x.filter((x) => x === 121)).toHaveLength(5000);
    }
    expect(input.rows).toBe(1_220_000);
    expect(input.evi.length).toBe(input.rows);
  });

  it('preserves the default 250-pixel full-year chart at full resolution', () => {
    const input = bundle(250, 365);
    const actual = pixelLines(input);
    expect(actual.simplified).toBe(false);
    expect(actual.points).toBe(91_250);
  });

  it('preserves endpoints and extrema in chronological order without changing source rows', () => {
    const input = bundle(1, 12);
    input.evi.set([3, 2, -9, 2, 1, 10, 2, 3, 4, 5, 4, 3]);
    const actual = pixelLines(input, 5, 0);
    expect(actual.lines[0].x).toEqual([0, 2, 5, 11]);
    expect(actual.lines[0].y).toEqual([3, -9, 10, 3]);
    expect(Array.from(input.evi)).toEqual([3, 2, -9, 2, 1, 10, 2, 3, 4, 5, 4, 3]);
  });
});
