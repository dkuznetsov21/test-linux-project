import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cleanDomainDirectoryPreservingPrompt,
  copyTemplateSkeleton,
  findTemplateDomainReferences,
} from '../scripts/lib/fast-template-workflow.mjs';

async function createJob(root, domain, prompt = `Prompt for ${domain}`) {
  const domainDirectory = path.join(root, domain);

  await fs.mkdir(domainDirectory, { recursive: true });
  await fs.writeFile(path.join(domainDirectory, 'promt.txt'), prompt, 'utf8');

  return {
    domain,
    domainDirectory,
    logPath: path.join(domainDirectory, 'agent-output.log'),
    promptPath: path.join(domainDirectory, 'promt.txt'),
  };
}

test('cleanDomainDirectoryPreservingPrompt keeps only promt.txt', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fast-template-clean-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const job = await createJob(root, 'target.com');

  await fs.writeFile(path.join(job.domainDirectory, 'package.json'), '{}', 'utf8');
  await fs.mkdir(path.join(job.domainDirectory, 'src'), { recursive: true });
  await fs.writeFile(path.join(job.domainDirectory, 'src', 'main.js'), 'x', 'utf8');
  await fs.mkdir(path.join(job.domainDirectory, 'target.com'), { recursive: true });

  await cleanDomainDirectoryPreservingPrompt(job);

  assert.deepEqual(await fs.readdir(job.domainDirectory), ['promt.txt']);
});

test('copyTemplateSkeleton copies source files but skips prompt, log, node_modules, dist, and final build', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fast-template-copy-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const templateJob = await createJob(root, 'template.com');
  const targetJob = await createJob(root, 'target.com', 'Target prompt');

  await fs.writeFile(path.join(templateJob.domainDirectory, 'agent-output.log'), 'log', 'utf8');
  await fs.writeFile(path.join(templateJob.domainDirectory, 'package.json'), '{"scripts":{}}', 'utf8');
  await fs.mkdir(path.join(templateJob.domainDirectory, 'src'), { recursive: true });
  await fs.writeFile(path.join(templateJob.domainDirectory, 'src', 'main.js'), 'template.com', 'utf8');
  await fs.mkdir(path.join(templateJob.domainDirectory, 'node_modules', 'x'), { recursive: true });
  await fs.mkdir(path.join(templateJob.domainDirectory, 'dist'), { recursive: true });
  await fs.mkdir(path.join(templateJob.domainDirectory, 'template.com'), { recursive: true });
  await fs.writeFile(path.join(targetJob.domainDirectory, 'old.txt'), 'old', 'utf8');

  await copyTemplateSkeleton(templateJob, targetJob);

  assert.deepEqual((await fs.readdir(targetJob.domainDirectory)).sort(), [
    'package.json',
    'promt.txt',
    'src',
  ]);
  assert.equal(await fs.readFile(targetJob.promptPath, 'utf8'), 'Target prompt');
  assert.equal(await fs.readFile(path.join(targetJob.domainDirectory, 'src', 'main.js'), 'utf8'), 'template.com');
});

test('findTemplateDomainReferences reports adapted files that still mention template domain', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fast-template-leak-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const templateJob = await createJob(root, 'template.com');
  const targetJob = await createJob(root, 'target.com', 'Prompt mentions template.com but should be ignored');

  await fs.mkdir(path.join(targetJob.domainDirectory, 'src'), { recursive: true });
  await fs.writeFile(path.join(targetJob.domainDirectory, 'src', 'main.js'), 'template.com leak', 'utf8');
  await fs.writeFile(path.join(targetJob.domainDirectory, 'agent-output.log'), 'template.com log ignored', 'utf8');

  const matches = await findTemplateDomainReferences([templateJob, targetJob], templateJob);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].domain, 'target.com');
  assert.match(matches[0].filePath, /src\/main\.js$/);
});
