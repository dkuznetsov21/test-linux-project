import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { OutputValidator } from '../scripts/lib/output-validator.mjs';

async function createDomainFixture(root, domain, options = {}) {
  const domainDirectory = path.join(root, domain);

  await fs.mkdir(domainDirectory, { recursive: true });
  await fs.writeFile(path.join(domainDirectory, 'promt.txt'), 'prompt', 'utf8');

  if (options.createBuildDirectory !== false) {
    const buildDirectory = path.join(domainDirectory, domain);

    await fs.mkdir(buildDirectory, { recursive: true });

    if (options.emptyBuildDirectory !== true) {
      await fs.writeFile(path.join(buildDirectory, 'index.html'), 'x', 'utf8');
    }
  }

  return domainDirectory;
}

test('OutputValidator reports valid domain output', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-validator-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createDomainFixture(root, 'example.com');
  const writes = [];
  const validator = new OutputValidator({ write: (value) => writes.push(value) });
  const summary = await validator.validate(root);

  assert.equal(summary.successes.length, 1);
  assert.equal(summary.failures.length, 0);
  assert.match(writes.join(''), /1 valid, 0 invalid/);
});

test('OutputValidator reports missing built site folder', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-validator-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createDomainFixture(root, 'example.com', { createBuildDirectory: false });
  const validator = new OutputValidator({ write: () => {} });
  const summary = await validator.validate(root);

  assert.equal(summary.successes.length, 0);
  assert.equal(summary.failures.length, 1);
  assert.deepEqual(summary.failures[0].missing, ['example.com/']);
});

test('OutputValidator reports empty built site folder', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-validator-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createDomainFixture(root, 'example.com', { emptyBuildDirectory: true });
  const validator = new OutputValidator({ write: () => {} });
  const summary = await validator.validate(root);

  assert.equal(summary.successes.length, 0);
  assert.equal(summary.failures.length, 1);
  assert.deepEqual(summary.failures[0].missing, ['example.com/']);
});

test('OutputValidator validates exact prompt folders before agent runs', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-validator-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(root, 'example-a.com'), { recursive: true });
  await fs.writeFile(path.join(root, 'example-a.com', 'promt.txt'), 'prompt', 'utf8');
  await fs.mkdir(path.join(root, 'unexpected.com'), { recursive: true });
  await fs.writeFile(path.join(root, 'unexpected.com', 'promt.txt'), 'prompt', 'utf8');

  const validator = new OutputValidator({ write: () => {} });
  const summary = await validator.validatePromptFolders(root, ['example-a.com', 'example-b.com']);

  assert.equal(summary.ok, false);
  assert.deepEqual(summary.missingDirectories, ['example-b.com']);
  assert.deepEqual(summary.missingPrompts, []);
  assert.deepEqual(summary.unexpectedDirectories, ['unexpected.com']);
});

test('OutputValidator reports missing prompt in existing domain folder', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-validator-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(root, 'example.com'), { recursive: true });

  const validator = new OutputValidator({ write: () => {} });
  const summary = await validator.validatePromptFolders(root, ['example.com']);

  assert.equal(summary.ok, false);
  assert.deepEqual(summary.missingDirectories, []);
  assert.deepEqual(summary.missingPrompts, ['example.com']);
  assert.deepEqual(summary.unexpectedDirectories, []);
});
