import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { createReadStream, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { Connect, Plugin } from 'vite';

/**
 * Serve `samples/` at /samples/ in dev and preview, like the desktop server
 * does, so sample sites can be tested without packaging. Never part of the
 * hosted web build.
 */
function serveSamples(): Plugin {
  const root = fileURLToPath(new URL('./samples', import.meta.url));
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/samples/')) return next();
    const path = resolve(root, `.${decodeURIComponent(url.pathname.slice('/samples'.length))}`);
    if (!path.startsWith(root + sep)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    try {
      const info = statSync(path);
      if (!info.isFile()) throw new Error('not a file');
      res.setHeader('Content-Length', info.size);
      res.setHeader('Cache-Control', 'no-store');
      if (path.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
      createReadStream(path).pipe(res);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  };
  return {
    name: 'wetlsp-serve-samples',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

// Deployment base. Set VITE_BASE=/my-subpath/ for GitHub Pages project sites.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig(({ mode }) => ({
  base,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  optimizeDeps: {
    // Both ship large wasm payloads; let them resolve at runtime instead of
    // being pre-bundled into the dev dependency graph.
    exclude: ['@duckdb/duckdb-wasm', 'h5wasm'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('h5wasm')) return 'h5wasm';
            if (id.includes('plotly')) return 'plotly';
            if (id.includes('maplibre-gl')) return 'maplibre';
            if (id.includes('deck.gl') || id.includes('@deck.gl') || id.includes('@luma.gl'))
              return 'deckgl';
            if (id.includes('apache-arrow') || id.includes('@duckdb')) return 'duckdb';
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    serveSamples(),
    react(),
    tailwindcss(),
    VitePWA({
      // Desktop always serves its bundled version; a cached web shell must not
      // override a newly installed release.
      disable: mode === 'desktop',
      // injectManifest, not generateSW: the service worker is a real source file
      // (src/sw.ts) bundled by Vite, which keeps the runtime caching rules in one
      // reviewable place.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'catalog/*.csv', 'fonts/*'],
      manifest: {
        name: 'WetLSP Explorer',
        short_name: 'WetLSP',
        description:
          'Explore Wetland Land Surface Phenology datasets \u2014 pixel time series, phenometric rasters and site catalogs \u2014 entirely in your browser, online or off.',
        // No explicit `id` or `orientation`: the id then defaults to start_url,
        // which keeps app identity stable under a subpath deployment, and the
        // app is free to rotate on a tablet.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f7f8fa',
        theme_color: '#0f766e',
        categories: ['science', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // Plotly (4.7 MB) and the h5wasm NetCDF worker (4.1 MB) are precached on
        // purpose: without them the Time Series and Phenometrics views would not
        // work offline. Only public/duckdb/ is excluded.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,csv,webmanifest}'],
        globIgnores: ['**/duckdb/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
}));
