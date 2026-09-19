/**
 * "Figure" mode: the raster drawn to a canvas with equal-aspect axes in
 * projected metres, shared pan/zoom, and a hover probe.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import type { ColorScale } from '@/lib/colorscales';
import { cellAt, cellToProjected, rasterToCanvas } from '@/lib/raster';
import type { RasterSlice } from '@/lib/types';

export interface FigureView {
  /** Zoom factor relative to fit-to-panel. */
  k: number;
  /** Pan in panel pixels. */
  tx: number;
  ty: number;
}

export const IDENTITY_VIEW: FigureView = { k: 1, tx: 0, ty: 0 };

export interface Probe {
  col: number;
  row: number;
  value: number;
  projected: [number, number] | null;
}

export interface RasterFigureHandle {
  canvas(): HTMLCanvasElement | null;
}

const MARGIN = { left: 68, right: 22, top: 28, bottom: 30 };

export const RasterFigure = forwardRef<
  RasterFigureHandle,
  {
    slice: RasterSlice;
    scale: ColorScale;
    view: FigureView;
    onView: (v: FigureView) => void;
    onProbe?: (p: Probe | null) => void;
    dark: boolean;
    axes?: boolean;
  }
>(function RasterFigure({ slice, scale, view, onView, onProbe, dark, axes = true }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useImperativeHandle(ref, () => ({ canvas: () => canvasRef.current }));

  // The coloured raster only changes when the data or the scale does.
  useEffect(() => {
    sourceRef.current = rasterToCanvas(slice, scale);
  }, [slice, scale]);

  const plotRect = useCallback((w: number, h: number) => {
    const left = axes ? MARGIN.left : 0;
    const top = axes ? MARGIN.top : 0;
    return {
      left,
      top,
      width: Math.max(1, w - left - (axes ? MARGIN.right : 0)),
      height: Math.max(1, h - top - (axes ? MARGIN.bottom : 0)),
    };
  }, [axes]);

  /** Fit-to-panel scale, preserving the raster's aspect ratio. */
  const baseFit = useCallback(
    (w: number, h: number) => {
      const r = plotRect(w, h);
      return Math.min(r.width / slice.width, r.height / slice.height);
    },
    [plotRect, slice.width, slice.height],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    const source = sourceRef.current;
    if (!canvas || !host || !source) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const rect = plotRect(w, h);
    const fit = baseFit(w, h);
    const k = fit * viewRef.current.k;
    const dw = slice.width * k;
    const dh = slice.height * k;
    const ox = rect.left + (rect.width - dw) / 2 + viewRef.current.tx;
    const oy = rect.top + (rect.height - dh) / 2 + viewRef.current.ty;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.left, rect.top, rect.width, rect.height);
    ctx.clip();
    ctx.imageSmoothingEnabled = k < 1.5;
    ctx.drawImage(source, ox, oy, dw, dh);
    ctx.restore();

    if (!axes) return;

    const gridColor = dark ? '#212a36' : '#e3e6ec';
    const textColor = dark ? '#98a3b3' : '#666d7a';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.left + 0.5, rect.top + 0.5, rect.width - 1, rect.height - 1);

    ctx.fillStyle = textColor;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const bbox = slice.bboxProjected;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const fy = i / ticks;
      const py = rect.top + fy * rect.height;
      // Invert the screen position back through the transform to a data row.
      const row = ((py - oy) / dh) * slice.height;
      let label: string;
      if (bbox) {
        const y = bbox[3] - (row / slice.height) * (bbox[3] - bbox[1]);
        label = Math.round(y).toLocaleString('en-US');
      } else {
        label = String(Math.round(row));
      }
      ctx.fillText(label, rect.left - 6, py);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= ticks; i++) {
      const fx = i / ticks;
      const px = rect.left + fx * rect.width;
      const colIdx = ((px - ox) / dw) * slice.width;
      let label: string;
      if (bbox) {
        const x = bbox[0] + (colIdx / slice.width) * (bbox[2] - bbox[0]);
        label = Math.round(x).toLocaleString('en-US');
      } else {
        label = String(Math.round(colIdx));
      }
      ctx.fillText(label, px, rect.top + rect.height + 6);
    }
  }, [axes, baseFit, dark, plotRect, slice]);

  useEffect(() => {
    draw();
  }, [draw, view]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(host);
    return () => ro.disconnect();
  }, [draw]);

  const probeAt = useCallback(
    (clientX: number, clientY: number): Probe | null => {
      const host = hostRef.current;
      if (!host) return null;
      const box = host.getBoundingClientRect();
      const w = box.width;
      const h = box.height;
      const rect = plotRect(w, h);
      const fit = baseFit(w, h);
      const k = fit * viewRef.current.k;
      const dw = slice.width * k;
      const dh = slice.height * k;
      const ox = rect.left + (rect.width - dw) / 2 + viewRef.current.tx;
      const oy = rect.top + (rect.height - dh) / 2 + viewRef.current.ty;
      const fx = (clientX - box.left - ox) / dw;
      const fy = (clientY - box.top - oy) / dh;
      const cell = cellAt(slice, fx, fy);
      if (!cell) return null;
      return { ...cell, projected: cellToProjected(slice, cell.col, cell.row) };
    },
    [baseFit, plotRect, slice],
  );

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full touch-none"
      onWheel={(e) => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0015);
        const next = Math.min(40, Math.max(0.4, viewRef.current.k * factor));
        onView({ ...viewRef.current, k: next });
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
          x: e.clientX,
          y: e.clientY,
          tx: viewRef.current.tx,
          ty: viewRef.current.ty,
        };
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (drag) {
          onView({
            k: viewRef.current.k,
            tx: drag.tx + (e.clientX - drag.x),
            ty: drag.ty + (e.clientY - drag.y),
          });
          return;
        }
        onProbe?.(probeAt(e.clientX, e.clientY));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        dragRef.current = null;
      }}
      onPointerLeave={() => {
        dragRef.current = null;
        onProbe?.(null);
      }}
      onDoubleClick={() => onView(IDENTITY_VIEW)}
    >
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab active:cursor-grabbing" />
    </div>
  );
});
