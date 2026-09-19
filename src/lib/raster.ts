/** Turning a `RasterSlice` into pixels, in whatever colour family it belongs to. */
import type { ColorScale } from './colorscales';
import type { RasterSlice } from './types';

/** RGBA image at the raster's own resolution; fill values stay transparent. */
export function rasterToImageData(slice: RasterSlice, scale: ColorScale): ImageData {
  const { width, height, values } = slice;
  const img = new ImageData(width, height);
  const data = img.data;
  for (let i = 0; i < values.length; i++) {
    const [r, g, b, a] = scale.color(values[i]);
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = a;
  }
  return img;
}

export function rasterToCanvas(slice: RasterSlice, scale: ColorScale): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, slice.width);
  canvas.height = Math.max(1, slice.height);
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.putImageData(rasterToImageData(slice, scale), 0, 0);
  return canvas;
}

/** Domain for a layer: the data's own range, or the shared range across panels. */
export function rasterDomain(slices: RasterSlice[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of slices) {
    if (s.finiteCount === 0) continue;
    if (s.min < lo) lo = s.min;
    if (s.max > hi) hi = s.max;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

/** Cell index under a fractional position in the raster, or null when outside. */
export function cellAt(
  slice: RasterSlice,
  fx: number,
  fy: number,
): { col: number; row: number; value: number } | null {
  const col = Math.floor(fx * slice.width);
  const row = Math.floor(fy * slice.height);
  if (col < 0 || row < 0 || col >= slice.width || row >= slice.height) return null;
  return { col, row, value: slice.values[row * slice.width + col] };
}

/** Projected metres for a cell centre, when the file carried georeferencing. */
export function cellToProjected(
  slice: RasterSlice,
  col: number,
  row: number,
): [number, number] | null {
  if (!slice.bboxProjected) return null;
  const [xmin, ymin, xmax, ymax] = slice.bboxProjected;
  const x = xmin + ((col + 0.5) / slice.width) * (xmax - xmin);
  // Rasters are stored north-up: row 0 is the top, i.e. ymax.
  const y = ymax - ((row + 0.5) / slice.height) * (ymax - ymin);
  return [x, y];
}
