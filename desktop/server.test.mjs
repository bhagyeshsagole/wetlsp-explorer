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
