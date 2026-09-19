/** PNG and CSV export helpers shared by every view. */
import { toCsv } from './csv';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so Safari has finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCsv(filename: string, header: string[], rows: Array<Array<unknown>>): void {
  downloadBlob(new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}

export async function downloadCanvasPng(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('This view could not be rendered to a PNG.');
  downloadBlob(blob, filename);
}

/**
 * Composite one or more canvases (deck.gl over MapLibre, say) onto a white or
 * dark backdrop and save that — a bare WebGL canvas exports transparent.
 */
export async function downloadCompositePng(
  canvases: HTMLCanvasElement[],
  filename: string,
  background: string,
): Promise<void> {
  const visible = canvases.filter((c) => c.width > 0 && c.height > 0);
  if (visible.length === 0) throw new Error('There is nothing on screen to export yet.');
  const width = Math.max(...visible.map((c) => c.width));
  const height = Math.max(...visible.map((c) => c.height));
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('This browser would not give us a 2D canvas to export with.');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  for (const c of visible) ctx.drawImage(c, 0, 0, width, height);
  await downloadCanvasPng(out, filename);
}

export function timestampedName(parts: Array<string | number | null | undefined>, ext: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = parts
    .filter((p) => p !== null && p !== undefined && String(p) !== '')
    .join('-')
    .replace(/[^\w.-]+/g, '-');
  return `${slug}-${stamp}.${ext}`;
}

/** Background colour to flatten exports onto, matching the current theme. */
export function exportBackground(): string {
  return document.documentElement.classList.contains('dark') ? '#0b0f14' : '#ffffff';
}
