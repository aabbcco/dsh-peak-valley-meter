import assert from 'node:assert/strict';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export async function releaseFiles(root) {
  const files = ['package.json', 'cordis.patch.yml', 'dsh.plugin.json', 'README.md', 'LICENSE', 'icon.svg'];
  const walk = async (relative) => {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      assert(!entry.isSymbolicLink(), `Release files must not be symlinks: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files.push(name);
      else assert.fail(`Unsupported release file: ${name}`);
    }
  };
  await walk('lib');
  await walk('locale');
  return files.sort();
}

export function runNode(args, cwd = projectRoot) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Node command failed: ${args.join(' ')}`);
}

export async function validateProject(root = projectRoot) {
  const files = await releaseFiles(root);
  for (const file of files) {
    assert((await lstat(path.join(root, file))).isFile(), `Missing regular release file: ${file}`);
    assert(!/(^|\/)(node_modules|test|scripts|\.git)(\/|$)|(^|\/)\.|\.(?:log|tmp|tgz|pem|key)$/.test(file), `Unexpected release file: ${file}`);
  }
  const json = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
  const manifest = await json('package.json');
  assert.match(manifest.name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.dsh?.client?.platform, 'web');
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml');
  const targets = (value) => typeof value === 'string' ? [value] : Object.values(value ?? {}).flatMap(targets);
  const exported = Object.values(manifest.exports ?? {}).flatMap(targets);
  for (const target of exported) {
    assert(target.startsWith('./') && !target.includes('..', 2) && !target.includes('\\'), `Unsafe export: ${target}`);
    const relative = target.slice(2);
    const escaped = relative.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]+');
    const matcher = new RegExp(`^${escaped}$`);
    assert(files.some((file) => matcher.test(file)), `Missing exported resource: ${target}`);
  }
  for (const key of ['.', './client', './icon', './locale/*.json', './cordis.patch.yml']) {
    assert(manifest.exports?.[key], `Missing export: ${key}`);
  }
  assert.equal(manifest.main, 'lib/index.js');
  const metadata = await json('dsh.plugin.json');
  assert.equal(metadata.name, manifest.name, 'Plugin metadata package name differs');
  assert.equal(metadata.version, manifest.version, 'Plugin metadata version differs');
  const patch = await readFile(path.join(root, 'cordis.patch.yml'), 'utf8');
  const escapedName = manifest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert(new RegExp(`^\\s+name:\\s*['\"]?${escapedName}['\"]?\\s*$`, 'm').test(patch), 'Bundle patch does not mount this package');
  for (const locale of ['en', 'zh']) {
    const { meta } = await json(`locale/${locale}.json`);
    assert(typeof meta?.title === 'string' && meta.title.trim(), `Missing ${locale} title`);
    assert(typeof meta?.description === 'string' && meta.description.trim(), `Missing ${locale} description`);
  }
  const icon = await readFile(path.join(root, 'icon.svg'));
  assert(icon.byteLength <= 256 * 1024 && /<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(icon.toString()), 'Invalid SVG resource');
  for (const file of files.filter((file) => file.endsWith('.js'))) runNode(['--check', file], root);
  const client = await readFile(path.join(root, 'lib/client.js'), 'utf8');
  let declaration;
  new vm.Script(client, { filename: 'lib/client.js' }).runInNewContext({ window: { __ModuleLoader__: { load(value) {
    assert.equal(declaration, undefined, 'Client must register exactly one factory');
    declaration = value;
  } } } }, { timeout: 1000 });
  assert.equal(declaration?.id, manifest.name, 'Client factory id differs from package name');
  assert.equal(typeof declaration?.factory, 'function', 'Client factory is missing');
  return { manifest, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { manifest, files } = await validateProject();
    console.log(`Validated ${manifest.name}@${manifest.version}: ${files.length} release files, exports, locales, bundle and client factory.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
