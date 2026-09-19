import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electron from 'electron';

const executable = process.argv[2] || electron;
const args = process.argv[2] ? ['--smoke-test'] : ['.', '--smoke-test'];
const profile = await mkdtemp(join(tmpdir(), 'wetlsp-desktop-smoke-'));
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
try {
  for (const pass of [0, 1]) {
    await new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        stdio: 'inherit',
        env: { ...environment, WETLSP_SMOKE_PROFILE: profile, WETLSP_SMOKE_EXPECT_PERSISTED: String(pass) },
      });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Desktop smoke timed out')); }, 90000);
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Desktop smoke exited ' + code)); });
    });
  }
} finally { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }); }
