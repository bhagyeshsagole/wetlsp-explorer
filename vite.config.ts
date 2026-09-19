import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Deployment base. Set VITE_BASE=/my-subpath/ for GitHub Pages project sites.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
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
    react(),
    tailwindcss(),
    VitePWA({
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
});
