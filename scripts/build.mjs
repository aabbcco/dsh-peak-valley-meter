import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot, runNode, validateProject } from './check.mjs';

async function build() {
  const root = await realpath(projectRoot);
  console.log('Checking plugin sources and release resources…');
  const { manifest, files } = await validateProject(root);
  const tests = (await readdir(path.join(root, 'test'))).filter((file) => file.endsWith('.test.js')).sort();
  assert(tests.length, 'No regression tests were found');
  runNode(['--test', ...tests.map((file) => `test/${file}`)], root);

  // Only the dedicated output directory may be replaced. Refuse symlink targets.
  const dist = path.join(root, 'dist');
  try { assert((await lstat(dist)).isDirectory() && !(await lstat(dist)).isSymbolicLink(), 'dist must be a regular directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dist, { recursive: true });
  assert.equal(await realpath(dist), dist, 'Output path must stay inside the project');
  const stage = path.join(dist, 'package');
  try {
    const stat = await lstat(stage);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Staging path must be a regular directory');
    assert.equal(await realpath(stage), path.join(root, 'dist', 'package'));
    console.log(`Replacing owned build output: ${stage}`);
    await rm(stage, { recursive: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(stage);

  for (const file of files) {
    const target = path.join(stage, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, file), target);
  }
  // A release has no development hooks: installing it never runs our build/tests.
  const releaseManifest = structuredClone(manifest);
  delete releaseManifest.scripts;
  delete releaseManifest.devDependencies;
  await writeFile(path.join(stage, 'package.json'), JSON.stringify(releaseManifest, null, 2) + '\n');
  await validateProject(stage);

  const packed = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'pack', '.', '--json', '--ignore-scripts', '--offline', '--pack-destination', '..', '--cache', '../.npm-cache',
  ], { cwd: stage, encoding: 'utf8', shell: process.platform === 'win32', timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024, env: { ...process.env, npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false' } });
  if (packed.error) throw packed.error;
  assert.equal(packed.status, 0, `npm pack failed: ${packed.stderr}`);
  const result = JSON.parse(packed.stdout);
  assert.equal(result.length, 1, 'Expected one release archive');
  const info = result[0];
  assert.equal(info.filename, path.basename(info.filename), 'Invalid archive filename');
  const archivedFiles = info.files.map((file) => file.path).sort();
  assert.deepEqual(archivedFiles, files, 'Archive contains unexpected or missing files');
  const archive = path.join(dist, info.filename);
  const bytes = await readFile(archive);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(dist, 'SHA256SUMS.txt'), `${sha256}  ${info.filename}\n`);
  const buildInfo = { name: manifest.name, version: manifest.version, builtAt: new Date().toISOString(),
    node: process.version, archive: info.filename, bytes: bytes.length, sha256, files: archivedFiles };
  await writeFile(path.join(dist, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n');
  console.log(`\nBuild complete: ${archive}`);
  console.log(`${archivedFiles.length} release files · ${bytes.length} bytes`);
  console.log(`SHA-256: ${sha256}`);
  console.log('Unpacked release: dist/package/');
}

try { await build(); }
catch (error) { console.error(`Build failed: ${error.message}`); process.exitCode = 1; }
