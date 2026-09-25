/**
 * Upload the sample sites the app's "Download sample sites" button fetches.
 *
 *   npm run samples            # 1. extract ../Actual Data/*.zip into samples/
 *   npm run samples:publish    # 2. upload them as a public GitHub release
 *
 * Each site file becomes one release asset named `<site>--<file>`, plus an
 * `index.json` listing them. The app also bundles a copy of that index
 * (src/lib/sample-index.json, written here), so the button works without a
 * network round trip and the app knows sizes before downloading.
 *
 * Requires the GitHub CLI (`gh auth login`). Re-running re-uploads (--clobber).
 */
import { execFileSync } from 'node:child_process';
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.SAMPLES_REPO ?? 'bhagyeshsagole/wetlsp-sample-data';
const TAG = process.env.SAMPLES_TAG ?? 'v1';
const SRC = join(ROOT, 'samples');

const gh = (...args) => execFileSync('gh', args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();

const index = JSON.parse(readFileSync(join(SRC, 'index.json'), 'utf8'));
const stage = join(tmpdir(), `wetlsp-samples-${Date.now()}`);
mkdirSync(stage, { recursive: true });

const assets = [];
for (const site of index.sites) {
  for (const f of site.files) {
    if (f.path.includes('/')) throw new Error(`Nested sample files are not supported: ${site.siteId}/${f.path}`);
    f.asset = `${site.siteId}--${f.path}`;
    // Hard links: no second 1.3 GB copy on disk.
    linkSync(join(SRC, site.siteId, f.path), join(stage, f.asset));
    assets.push(join(stage, f.asset));
  }
}
const published = { version: 1, repo: REPO, tag: TAG, sites: index.sites };
writeFileSync(join(stage, 'index.json'), JSON.stringify(published, null, 2));
writeFileSync(join(ROOT, 'src/lib/sample-index.json'), `${JSON.stringify(published, null, 2)}\n`);

try {
  gh('repo', 'view', REPO);
} catch {
  gh('repo', 'create', REPO, '--public', '--description', 'Sample WetLSP sites downloaded by WetLSP Explorer');
}
try {
  gh('release', 'view', TAG, '--repo', REPO);
} catch {
  gh('release', 'create', TAG, '--repo', REPO, '--title', `Sample sites ${TAG}`,
    '--notes', index.sites.map((s) => `- **${s.siteId}**: ${s.name}. ${s.description}`).join('\n'));
}

// A few files per call keeps a failed upload cheap to retry.
const batch = [join(stage, 'index.json'), ...assets];
for (let i = 0; i < batch.length; i += 5) {
  const part = batch.slice(i, i + 5);
  console.log(`uploading ${i + part.length}/${batch.length}`);
  gh('release', 'upload', TAG, ...part, '--repo', REPO, '--clobber');
}
rmSync(stage, { recursive: true, force: true });
console.log(`\nPublished ${assets.length} files to https://github.com/${REPO}/releases/tag/${TAG}`);
