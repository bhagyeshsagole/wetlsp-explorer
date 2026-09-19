# WetLSP Explorer

Looking to install the app? Start with the no-code guide in
**[SETUP.md](SETUP.md)**. End users do not need Node.js, GitHub, or Terminal.

An installable, offline-capable web app for exploring **WetLSP** (Wetland Land
Surface Phenology) datasets. It replaces the R Shiny explorer: same
visualisations, no server, and the whole thing keeps working with the network
off.

Everything runs client-side. Parquet is queried with DuckDB-WASM, NetCDF-4 is
read with h5wasm, and imported datasets live in the browser's Origin Private
File System. **No data ever leaves the machine** — the only network traffic is
basemap tiles and, if you use it, your own Google Drive.

---

## Quick start

```sh
npm install
npm run dev          # http://localhost:5173
```

Then drag a site folder (e.g. `CA-DB2/`) anywhere onto the window.

```sh
npm run build        # static bundle in dist/
npm run preview      # serve the built app
npm test             # unit tests
npm run lint
```

`dist/` is plain static files — deploy it to GitHub Pages, Netlify, Vercel or
any file server. For a subpath deployment, build with `VITE_BASE=/my-path/`.

### Installing it as a desktop app

Download the **Mac DMG** or **Windows EXE** from
[Releases](https://github.com/bhagyeshsagole/wetlsp-explorer/releases/latest).
The desktop app bundles Electron, the app shell, and both scientific readers;
no browser installation or hosted website is needed. See [SETUP.md](SETUP.md)
for installation, unsigned-build warnings, and offline use.

### Building desktop releases (developers)

```sh
npm ci
npm run desktop           # build and launch locally
npm run desktop:dist      # create this OS's installer in release/
npm run test:desktop      # offline launch, DuckDB query, OPFS relaunch check
```

The desktop release workflow builds Apple silicon and Intel DMGs plus a Windows
x64 NSIS installer on their respective OS runners. Pushing a version tag such as
`v1.0.0` publishes all three installers to a **private GitHub Release**, after
packaged-app smoke checks pass. Workflow dispatch builds downloadable Actions
artifacts without creating a release. Update package.json/version and lockfile
before tagging future versions.

Desktop source lives in `desktop/`; packaging is in `electron-builder.yml`.
The sandboxed renderer has no Node access. A read-only loopback server serves
only bundled files at a stable origin; OPFS data persists between app upgrades.
Desktop builds disable the PWA service worker so an older shell cannot override
the installed version. Updates are manual. Initial installers are unsigned;
Apple notarization and Windows signing require maintainer credentials.

---

## What it does

| View | |
|---|---|
| **Overview** | World map of the site catalog; imported sites in the accent colour. Click a marker to open a site. Inspector summarizes actual observation dates, raw/spline meaning, spatial coverage and annual phenology files, with analysis shortcuts, catalog context and CRS. |
| **Time Series** | Per-pixel EVI "spaghetti", the bold daily mean and a shaded interquartile ribbon, per series. Year, series, date range and sample size are controls; the mean and quartiles are computed in SQL. A 3D ribbon renders the same filtered rows as a surface over date × pixel. |
| **Pixel Map** | Every pixel over a basemap. Click to toggle one, or drag a rectangle or lasso to take a group. Clicking a pixel shows its EVI sparkline. Selections flow into the Time Series view. A hexbin skyline is the 3D mode. |
| **Phenometrics** | The 24 NetCDF layers as a browsable table, rendered with the WetLSP palettes. One to four site-years compare side by side on a shared colour scale, as a plain figure, georeferenced on a basemap, or as an extruded 3D relief. |
| **Catalog** | The whole site catalog, searchable and sortable, with CSV export. |

Press <kbd>⌘K</kbd> (<kbd>Ctrl K</kbd>) for the command palette, or
<kbd>⌘1</kbd>–<kbd>⌘5</kbd> to switch views.

The workspace now defaults to light mode, with a quiet background, white
panels, restrained teal controls and a continuous inspector. Dark mode and an
explicit system-theme setting remain available.

---

## Data it accepts

Drop a site folder and it is recognised with no configuration. Matching is by
pattern, never by exact name, because the real exports mix `_` and `-`
separators.

**Single-file layout** (primary)

```
CA-DB2/
├── CA_DB2_pixels_geom.parquet        pixel_id, cell, x, y   (projected metres)
├── CA_DB2_pixels_meta.parquet        key/value; crs_wkt, site_id, radius_m, …
├── CA_DB2_pixels_timeseries.parquet  pixel_id, series, date, year, evi
├── CA-DB2-wetlsp-2021.nc             annual phenometrics, NetCDF-4
├── …
└── README_parquet.md / .json
```

**Batched layout** — a `pixels_*_ds/` directory of parquet parts is treated as
one logical table:

```
US-Myb/
├── pixels_geom_ds/geom_batch_001.parquet, …
├── pixels_timeseries_ds/ts_batch_001.parquet, …
├── pixels_meta_ds/meta.parquet
└── US-Myb-wetlsp-2022.nc
```

A folder with files missing still imports. The app says what is absent and
which views are affected, and everything else keeps working.

Pixel coordinates are projected metres, so they are reprojected to WGS84 using
the `crs_wkt` in `pixels_meta`: the EPSG id is used when the WKT carries one,
otherwise proj4 reads the WKT directly, otherwise the Transverse Mercator
parameters are rebuilt by hand.

---

## The site catalog

`public/catalog/wetlsp_site_catalog.csv` ships with the app so the Overview map
and the Catalog view work offline before anything is imported.

The bundled file is the real 95-site export from
`../wetlsp-data/wetlsp_cyverse_site_catalog_final.csv`. All 95 records have
coordinates. It is included in the offline app shell.

To replace it with an updated catalog:

```sh
npm run catalog:import -- /path/to/wetlsp_cyverse_site_catalog_final.csv
```

Users can also load one at runtime from **Settings → Site catalog**, which
overrides the bundled copy for that browser. See
[`public/catalog/README.md`](public/catalog/README.md) for the columns.

---

## Google Drive import (optional)

In Google Cloud, enable **Google Drive API** and **Google Picker API**. Create a
Web OAuth client and add every URL that serves this app under **Authorized
JavaScript origins**, including the exact scheme and port during development
(for example `http://localhost:5173`). Create a browser API key, restrict its
websites to the same origins, and restrict its APIs to Picker and Drive.

Configure the Google Auth Platform consent screen. While its audience is in
**Testing**, add each scientist's Google account as a test user. Testing grants
expire after seven days. Then copy `.env.example` to `.env.local`:

```sh
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=xxxxx
VITE_GOOGLE_APP_ID=123456789012        # numeric Cloud project number
VITE_GOOGLE_DRIVE_MODE=files
```

Restart Vite after changing an environment file; these values are embedded at
build time. They are identifiers and a browser-restricted API key, not a client
secret. Never put an OAuth client secret in this PWA.

`files` mode is the safe default. It requests Google's non-sensitive
`drive.file` scope and imports the files the user explicitly selects. Select all
files for a single-file WetLSP site. This mode cannot recursively enumerate a
selected folder, because sharing a folder does not share all of its children
with the app.

For real one-click folder import, including `_ds` sites with many parquet parts,
set `VITE_GOOGLE_DRIVE_MODE=folder`. The app then requests read-only access to
Drive and recursively downloads only the folder the user chooses. Google
classifies `drive.readonly` as a restricted scope. A lab deployment can remain
Internal (Google Workspace) or use a limited Testing audience; a public External
deployment must complete Google's verification requirements.

Without configuration—or while offline—the Drive button is disabled and
explains why. Common errors:

- `origin_mismatch`: add the browser's exact origin to the Web OAuth client.
- `API_KEY_INVALID` / forbidden Picker: enable both APIs and check key website/API restrictions.
- `access_denied`: add the account as a test user or allow the app in Workspace Admin.
- Folder listing returns 403/404: use folder mode, rebuild, and grant `drive.readonly`.

---

## How it stays fast

CA-DB2 has 27,875,304 time-series rows. The browser **never materialises the
entire table**: chart queries filter before returning rows, while metadata and
per-pixel aggregates return only their small grouped results.

- Every chart query carries a year, a series and an explicit pixel list, and a
  row `LIMIT`. The builders in `src/engine/sql.ts` throw
  `UnboundedQueryError` rather than emit anything looser, and
  `src/engine/sql.test.ts` is the guardrail.
- The mean and the quartiles are aggregated in SQL, so the ribbon costs the same
  for 250 pixels or 5000.
- Parquet files are registered with DuckDB as OPFS file handles, so a 190 MB
  table is range-read, never loaded.
- Queries show loading progress and expose cancellation; cancellation during
  a real query is not yet covered by browser acceptance.
- NetCDF reading, raster pooling and reprojection run in workers. Plotly still
  paints on the main thread.
- Large spaghetti plots retain every sampled pixel but simplify trajectories
  to at most 50,000 vertices, preserving endpoints and local extrema. A notice
  identifies this preview; daily means, quartiles and CSV use every observation.
  Default 250-pixel charts remain at full resolution.
- Pixel geometry is reprojected once per site and cached in OPFS.

Caps, all adjustable in the UI: 250 sampled pixels by default (max 5000), 500
selected pixels, a 50,000-cell raster budget.

On the reference CA-DB2 files, 13,955 pixels read and reproject in about 62 ms. Tested
5,000-pixel charts draw 806,412 and 1,825,000 queried rows in 2.7–2.8 seconds,
including a 0.5–0.7 second main-thread paint pause.

---

## Offline

The app shell — including the Plotly bundle and the h5wasm NetCDF reader — is
precached by the service worker, so every view works with no network. The
34 MB DuckDB-WASM binary is deliberately *not* precached: it would make
installing unbearable. Both the worker JavaScript and the WASM are explicitly
saved to Cache Storage the first time the query engine starts, including a first
visit that is not yet controlled by the service worker.
**Settings → Prepare for offline use** verifies the offline shell and saves both
engine files before reporting success. It also asks the browser to make storage
persistent and reports whether the browser granted that request.

Basemap tiles are cached as you browse. With no network the maps fall back to a
plain background; pixel positions stay correct.
Light/dark basemaps use OpenFreeMap; satellite imagery uses Esri.

---

## Layout

```
src/
├── engine/       DuckDB lifecycle, the query API, and the SQL builders
├── workers/      NetCDF (h5wasm) and reprojection/hit-testing workers
├── lib/          detection, OPFS, CRS, palettes, the layer dictionary, export
├── store/        the single Zustand store
├── views/        the five top-level views, each with its inspector
├── components/   layout, map, chart and raster primitives
└── sw.ts         the service worker
```

Domain rules ported verbatim from `app.R` live in `src/lib/layers.ts` (the
24-layer dictionary and `phenometricScaleType`) and `src/lib/colorscales.ts`
(the timing rainbow, the greens, the four QA greys, viridis) — with tests
pinning the palettes, the valid ranges and the scale/fill handling.

---

## Browser support

Desktop-first: current Chrome and Edge are the supported targets. The app needs
the Origin Private File System; it says so plainly if it is missing. Phones are
not optimised.
