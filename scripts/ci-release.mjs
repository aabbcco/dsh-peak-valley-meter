import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const registry = 'https://registry.npmjs.org/';
const number = '(?:0|[1-9][0-9]*)';
const identifier = '(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)';
const versionPattern = new RegExp(`^${number}\\.${number}\\.${number}(?:-(${identifier}(?:\\.${identifier})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);

export function validateRelease(manifest, metadata, event) {
  assert.equal(event.action, 'published', 'Only a published Release can publish packages');
  assert.equal(event.release?.draft, false, 'Draft releases cannot publish packages');
  assert.equal(typeof event.release?.prerelease, 'boolean', 'Missing Release prerelease flag');
  assert.match(manifest.name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/);
  const version = versionPattern.exec(manifest.version);
  assert(version, 'Package version must be valid SemVer');
  assert.equal(event.release.tag_name, `v${manifest.version}`, 'Release tag must equal v<package version>');
  assert.equal(metadata.name, manifest.name, 'Plugin metadata name mismatch');
  assert.equal(metadata.version, manifest.version, 'Plugin metadata version mismatch');
  assert.equal(Boolean(version[1]), event.release.prerelease, 'SemVer prerelease and GitHub prerelease flag must agree');
  assert.equal(manifest.publishConfig?.registry, registry, 'Only the public npm registry is supported');
  return { name: manifest.name, version: manifest.version, tag: event.release.tag_name,
    npmTag: event.release.prerelease ? 'next' : 'latest',
    archive: `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz` };
}

export function verifyBuild(release, build, bytes, checksums) {
  assert.equal(build.name, release.name, 'Build package name mismatch');
  assert.equal(build.version, release.version, 'Build version mismatch');
  assert.equal(build.archive, release.archive, 'Unexpected release archive');
  assert.equal(build.bytes, bytes.length, 'Archive size mismatch');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(build.sha256, sha256, 'Archive checksum mismatch');
  assert.equal(checksums.trim(), `${sha256}  ${release.archive}`, 'Checksum file mismatch');
  return { ...release, sha256, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` };
}

export async function needsPublish(release, send = fetch) {
  const response = await send(`${registry}${encodeURIComponent(release.name)}/${encodeURIComponent(release.version)}`, {
    headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return true;
  assert.equal(response.status, 200, `npm version lookup failed: HTTP ${response.status}`);
  const published = await response.json();
  assert.equal(published.dist?.integrity, release.integrity,
    'This npm version already exists with different contents; bump the version instead of overwriting');
  return false;
}

export function publishArgs(release) {
  return ['publish', `./dist/${release.archive}`, '--access', 'public', '--tag', release.npmTag,
    '--provenance', '--ignore-scripts', '--registry', registry];
}

async function outputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const text = Object.entries(values).map(([key, value]) => {
    assert(!/[\r\n]/.test(String(value)), 'Output must be a single line');
    return `${key}=${value}\n`;
  }).join('');
  await appendFile(process.env.GITHUB_OUTPUT, text);
}

async function main() {
  const mode = process.argv[2];
  assert(['validate', 'verify', 'npm-status', 'publish'].includes(mode), 'Usage: node scripts/ci-release.mjs validate|verify|npm-status|publish');
  assert(process.env.GITHUB_EVENT_PATH, 'GITHUB_EVENT_PATH is required');
  const json = async file => JSON.parse(await readFile(file, 'utf8'));
  const release = validateRelease(await json(path.join(root, 'package.json')),
    await json(path.join(root, 'dsh.plugin.json')), await json(process.env.GITHUB_EVENT_PATH));
  if (mode === 'validate') {
    console.log(`Validated ${release.name}@${release.version} -> npm ${release.npmTag}`);
    return;
  }
  const verified = verifyBuild(release, await json(path.join(root, 'dist/build-info.json')),
    await readFile(path.join(root, 'dist', release.archive)), await readFile(path.join(root, 'dist/SHA256SUMS.txt'), 'utf8'));
  await outputs({ archive: verified.archive, version: verified.version, npm_tag: verified.npmTag });
  if (mode === 'verify') {
    console.log(`Verified ${verified.archive}: ${verified.sha256}`);
    return;
  }
  if (mode === 'npm-status') {
    const needed = await needsPublish(verified);
    await outputs({ publish_needed: String(needed) });
    console.log(needed ? 'Version is not yet on npm' : 'Identical archive is already published; skipping duplicate publication');
    return;
  }
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This entry point only publishes from GitHub Actions');
  assert(process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    'npm OIDC requires id-token: write on the publishing job');
  assert(!process.env.NPM_TOKEN && !process.env.NODE_AUTH_TOKEN, 'Use npm Trusted Publishing, not a long-lived token');
  const result = spawnSync('npm', publishArgs(verified), { cwd: root, stdio: 'inherit', timeout: 120_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'npm OIDC publication failed; check the package Trusted Publisher configuration');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Release failed: ${error.message}`); process.exitCode = 1; });
}
