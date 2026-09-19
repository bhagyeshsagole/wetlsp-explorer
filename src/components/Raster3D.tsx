/**
 * The flagship "delight" view: the phenometric raster as an extruded relief,
 * GitHub-skyline style, with orbit controls.
 *
 * One column per finite cell, in a cartesian OrbitView — no basemap, no
 * projection, just the surface.
 */
import { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import DeckGL from '@deck.gl/react';
import { ColumnLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM, OrbitView, OrbitViewport, type PickingInfo } from '@deck.gl/core';
import type { ColorScale } from '@/lib/colorscales';
import type { RasterSlice } from '@/lib/types';

export interface Raster3DHandle {
  canvas(): HTMLCanvasElement | null;
}

interface Cell {
  position: [number, number];
  value: number;
  col: number;
  row: number;
}

export const Raster3D = forwardRef<
  Raster3DHandle,
  {
    slice: RasterSlice;
    scale: ColorScale;
    /** Column height for the full data range, in the same units as the grid. */
    relief?: number;
    getTooltip?: (cell: { col: number; row: number; value: number }) => string;
  }
>(function Raster3D({ slice, scale, relief = 0.42, getTooltip }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 500 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    canvas: () => hostRef.current?.querySelector('canvas') ?? null,
  }));

  const { cells, extent } = useMemo(() => {
    const out: Cell[] = [];
    const { width, height, values } = slice;
    // Normalise the grid to roughly 100 units across so the camera framing is
    // independent of raster size.
    const step = 100 / Math.max(width, height);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxValue = -Infinity;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const v = values[row * width + col];
        if (!Number.isFinite(v)) continue;
        const x = (col - width / 2) * step;
        const y = (height / 2 - row) * step;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxValue = Math.max(maxValue, v);
        out.push({
          position: [x, y],
          value: v,
          col,
          row,
        });
      }
    }
    if (!out.length) {
      minX = minY = -50;
      maxX = maxY = 50;
      maxValue = 0;
    }
    return {
      cells: out,
      extent: { step, span: Math.max(maxX - minX + step, maxY - minY + step), minX, minY, maxX, maxY, maxValue },
    };
  }, [slice]);

  const [lo, hi] = scale.domain;
  const span = hi - lo || 1;
  const elevationSpan = extent.span * relief;
  const view = useMemo(() => new OrbitView({ orbitAxis: 'Z', orthographic: true, fovy: 42 }), []);
  const initialViewState = useMemo(() => {
    const maxElevation = Math.max(0, ((extent.maxValue - lo) / span) * elevationSpan);
    const target: [number, number, number] = [
      (extent.minX + extent.maxX) / 2,
      (extent.minY + extent.maxY) / 2,
      maxElevation / 2,
    ];
    // Fit the finite footprint, not the mostly-empty source raster. Project
    // its box at unit zoom so even a small bog fills its comparison panel.
    const viewport = new OrbitViewport({ ...size, target, orbitAxis: 'Z', orthographic: true, rotationX: 42, rotationOrbit: -28, zoom: 0 });
    const corners = [extent.minX - extent.step, extent.maxX + extent.step].flatMap((x) =>
      [extent.minY - extent.step, extent.maxY + extent.step].flatMap((y) =>
        [0, maxElevation].map((z) => viewport.project([x, y, z])),
      ),
    );
    const width = Math.max(...corners.map((p) => p[0])) - Math.min(...corners.map((p) => p[0]));
    const height = Math.max(...corners.map((p) => p[1])) - Math.min(...corners.map((p) => p[1]));
    const zoom = Math.log2(Math.min(size.width * 0.8 / Math.max(1, width), size.height * 0.8 / Math.max(1, height)));
    return { target, zoom, rotationX: 42, rotationOrbit: -28, minZoom: -3, maxZoom: 12 };
  }, [extent, lo, span, elevationSpan, size]);

  const layers = useMemo(
    () => [
      new ColumnLayer<Cell>({
        id: 'relief',
        data: cells,
        diskResolution: 4,
        angle: 45,
        radius: extent.step * 0.72,
        extruded: true,
        pickable: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d) => d.position,
        getElevation: (d) => ((d.value - lo) / span) * elevationSpan,
        getFillColor: (d) => {
          const c = scale.color(d.value);
          return [c[0], c[1], c[2], 255];
        },
        material: {
          ambient: 0.45,
          diffuse: 0.65,
          shininess: 60,
          specularColor: [220, 230, 240],
        },
        updateTriggers: { getFillColor: [lo, hi, scale.family], getElevation: [lo, hi, relief] },
      }),
    ],
    [cells, extent.step, lo, hi, span, elevationSpan, scale, relief],
  );

  return (
    <div ref={hostRef} className="relative h-full w-full">
      <DeckGL
        views={view}
        initialViewState={initialViewState}
        controller={{ inertia: 250 }}
        layers={layers}
        getTooltip={(info: PickingInfo) => {
          const cell = info.object as Cell | undefined;
          if (!cell || !getTooltip) return null;
          return {
            html: getTooltip(cell),
            style: {
              background: 'var(--bg-elevated)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              boxShadow: 'var(--shadow-card)',
              fontSize: '12px',
              padding: '7px 9px',
            },
          };
        }}
        style={{ position: 'absolute', inset: '0' }}
      />
    </div>
  );
});
