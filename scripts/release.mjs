import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot, runNode } from './check.mjs';

const REGISTRY = 'https://registry.npmjs.org/';

function npm(args, capture = false) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    ...args, '--registry', REGISTRY, '--cache', 'dist/.npm-cache',
  ], { cwd: projectRoot, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32', timeout: capture ? 30_000 : 120_000 });
  if (result.error) throw result.error;
  return result;
}

async function release() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 1 && args[0] === '--dry-run'), 'Usage: node scripts/release.mjs [--dry-run]');
  const dryRun = args.includes('--dry-run');
  runNode(['scripts/build.mjs']);
  const manifest = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  const build = JSON.parse(await readFile(path.join(projectRoot, 'dist/build-info.json'), 'utf8'));
  assert.equal(build.name, manifest.name);
  assert.equal(build.version, manifest.version);
  assert.equal(path.basename(build.archive), build.archive);
  const archive = path.join(projectRoot, 'dist', build.archive);
  const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
  assert.equal(hash, build.sha256, 'Release archive checksum mismatch');
  if (!dryRun) {
    const identity = npm(['whoami'], true);
    assert.equal(identity.status, 0, 'npm login is unavailable or expired. Run: npm login --registry=https://registry.npmjs.org/');
    console.log(`Publishing ${manifest.name}@${manifest.version} as ${identity.stdout.trim()} to ${REGISTRY}`);
  }
  const result = npm(['publish', `./dist/${build.archive}`, '--access', 'public', '--ignore-scripts', ...(dryRun ? ['--dry-run'] : [])]);
  assert.equal(result.status, 0, dryRun ? 'npm publish dry-run failed' : 'npm publish failed; check authentication, package ownership, version and 2FA requirements');
  console.log(dryRun ? '\nDry-run completed; nothing was published.' : `\nPublished ${manifest.name}@${manifest.version}.`);
}

try { await release(); }
catch (error) { console.error(`Release failed: ${error.message}`); process.exitCode = 1; }
