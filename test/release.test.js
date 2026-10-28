import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateRelease, verifyBuild, needsPublish, publishArgs } from '../scripts/ci-release.mjs';

const manifest = { name: 'dsh-peak-valley-meter', version: '0.3.1', publishConfig: { registry: 'https://registry.npmjs.org/' } };
const metadata = { name: manifest.name, version: manifest.version };
const event = { action: 'published', release: { tag_name: 'v0.3.1', draft: false, prerelease: false } };
const release = validateRelease(manifest, metadata, event);
const bytes = Buffer.from('a fixed release archive');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const build = { name: release.name, version: release.version, archive: release.archive, bytes: bytes.length, sha256 };
const checksums = `${sha256}  ${release.archive}\n`;
const verified = verifyBuild(release, build, bytes, checksums);

test('published stable releases target latest and prereleases target next', () => {
  assert.equal(release.npmTag, 'latest');
  const version = '0.3.2-rc.1';
  const pre = validateRelease({ ...manifest, version }, { ...metadata, version }, {
    ...event, release: { ...event.release, tag_name: `v${version}`, prerelease: true },
  });
  assert.equal(pre.npmTag, 'next');
  assert.equal(pre.archive, 'dsh-peak-valley-meter-0.3.2-rc.1.tgz');
});

test('release guard rejects drafts, wrong tags, metadata mismatch and wrong channels', () => {
  for (const overrides of [{ draft: true }, { tag_name: 'v0.3.0' }, { tag_name: '0.3.1' },
    { tag_name: 'v0.3.1\nmalicious=1' }, { prerelease: true }]) {
    assert.throws(() => validateRelease(manifest, metadata, { ...event, release: { ...event.release, ...overrides } }));
  }
  assert.throws(() => validateRelease(manifest, metadata, { ...event, action: 'created' }));
  assert.throws(() => validateRelease(manifest, { ...metadata, version: '0.3.0' }, event));
  assert.throws(() => validateRelease({ ...manifest, publishConfig: { registry: 'https://other.example/' } }, metadata, event));
  for (const version of ['01.2.3', '1.2', '1.2.3-01', '1.2.3-']) {
    assert.throws(() => validateRelease({ ...manifest, version }, { ...metadata, version }, { ...event, release: { ...event.release, tag_name: `v${version}` } }));
  }
});

test('verification rejects modified archives, mismatched versions and unsafe archive paths', () => {
  assert.equal(verified.sha256, sha256);
  assert.match(verified.integrity, /^sha512-/);
  assert.throws(() => verifyBuild(release, build, Buffer.from('modified bytes'), checksums));
  assert.throws(() => verifyBuild(release, { ...build, version: '0.0.0' }, bytes, checksums));
  assert.throws(() => verifyBuild(release, { ...build, archive: '../other.tgz' }, bytes, checksums));
  assert.throws(() => verifyBuild(release, build, bytes, 'wrong checksum'));
});

test('only an absent npm version permits a new publication', async () => {
  assert.equal(await needsPublish(verified, async url => {
    assert.equal(url, 'https://registry.npmjs.org/dsh-peak-valley-meter/0.3.1');
    return new Response(null, { status: 404 });
  }), true);
  assert.equal(await needsPublish(verified, async () => Response.json({ dist: { integrity: verified.integrity } })), false);
});

test('npm failures and existing different contents never become permission to republish', async () => {
  await assert.rejects(needsPublish(verified, async () => new Response(null, { status: 503 })), /lookup failed/);
  await assert.rejects(needsPublish(verified, async () => Response.json({ dist: { integrity: 'sha512-different' } })), /different contents/);
  await assert.rejects(needsPublish(verified, async () => { throw new Error('offline'); }), /offline/);
});

test('publication uses the verified tarball, explicit channel and provenance without lifecycle scripts', () => {
  assert.deepEqual(publishArgs(verified), ['publish', './dist/dsh-peak-valley-meter-0.3.1.tgz',
    '--access', 'public', '--tag', 'latest', '--provenance', '--ignore-scripts', '--registry', 'https://registry.npmjs.org/']);
});
