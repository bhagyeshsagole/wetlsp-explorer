/**
 * Minimal typed request/response plumbing for the compute workers, with
 * progress events and cancellation.
 */
import type { ProgressEvent } from './types';

export interface RpcRequest {
  id: number;
  method: string;
  args: unknown[];
}

export interface RpcCancel {
  id: number;
  cancel: true;
}

export type RpcOutbound =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; progress: ProgressEvent };

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

export interface CallOptions {
  onProgress?: (p: ProgressEvent) => void;
  signal?: AbortSignal;
  transfer?: Transferable[];
}

/** Client side: wraps a Worker in promise-returning method calls. */
export class WorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: unknown) => void;
      onProgress?: (p: ProgressEvent) => void;
    }
  >();

  constructor(private readonly factory: () => Worker) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = this.factory();
    w.onmessage = (ev: MessageEvent<RpcOutbound>) => {
      const msg = ev.data;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      if ('progress' in msg) {
        entry.onProgress?.(msg.progress);
        return;
      }
      this.pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.result);
      else
        entry.reject(
          msg.error === 'Cancelled' ? new CancelledError() : new Error(msg.error),
        );
    };
    w.onerror = (ev) => {
      const err = new Error(ev.message || 'Worker failed');
      for (const [, entry] of this.pending) entry.reject(err);
      this.pending.clear();
    };
    this.worker = w;
    return w;
  }

  call<T>(method: string, args: unknown[] = [], opts: CallOptions = {}): Promise<T> {
    const worker = this.ensure();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      if (opts.signal?.aborted) {
        reject(new CancelledError());
        return;
      }
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        onProgress: opts.onProgress,
      });
      opts.signal?.addEventListener(
        'abort',
        () => {
          worker.postMessage({ id, cancel: true } satisfies RpcCancel);
        },
        { once: true },
      );
      worker.postMessage({ id, method, args } satisfies RpcRequest, opts.transfer ?? []);
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const [, entry] of this.pending) entry.reject(new CancelledError());
    this.pending.clear();
  }
}

/** Worker side: registers handlers and wires up progress + cancellation. */
export interface HandlerContext {
  progress(p: ProgressEvent): void;
  throwIfCancelled(): void;
  cancelled(): boolean;
}

export function serve(
  handlers: Record<string, (ctx: HandlerContext, ...args: never[]) => unknown>,
): void {
  const cancelled = new Set<number>();

  self.onmessage = async (ev: MessageEvent<RpcRequest | RpcCancel>) => {
    const msg = ev.data;
    if ('cancel' in msg) {
      cancelled.add(msg.id);
      return;
    }
    const { id, method, args } = msg;
    const ctx: HandlerContext = {
      progress: (p) => (self as unknown as Worker).postMessage({ id, progress: p }),
      cancelled: () => cancelled.has(id),
      throwIfCancelled: () => {
        if (cancelled.has(id)) throw new CancelledError();
      },
    };
    try {
      const fn = handlers[method];
      if (!fn) throw new Error(`Unknown worker method "${method}"`);
      const result = await fn(ctx, ...(args as never[]));
      if (cancelled.has(id)) throw new CancelledError();
      const transfer = collectTransferables(result);
      (self as unknown as Worker).postMessage({ id, ok: true, result }, transfer);
    } catch (err) {
      (self as unknown as Worker).postMessage({
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      cancelled.delete(id);
    }
  };
}

/** Shallow scan for typed arrays so big buffers move instead of being cloned. */
function collectTransferables(value: unknown): Transferable[] {
  const out: Transferable[] = [];
  const seen = new Set<ArrayBufferLike>();
  const visit = (v: unknown, depth: number) => {
    if (!v || depth > 3) return;
    if (ArrayBuffer.isView(v)) {
      const buf = v.buffer;
      if (!seen.has(buf)) {
        seen.add(buf);
        out.push(buf as ArrayBuffer);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item, depth + 1);
      return;
    }
    if (typeof v === 'object') {
      for (const item of Object.values(v as Record<string, unknown>)) visit(item, depth + 1);
    }
  };
  visit(value, 0);
  return out;
}
