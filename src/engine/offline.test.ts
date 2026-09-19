import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheEngineBundle, DUCKDB_CACHE } from './offline';

afterEach(() => vi.unstubAllGlobals());

describe('offline engine assets', () => {
  function setup(cached: string[] = []) {
    const match = vi.fn(async (url: string) => cached.includes(url) ? { ok: true } : undefined);
    const addAll = vi.fn(async (_urls: string[]) => undefined);
    const open = vi.fn(async () => ({ match, addAll }));
    vi.stubGlobal('caches', { open });
    vi.stubGlobal('document', { baseURI: 'https://example.org/explorer/' });
    return { open, addAll };
  }

  it('saves worker and WASM on the first uncontrolled visit, under the deployment base', async () => {
    const { open, addAll } = setup();
    await cacheEngineBundle({ mainWorker: './duckdb/worker.js', mainModule: './duckdb/engine.wasm' });
    expect(open).toHaveBeenCalledWith(DUCKDB_CACHE);
    expect(addAll).toHaveBeenCalledWith([
      'https://example.org/explorer/duckdb/worker.js',
      'https://example.org/explorer/duckdb/engine.wasm',
    ]);
  });

  it('repairs a partial cache without redownloading the large WASM', async () => {
    const { addAll } = setup(['https://example.org/explorer/duckdb/engine.wasm']);
    await cacheEngineBundle({ mainWorker: './duckdb/worker.js', mainModule: './duckdb/engine.wasm' });
    expect(addAll).toHaveBeenCalledWith(['https://example.org/explorer/duckdb/worker.js']);
  });

  it('does not fetch again with the complete bundle cached', async () => {
    const { addAll } = setup(['https://example.org/w.js', 'https://example.org/e.wasm']);
    await cacheEngineBundle({ mainWorker: '/w.js', mainModule: '/e.wasm' });
    expect(addAll).not.toHaveBeenCalled();
  });

  it('reports failed cache writes instead of declaring offline readiness', async () => {
    const { addAll } = setup();
    addAll.mockRejectedValue(new Error('Storage full'));
    await expect(cacheEngineBundle({ mainWorker: '/w.js', mainModule: '/e.wasm' }))
      .rejects.toThrow('Storage full');
  });
});
