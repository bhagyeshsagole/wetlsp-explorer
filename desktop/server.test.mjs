import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { startServer } from './server.mjs';

test('desktop file server confines requests to bundled files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wetlsp-server-'));
  await writeFile(join(root, 'index.html'), '<h1>WetLSP</h1>');
  await writeFile(join(root, 'reader.wasm'), 'wasm');
  const server = await startServer(root, 0);
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await (await fetch(origin)).text(), '<h1>WetLSP</h1>');
    assert.equal((await fetch(origin + '/reader.wasm')).headers.get('Content-Type'), 'application/wasm');
    assert.equal((await fetch(origin, {method: 'POST'})).status, 405);
    const wrongHostStatus = await new Promise((resolve, reject) => {
      get(origin, { headers: { Host: 'example.com' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(wrongHostStatus, 403);
    assert.equal((await fetch(origin + '/..%2fsecret')).status, 403);
    assert.equal((await fetch(origin + '/missing.js')).status, 404);
    assert.equal((await fetch(origin, {method: 'HEAD'})).headers.get('Content-Length'), '15');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, {recursive: true, force: true});
  }
});

test('sample downloads proxy only named assets of the fixed release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wetlsp-server-'));
  await writeFile(join(root, 'index.html'), '<h1>WetLSP</h1>');
  // A stand-in for GitHub: one redirect, then the file, like release downloads.
  const { createServer } = await import('node:http');
  const seen = [];
  const upstream = createServer((req, res) => {
    seen.push(req.url);
    if (req.url === '/rel/CA-DSM--README.md') { res.writeHead(302, { Location: '/blob/readme' }).end(); return; }
    if (req.url === '/blob/readme') { res.writeHead(200, { 'Content-Length': 5 }).end('hello'); return; }
    res.writeHead(404).end();
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const releaseBase = `http://127.0.0.1:${upstream.address().port}/rel/`;
  const server = await startServer(root, 0, { releaseBase });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const ok = await fetch(origin + '/remote-samples/CA-DSM--README.md');
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'hello');
    assert.equal((await fetch(origin + '/remote-samples/missing.parquet')).status, 404);
    assert.equal((await fetch(origin + '/remote-samples/..%2f..%2fetc%2fpasswd')).status, 403);
    assert.equal((await fetch(origin + '/remote-samples/https:%2f%2fevil.example%2fx')).status, 403);
    assert.equal((await fetch(origin + '/remote-samples/a', { method: 'POST' })).status, 405);
    assert.ok(seen.every(u => u.startsWith('/rel/') || u.startsWith('/blob/')));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
    await rm(root, {recursive: true, force: true});
  }
});

test('sample downloads report offline when the release cannot be reached', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wetlsp-server-'));
  const server = await startServer(root, 0, { releaseBase: 'http://127.0.0.1:1/' });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(origin + '/remote-samples/CA-DSM--README.md')).status, 502);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, {recursive: true, force: true});
  }
});
