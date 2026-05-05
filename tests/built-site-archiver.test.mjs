import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  BUILT_SITES_ARCHIVE_NAME,
  BUILT_SITES_DIRECTORY_NAME,
  BuiltSiteArchiver,
  buildMovePlan,
  ensureReadyDestination,
  findBuiltSites,
  findDuplicateDomains,
} from '../scripts/lib/built-site-archiver.mjs';

async function createBuiltSiteFixture(outputsDirectory, runName, domain) {
  const builtDirectory = path.join(outputsDirectory, runName, domain, domain);

  await fs.mkdir(builtDirectory, { recursive: true });
  await fs.writeFile(path.join(builtDirectory, 'index.html'), '<!doctype html>', 'utf8');

  return builtDirectory;
}

test('findBuiltSites finds nested domain build folders and skips destination folder', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'built-sites-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const outputsDirectory = path.join(root, 'outputs');

  const firstSource = await createBuiltSiteFixture(outputsDirectory, 'AA 01.05 US (Topic)', 'example-a.com');
  const secondSource = await createBuiltSiteFixture(outputsDirectory, 'BB 02.05 US (Topic)', 'example-b.com');
  await fs.mkdir(path.join(outputsDirectory, BUILT_SITES_DIRECTORY_NAME, 'already-packed.com'), { recursive: true });
  await fs.mkdir(path.join(outputsDirectory, 'AA 01.05 US (Topic)', 'notes'), { recursive: true });

  const sites = await findBuiltSites(outputsDirectory);

  assert.deepEqual(sites.map((site) => site.domain), ['example-a.com', 'example-b.com']);
  assert.deepEqual(sites.map((site) => site.sourceDirectory), [firstSource, secondSource]);
});

test('findDuplicateDomains reports duplicate built site domains', async () => {
  const duplicates = findDuplicateDomains([
    { domain: 'example-a.com', sourceDirectory: '/one/example-a.com' },
    { domain: 'example-b.com', sourceDirectory: '/one/example-b.com' },
    { domain: 'example-a.com', sourceDirectory: '/two/example-a.com' },
  ]);

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].domain, 'example-a.com');
  assert.deepEqual(duplicates[0].matches.map((match) => match.sourceDirectory), [
    '/one/example-a.com',
    '/two/example-a.com',
  ]);
});

test('buildMovePlan maps built folders to outputs built-sites domain folders', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'built-sites-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const outputsDirectory = path.join(root, 'outputs');
  const sourceDirectory = await createBuiltSiteFixture(outputsDirectory, 'AA 01.05 US (Topic)', 'example.com');

  const movePlan = await buildMovePlan(outputsDirectory, [{
    domain: 'example.com',
    sourceDirectory,
  }]);

  assert.equal(movePlan[0].destinationDirectory, path.join(
    outputsDirectory,
    BUILT_SITES_DIRECTORY_NAME,
    'example.com',
  ));
});

test('ensureReadyDestination rejects existing archive and non-empty destination', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'built-sites-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const destinationDirectory = path.join(root, BUILT_SITES_DIRECTORY_NAME);
  const archivePath = path.join(root, BUILT_SITES_ARCHIVE_NAME);

  await fs.mkdir(destinationDirectory, { recursive: true });
  await fs.writeFile(path.join(destinationDirectory, 'example.com'), 'x', 'utf8');

  await assert.rejects(
    () => ensureReadyDestination(destinationDirectory, archivePath),
    /Destination directory is not empty/,
  );

  await fs.rm(destinationDirectory, { recursive: true, force: true });
  await fs.writeFile(archivePath, 'zip', 'utf8');

  await assert.rejects(
    () => ensureReadyDestination(destinationDirectory, archivePath),
    /Archive already exists/,
  );
});

test('BuiltSiteArchiver moves built folders and calls archive creation', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'built-sites-'));
  t.after(() => fs.rm(projectDirectory, { recursive: true, force: true }));
  const outputsDirectory = path.join(projectDirectory, 'outputs');
  const sourceDirectory = await createBuiltSiteFixture(outputsDirectory, 'AA 01.05 US (Topic)', 'example.com');
  const writes = [];
  const archiveCalls = [];
  const archiver = new BuiltSiteArchiver({
    projectDirectory,
    output: { write: (value) => writes.push(value) },
    zipArchive: async (directory) => {
      archiveCalls.push(directory);
    },
  });

  const summary = await archiver.run();

  assert.equal(archiveCalls[0], outputsDirectory);
  assert.equal(summary.moved.length, 1);
  await assert.rejects(() => fs.stat(sourceDirectory), /ENOENT/);
  const movedIndex = await fs.readFile(
    path.join(outputsDirectory, BUILT_SITES_DIRECTORY_NAME, 'example.com', 'index.html'),
    'utf8',
  );
  assert.equal(movedIndex, '<!doctype html>');
  assert.match(writes.join(''), /Moved example\.com/);
});
