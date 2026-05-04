import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  REQUIRED_DOMAIN_DIRECTORIES,
  REQUIRED_DOMAIN_FILES,
} from '../scripts/lib/config.mjs';
import { OutputValidator } from '../scripts/lib/output-validator.mjs';

async function createDomainFixture(root, domain, missing = new Set()) {
  const domainDirectory = path.join(root, domain);

  await fs.mkdir(domainDirectory, { recursive: true });
  await fs.writeFile(path.join(domainDirectory, 'promt.txt'), 'prompt', 'utf8');

  for (const directoryName of REQUIRED_DOMAIN_DIRECTORIES) {
    const expectedName = directoryName === '<domain>' ? domain : directoryName;

    if (!missing.has(`${expectedName}/`)) {
      await fs.mkdir(path.join(domainDirectory, expectedName), { recursive: true });
    }
  }

  for (const fileName of REQUIRED_DOMAIN_FILES) {
    if (!missing.has(fileName)) {
      await fs.writeFile(path.join(domainDirectory, fileName), 'x', 'utf8');
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

test('OutputValidator reports missing required files and folders', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-validator-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createDomainFixture(root, 'example.com', new Set(['src/', 'vite.config.ts']));
  const validator = new OutputValidator({ write: () => {} });
  const summary = await validator.validate(root);

  assert.equal(summary.successes.length, 0);
  assert.equal(summary.failures.length, 1);
  assert.deepEqual(summary.failures[0].missing.sort(), ['src/', 'vite.config.ts']);
});
