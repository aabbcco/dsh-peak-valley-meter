import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, releaseFiles, validateProject } from '../scripts/check.mjs';

async function fixture(operation) {
  const root = await realpath(projectRoot);
  const directory = await mkdtemp(path.join(root, '.build-test-'));
  try {
    for (const file of await releaseFiles(root)) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await copyFile(path.join(root, file), path.join(directory, file));
    }
    await operation(directory);
  } finally {
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), root);
    assert(path.basename(resolved).startsWith('.build-test-'));
    await rm(resolved, { recursive: true });
  }
}

const readManifest = async (root) => JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const saveManifest = (root, value) => writeFile(path.join(root, 'package.json'), JSON.stringify(value));

test('release selection includes every runtime resource and omits development files', async () => {
  const files = await releaseFiles(projectRoot);
  assert(files.includes('LICENSE'));
  assert(files.includes('lib/usage.js'));
  assert(files.includes('locale/zh.json'));
  assert(!files.some((file) => /^(?:scripts|test|node_modules|dist)\//.test(file)));
});

test('build rejects missing resources and exports outside the package', () => fixture(async (root) => {
  const manifest = await readManifest(root);
  manifest.exports['./icon'] = './missing-icon.svg';
  await saveManifest(root, manifest);
  await assert.rejects(validateProject(root), /Missing exported resource/);
  manifest.exports['./icon'] = '../outside.svg';
  await saveManifest(root, manifest);
  await assert.rejects(validateProject(root), /Unsafe export/);
}));

test('build rejects package metadata and Client factory identity mismatches', () => fixture(async (root) => {
  const metadataPath = path.join(root, 'dsh.plugin.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  await writeFile(metadataPath, JSON.stringify({ ...metadata, version: '0.0.0' }));
  await assert.rejects(validateProject(root), /metadata version differs/);
  await writeFile(metadataPath, JSON.stringify(metadata));
  const manifest = await readManifest(root);
  await writeFile(path.join(root, 'lib/client.js'), `window.__ModuleLoader__.load({id:'wrong-package',factory:()=>({})});`);
  await assert.rejects(validateProject(root), /Client factory id differs/);
  await writeFile(path.join(root, 'lib/client.js'), `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory:()=>({})});`);
  const checked = await validateProject(root);
  assert.equal(checked.manifest.name, manifest.name);
}));
