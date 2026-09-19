/** Persist both halves of a DuckDB bundle, even on the first uncontrolled visit. */
export const DUCKDB_CACHE = 'wetlsp-engine-duckdb';

export async function cacheEngineBundle(bundle: {
  mainModule: string;
  mainWorker?: string | null;
}): Promise<void> {
  if (!bundle.mainWorker) throw new Error('The query engine worker is missing.');
  const cache = await caches.open(DUCKDB_CACHE);
  const urls = [bundle.mainWorker, bundle.mainModule].map(
    (url) => new URL(url, document.baseURI).href,
  );
  const missing: string[] = [];
  for (const url of urls) {
    if (!(await cache.match(url))?.ok) missing.push(url);
  }
  // addAll resolves only after the response bodies have been written. Merely
  // starting the worker does not prove its JS or WASM reached Cache Storage.
  if (missing.length) await cache.addAll(missing);
}

export async function requireOfflineShell(): Promise<void> {
  // The desktop installer includes the entire shell and both WASM engines.
  if (import.meta.env.MODE === 'desktop') return;
  if (!('serviceWorker' in navigator)) {
    throw new Error('This browser does not support offline app storage.');
  }
  if (navigator.serviceWorker.controller) return;
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      if (!navigator.serviceWorker.controller) return;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', check);
      resolve();
    };
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', check);
      reject(new Error('The offline app shell is not ready. Open the production build online and try again.'));
    }, 15_000);
    navigator.serviceWorker.addEventListener('controllerchange', check);
    check();
  });
}
