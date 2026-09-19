/**
 * Validates a WetLSP site-catalog CSV and installs it as the bundled catalog.
 *   npm run catalog:import -- /path/to/wetlsp_cyverse_site_catalog_final.csv
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dest = resolve(here, '../public/catalog/wetlsp_site_catalog.csv');
const src = process.argv[2];

if (!src) {
  console.error('usage: npm run catalog:import -- <path-to-catalog.csv>');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
}

const text = readFileSync(resolve(process.cwd(), src), 'utf8');
const rows = parseCsv(text);
if (rows.length < 2) {
  console.error('catalog:import: the file has no data rows.');
  process.exit(1);
}

const header = rows[0].map((h) => h.trim().toLowerCase());
const idIdx = header.findIndex((h) => h === 'site_id' || h === 'siteid' || h === 'site');
if (idIdx === -1) {
  console.error(`catalog:import: no "site_id" column. Found: ${header.join(', ')}`);
  process.exit(1);
}
const latIdx = header.findIndex((h) => h === 'lat' || h === 'latitude');
const lonIdx = header.findIndex((h) => h === 'lon' || h === 'long' || h === 'longitude');

const data = rows.slice(1).filter((r) => (r[idIdx] ?? '').trim() !== '');
let mappable = 0;
let outOfRange = 0;
for (const r of data) {
  const lat = Number(r[latIdx]);
  const lon = Number(r[lonIdx]);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    mappable++;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) outOfRange++;
  }
}

const yearCols = header.filter((h) => /^wetlsp[_-]?\d{4}$/.test(h));

writeFileSync(dest, text);
console.log(`catalog:import: installed ${data.length} sites into public/catalog/`);
console.log(`  mappable (lat+lon present): ${mappable}`);
if (outOfRange) console.log(`  WARNING: ${outOfRange} row(s) have out-of-range coordinates`);
console.log(`  availability columns: ${yearCols.length ? yearCols.join(', ') : 'none found'}`);
