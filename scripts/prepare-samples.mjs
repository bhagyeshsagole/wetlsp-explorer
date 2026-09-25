/**
 * Build `samples/` — the sites the desktop installer ships and loads on first
 * launch. Extracts the lab's Drive downloads and writes `samples/index.json`.
 *
 *   npm run samples                       # reads ../Actual Data/*.zip
 *   SAMPLES_SRC=/path/to/zips npm run samples
 *
 * Re-running replaces `samples/`. The folder is git-ignored (≈1.4 GB); only
 * `npm run desktop:dist` needs it, via electron-builder `extraResources`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, process.env.SAMPLES_SRC ?? '../Actual Data');
const OUT = join(ROOT, 'samples');

/** Order and wording chosen by the lab. Sites without a zip are skipped. */
const SITES = [
  { siteId: 'CA-DSM', name: 'Delta salt marsh', description: 'Tidal high marsh on Boundary Bay, British Columbia' },
  { siteId: 'FR-LGt', name: 'La Guette', description: 'Acidic fen in the Sologne, France, disturbed and invaded by purple moor-grass' },
  { siteId: 'BR-SM1', name: 'Cachoeira do Sul', description: 'Flooded rice paddy, Rio Grande do Sul, Brazil' },
  { siteId: 'US-BZF', name: 'Bonanza Creek fen', description: 'Rich fen in interior Alaska' },
  { siteId: 'CZ-Wet', name: 'Třeboň wet meadow', description: 'Wet sedge meadow, Czechia' },
];

function unzip(zip, into) {
  try {
    execFileSync('unzip', ['-q', '-o', zip, '-d', into], { stdio: 'inherit' });
  } catch {
    // Windows 10+ ships bsdtar, which reads zip archives.
    execFileSync('tar', ['-xf', zip, '-C', into], { stdio: 'inherit' });
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.name.startsWith('.') || e.name === '__MACOSX') return [];
    return e.isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(SRC)) {
  console.error(`No sample source folder at ${SRC}. Set SAMPLES_SRC.`);
  process.exit(1);
}
const zips = readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.zip'));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const sites = [];
for (const site of SITES) {
  const mine = zips.filter((z) => z.startsWith(`${site.siteId}-`) || z === `${site.siteId}.zip`);
  if (mine.length === 0) {
    console.warn(`skip ${site.siteId}: no zip in ${SRC}`);
    continue;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'wetlsp-sample-'));
  for (const z of mine) unzip(join(SRC, z), scratch);
  // Drive zips hold one top-level folder named after the site.
  const inner = existsSync(join(scratch, site.siteId)) ? join(scratch, site.siteId) : scratch;
  const dest = join(OUT, site.siteId);
  renameSync(inner, dest);
  rmSync(scratch, { recursive: true, force: true });

  const files = walk(dest).map((p) => ({ path: relative(dest, p).split('\\').join('/'), size: statSync(p).size }));
  const bytes = files.reduce((n, f) => n + f.size, 0);
  sites.push({ ...site, bytes, files });
  console.log(`${site.siteId}: ${files.length} files, ${(bytes / 1024 ** 2).toFixed(0)} MB`);
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify({ version: 1, sites }, null, 2));
const total = sites.reduce((n, s) => n + s.bytes, 0);
console.log(`\n${sites.length} sample sites, ${(total / 1024 ** 3).toFixed(2)} GB → ${relative(ROOT, OUT)}/`);
