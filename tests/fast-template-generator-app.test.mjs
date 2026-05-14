import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  FastTemplateGeneratorApp,
  buildFastTemplateTelegramMessage,
} from '../scripts/lib/fast-template-generator-app.mjs';

async function createProjectFixture(t) {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'fast-template-app-'));
  t.after(() => fs.rm(projectDirectory, { recursive: true, force: true }));

  await fs.mkdir(path.join(projectDirectory, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(projectDirectory, 'prompts'), { recursive: true });
  await fs.writeFile(path.join(projectDirectory, 'scripts', 'baza.txt'), [
    '{{DOMAINS}}',
    '{{GEO}}',
    '{{LANGUAGE}}',
    '{{TOPIC}}',
    '{{ADDRESS_BLOCK}}',
    '{{FINAL_PROMPT}}',
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(projectDirectory, 'prompts', 'prompt.txt'), 'Final prompt', 'utf8');

  return projectDirectory;
}

function createInputSession(events, projectDirectory, options = {}) {
  return {
    close: () => events.push('input-close'),
    promptChoice: async () => ({
      finalPrompt: 'Final prompt',
      promptFileName: 'prompt.txt',
      promptPath: path.join(projectDirectory, 'prompts', 'prompt.txt'),
    }),
    promptYesNo: async (label) => {
      if (label.includes('Collect built sites')) {
        return options.collectBuiltSites ?? false;
      }

      return options.createZip ?? false;
    },
  };
}

function installCommonAppHooks(app, domains, events) {
  app.collectInput = async () => ({
    customerCode: 'DA',
    domains,
    geo: 'US',
    language: 'English',
    topic: 'Finance',
  });
  app.runCodex = async (outputDirectory) => {
    events.push('codex');

    for (const domain of domains) {
      const domainDirectory = path.join(outputDirectory, domain);

      await fs.mkdir(domainDirectory, { recursive: true });
      await fs.writeFile(path.join(domainDirectory, 'promt.txt'), `Prompt for ${domain}`, 'utf8');
    }
  };
}

test('buildFastTemplateTelegramMessage formats fast template fields', () => {
  const message = buildFastTemplateTelegramMessage({
    adaptedDomainCount: 2,
    agentFailedCount: 0,
    agentSucceededCount: 3,
    domainCount: 3,
    durationMilliseconds: 65_000,
    outputDirectory: '/outputs/run',
    promptFileName: 'prompt.txt',
    status: 'success',
    templateDomain: 'alpha.com',
    templateLeakCount: 0,
    validationFailedCount: 0,
    validationSucceededCount: 3,
  });

  assert.match(message, /Baza fast template generator: success/);
  assert.match(message, /Template domain: alpha\.com/);
  assert.match(message, /Adapted domains: 2/);
  assert.match(message, /Template leaks: 0/);
});

test('FastTemplateGeneratorApp generates first domain fully, adapts remaining domains, then archives', async (t) => {
  const projectDirectory = await createProjectFixture(t);
  const events = [];
  const domains = ['alpha.com', 'beta.com'];
  const agentRunner = {
    runJobs: async (jobs, options = {}) => {
      events.push({
        domains: jobs.map((job) => job.domain),
        hasPromptBuilder: Boolean(options.promptBuilder),
        type: 'agents',
      });

      for (const job of jobs) {
        if (job.domain === 'alpha.com') {
          await fs.writeFile(path.join(job.domainDirectory, 'package.json'), '{"scripts":{}}', 'utf8');
          await fs.mkdir(path.join(job.domainDirectory, 'src'), { recursive: true });
          await fs.writeFile(path.join(job.domainDirectory, 'src', 'main.js'), 'alpha.com source', 'utf8');
        } else {
          assert.equal(await fs.readFile(path.join(job.domainDirectory, 'promt.txt'), 'utf8'), 'Prompt for beta.com');
          assert.equal(await fs.readFile(path.join(job.domainDirectory, 'src', 'main.js'), 'utf8'), 'alpha.com source');
          assert.match(options.promptBuilder(job, 'Prompt for beta.com'), /FAST TEMPLATE ADAPTATION MODE/);
          await fs.writeFile(path.join(job.domainDirectory, 'src', 'main.js'), 'beta.com source', 'utf8');
        }

        const buildDirectory = path.join(job.domainDirectory, job.domain);

        await fs.mkdir(buildDirectory, { recursive: true });
        await fs.writeFile(path.join(buildDirectory, 'index.html'), job.domain, 'utf8');
      }

      return {
        failures: [],
        successes: jobs,
      };
    },
  };
  const archiverCalls = [];
  const app = new FastTemplateGeneratorApp({
    agentConcurrencyLimit: 2,
    agentRunner,
    ensureTelegramConfig: async () => events.push('ensure-telegram'),
    inputSession: createInputSession(events, projectDirectory, {
      collectBuiltSites: true,
      createZip: true,
    }),
    notifyTelegram: async () => ({ ok: true, skipped: false }),
    output: { write: () => {} },
    projectDirectory,
  });

  app.createBuiltSiteArchiver = (currentRunDirectory, createArchive) => ({
    run: async () => {
      archiverCalls.push({ createArchive, currentRunDirectory });
      events.push('archive-run');
    },
  });
  installCommonAppHooks(app, domains, events);

  await app.run();

  assert.equal(events[0], 'ensure-telegram');
  assert.equal(events[1], 'codex');
  assert.deepEqual(events.filter((event) => event.type === 'agents'), [
    { domains: ['alpha.com'], hasPromptBuilder: false, type: 'agents' },
    { domains: ['beta.com'], hasPromptBuilder: true, type: 'agents' },
  ]);
  assert.equal(archiverCalls.length, 1);
  assert.equal(archiverCalls[0].createArchive, true);
  assert.equal(events.at(-2), 'archive-run');
  assert.equal(events.at(-1), 'input-close');
});

test('FastTemplateGeneratorApp stops when first template domain fails', async (t) => {
  const projectDirectory = await createProjectFixture(t);
  const previousExitCode = process.exitCode;
  t.after(() => {
    process.exitCode = previousExitCode;
  });
  const events = [];
  const app = new FastTemplateGeneratorApp({
    agentRunner: {
      runJobs: async (jobs) => {
        events.push({
          domains: jobs.map((job) => job.domain),
          type: 'agents',
        });

        return {
          failures: [{ ...jobs[0], error: 'failed' }],
          successes: [],
        };
      },
    },
    ensureTelegramConfig: async () => {},
    inputSession: createInputSession(events, projectDirectory),
    notifyTelegram: async () => ({ ok: true, skipped: false }),
    output: { write: () => {} },
    projectDirectory,
  });

  installCommonAppHooks(app, ['alpha.com', 'beta.com'], events);

  await app.run();

  assert.deepEqual(events.filter((event) => event.type === 'agents'), [
    { domains: ['alpha.com'], type: 'agents' },
  ]);
  assert.equal(process.exitCode, 1);
});

test('FastTemplateGeneratorApp fails validation when template domain leaks into adapted site', async (t) => {
  const projectDirectory = await createProjectFixture(t);
  const previousExitCode = process.exitCode;
  t.after(() => {
    process.exitCode = previousExitCode;
  });
  const events = [];
  const app = new FastTemplateGeneratorApp({
    agentRunner: {
      runJobs: async (jobs) => {
        events.push({
          domains: jobs.map((job) => job.domain),
          type: 'agents',
        });

        for (const job of jobs) {
          await fs.writeFile(path.join(job.domainDirectory, 'package.json'), '{}', 'utf8');
          await fs.mkdir(path.join(job.domainDirectory, 'src'), { recursive: true });
          await fs.writeFile(path.join(job.domainDirectory, 'src', 'main.js'), 'alpha.com leaked', 'utf8');
          await fs.mkdir(path.join(job.domainDirectory, job.domain), { recursive: true });
          await fs.writeFile(path.join(job.domainDirectory, job.domain, 'index.html'), job.domain, 'utf8');
        }

        return {
          failures: [],
          successes: jobs,
        };
      },
    },
    ensureTelegramConfig: async () => {},
    inputSession: createInputSession(events, projectDirectory, {
      collectBuiltSites: true,
    }),
    notifyTelegram: async () => ({ ok: true, skipped: false }),
    output: { write: () => {} },
    projectDirectory,
  });

  app.createBuiltSiteArchiver = () => ({
    run: async () => events.push('archive-run'),
  });
  installCommonAppHooks(app, ['alpha.com', 'beta.com'], events);

  await app.run();

  assert.equal(events.includes('archive-run'), false);
  assert.equal(process.exitCode, 1);
});
