/**
 * Figure actions shared by every view: copy to the clipboard, and a registry
 * of "the figure on screen" so ⌘S / ⌘⇧C and the command palette can save or
 * copy whichever view is open without knowing how it draws.
 */
import { useAppStore } from '@/store/useAppStore';

export interface FigureActions {
  /** Download a PNG. */
  save(): Promise<void>;
  /** PNG on the clipboard, ready to paste into slides, docs or chat. */
  copy(): Promise<void>;
  /** Optional plain-text caption describing exactly what is plotted. */
  caption?(): string | null;
}

let current: FigureActions | null = null;

export function registerFigure(actions: FigureActions): () => void {
  current = actions;
  return () => {
    if (current === actions) current = null;
  };
}

export function currentFigure(): FigureActions | null {
  return current;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('This view could not be rendered to an image.'))),
      'image/png',
    ),
  );
}

export async function copyImage(blob: Blob | Promise<Blob>): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('This browser cannot put images on the clipboard. Use PNG instead.');
  }
  // A promise-valued item keeps Safari's user-activation window open.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(blob) })]);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Run a figure action with the standard success / failure toasts. */
export async function runFigureAction(
  kind: 'save' | 'copy' | 'caption',
  actions: FigureActions | null = current,
): Promise<void> {
  const toast = useAppStore.getState().toast;
  if (!actions) {
    toast({ kind: 'info', title: 'Nothing to export here', detail: 'Open a chart or map first.' });
    return;
  }
  try {
    if (kind === 'save') {
      await actions.save();
    } else if (kind === 'copy') {
      await actions.copy();
      toast({ kind: 'success', title: 'Figure copied', detail: 'Paste it into slides, a doc or a message.', ttl: 2500 });
    } else {
      const text = actions.caption?.();
      if (!text) throw new Error('This view has no caption to copy yet.');
      await copyText(text);
      toast({ kind: 'success', title: 'Caption copied', detail: text.length > 140 ? `${text.slice(0, 140)}…` : text, ttl: 4000 });
    }
  } catch (err) {
    toast({
      kind: 'error',
      title: kind === 'save' ? 'PNG export failed' : kind === 'copy' ? 'Copy failed' : 'Caption copy failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
