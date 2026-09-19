// electron-builder afterPack hook: ad-hoc sign the macOS bundle.
//
// electron-builder rewrites Resources/ after unpacking Electron, which breaks the
// ad-hoc signature the prebuilt binary ships with. On Apple Silicon an invalid
// signature is a hard failure, and macOS reports it as "is damaged and can't be
// opened" with no way past it. Re-signing with the ad-hoc identity ("-") restores a
// valid seal, so Gatekeeper falls back to the ordinary unidentified-developer prompt
// that Privacy & Security can clear. Real Developer ID signing would remove the
// prompt entirely; see SETUP.md.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MACHO_MAGIC = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe]);

function isMachO(file) {
  try {
    const fd = readFileSync(file, { flag: 'r' }).subarray(0, 4);
    return fd.length === 4 && MACHO_MAGIC.has(fd.readUInt32BE(0));
  } catch {
    return false;
  }
}

// Nested bundles and loose Mach-O files, deepest first: codesign seals a bundle by
// hashing what is inside it, so anything inside must already be signed.
function collectTargets(root) {
  const bundles = [];
  const binaries = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (/\.(app|framework)$/.test(entry.name)) bundles.push(full);
        walk(full);
      } else if (entry.isFile()) {
        if (/\.(dylib|so|node)$/.test(entry.name) || isMachO(full)) binaries.push(full);
      }
    }
  };
  walk(root);

  const byDepthDesc = (a, b) => b.split(path.sep).length - a.split(path.sep).length;
  // Loose binaries first so framework/helper bundles seal over signed contents.
  return [...binaries.sort(byDepthDesc), ...bundles.sort(byDepthDesc)];
}

function sign(target) {
  execFileSync(
    'codesign',
    ['--force', '--sign', '-', '--timestamp=none', '--preserve-metadata=entitlements', target],
    { stdio: 'pipe' },
  );
}

export default async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  statSync(appPath);

  const targets = collectTargets(appPath);
  for (const target of targets) {
    try {
      sign(target);
    } catch (error) {
      // Resource files that merely look like Mach-O are not code; skip them.
      const stderr = String(error.stderr ?? '');
      if (stderr.includes('is not an object file') || stderr.includes('unsupported format')) continue;
      throw new Error(`ad-hoc signing failed for ${target}\n${stderr || error.message}`);
    }
  }
  sign(appPath);

  // A bad seal here is exactly the "damaged" failure, so fail the build instead of
  // shipping a DMG nobody can open.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' });
  console.log(`  • ad-hoc signed and verified ${targets.length + 1} items in ${path.basename(appPath)}`);
}
