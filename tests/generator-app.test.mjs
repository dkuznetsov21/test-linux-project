import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  BazaGeneratorApp,
  buildDomainAgentsStartedTelegramMessage,
  buildGeneratorTelegramMessage,
} from '../scripts/lib/generator-app.mjs';

test('buildGeneratorTelegramMessage formats generator report', () => {
  const message = buildGeneratorTelegramMessage({
    domainCount: 30,
    durationMilliseconds: 65_000,
    error: 'Agent failed',
    agentFailedCount: 2,
    agentSucceededCount: 28,
    outputDirectory: '/outputs/DA 05.05 US (Finance)',
    promptBatchCount: 1,
    promptFileName: 'v58fin-acid-pop.txt',
    status: 'failed',
    totalAgentCount: 30,
    validationFailedCount: 1,
    validationSucceededCount: 29,
  });

  assert.match(message, /Baza generator: failed/);
  assert.match(message, /Duration: 1m 05s/);
  assert.match(message, /Domains: 30/);
  assert.match(message, /Prompt batches: 1/);
  assert.match(message, /Agents total: 30/);
  assert.match(message, /Agents succeeded: 28/);
  assert.match(message, /Agents failed: 2/);
  assert.match(message, /Validation valid: 29/);
  assert.match(message, /Validation invalid: 1/);
  assert.match(message, /Prompt: v58fin-acid-pop\.txt/);
  assert.match(message, /Output: \/outputs\/DA 05\.05 US \(Finance\)/);
  assert.match(message, /Error: Agent failed/);
});

test('buildDomainAgentsStartedTelegramMessage formats domain agent start report', () => {
  const message = buildDomainAgentsStartedTelegramMessage({
    domainCount: 30,
    agentConcurrencyLimit: 15,
    outputDirectory: '/outputs/DA 05.05 US (Finance)',
    promptBatchCount: 1,
    promptFileName: 'v58fin-acid-pop.txt',
  });

  assert.equal(message, [
    'Baza generator: starting domain agents',
    'Domains: 30',
    'Prompt batches: 1',
    'Agent concurrency: 15',
    'Prompt: v58fin-acid-pop.txt',
    'Output: /outputs/DA 05.05 US (Finance)',
  ].join('\n'));
});

test('BazaGeneratorApp sends agent start notification before running agents and final summary after validation', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-generator-app-'));
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

  const events = [];
  const notifications = [];
  const inputSession = {
    close: () => events.push('input-close'),
    promptYesNo: async () => false,
    promptChoice: async () => ({
      finalPrompt: 'Final prompt',
      promptFileName: 'prompt.txt',
      promptPath: path.join(projectDirectory, 'prompts', 'prompt.txt'),
    }),
  };
  const outputValidator = {
    validatePromptFolders: async () => {
      events.push('validate-prompts');
      return { ok: true };
    },
    validate: async () => {
      events.push('validate-output');
      return {
        failures: [],
        successes: [{ domain: 'example.com' }, { domain: 'example.org' }],
      };
    },
  };
  const agentRunner = {
    run: async () => {
      events.push('agents-run');
      return {
        failures: [],
        successes: [{ domain: 'example.com' }, { domain: 'example.org' }],
      };
    },
  };
  const app = new BazaGeneratorApp({
    agentConcurrencyLimit: 7,
    agentRunner,
    ensureTelegramConfig: async () => events.push('ensure-telegram'),
    inputSession,
    notifyTelegram: async (_projectDirectory, text) => {
      events.push(text.includes('starting domain agents') ? 'notify-start' : 'notify-final');
      notifications.push(text);
      return { ok: true, skipped: false };
    },
    output: { write: () => {} },
    outputValidator,
    projectDirectory,
  });

  app.collectInput = async () => ({
    customerCode: 'DA',
    domains: ['example.com', 'example.org'],
    geo: 'US',
    language: 'English',
    topic: 'Finance',
  });
  app.runCodex = async () => {
    events.push('codex');
  };

  await app.run();

  assert.deepEqual(events.slice(0, 6), [
    'ensure-telegram',
    'codex',
    'validate-prompts',
    'notify-start',
    'agents-run',
    'validate-output',
  ]);
  assert.equal(events.at(-2), 'input-close');
  assert.equal(events.at(-1), 'notify-final');
  assert.match(notifications[0], /Baza generator: starting domain agents/);
  assert.match(notifications[0], /Agent concurrency: 7/);
  assert.match(notifications[1], /Baza generator: success/);
  assert.match(notifications[1], /Agents total: 2/);
  assert.match(notifications[1], /Agents succeeded: 2/);
  assert.match(notifications[1], /Agents failed: 0/);
  assert.match(notifications[1], /Validation valid: 2/);
  assert.match(notifications[1], /Validation invalid: 0/);
});

test('BazaGeneratorApp collects built sites only after agents and output validation succeed', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-generator-app-'));
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

  const events = [];
  const runCalls = [];
  const archiverArgs = [];
  const inputSession = {
    close: () => events.push('input-close'),
    promptYesNo: async (label) => {
      events.push(label.includes('Collect built sites') ? 'choice-collect' : 'choice-zip');
      return true;
    },
    promptChoice: async () => ({
      finalPrompt: 'Final prompt',
      promptFileName: 'prompt.txt',
      promptPath: path.join(projectDirectory, 'prompts', 'prompt.txt'),
    }),
  };
  const outputValidator = {
    validatePromptFolders: async () => {
      events.push('validate-prompts');
      return { ok: true };
    },
    validate: async () => {
      events.push('validate-output');
      return {
        failures: [],
        successes: [{ domain: 'example.com' }],
      };
    },
  };
  const agentRunner = {
    run: async () => {
      events.push('agents-run');
      return {
        failures: [],
        successes: [{ domain: 'example.com' }],
      };
    },
  };
  const builtSiteArchiver = {
    run: async () => {
      events.push('archive-run');
      runCalls.push('archive-run');
      return {
        archivePath: '/outputs/built-sites.zip',
        destinationDirectory: '/outputs/built-sites',
        moved: [],
      };
    },
  };
  const app = new BazaGeneratorApp({
    agentRunner,
    ensureTelegramConfig: async () => events.push('ensure-telegram'),
    inputSession,
    notifyTelegram: async () => ({ ok: true, skipped: false }),
    output: { write: () => {} },
    outputValidator,
    projectDirectory,
  });
  app.createBuiltSiteArchiver = (currentRunDirectory, createArchive) => {
    archiverArgs.push({ createArchive, currentRunDirectory });
    return builtSiteArchiver;
  };

  app.collectInput = async () => ({
    customerCode: 'DA',
    domains: ['example.com'],
    geo: 'US',
    language: 'English',
    topic: 'Finance',
  });
  app.runCodex = async () => {
    events.push('codex');
  };

  await app.run();

  assert.deepEqual(runCalls, ['archive-run']);
  assert.equal(archiverArgs.length, 1);
  assert.equal(archiverArgs[0].createArchive, true);
  assert.equal(path.dirname(archiverArgs[0].currentRunDirectory), path.join(projectDirectory, 'outputs'));
  assert.deepEqual(events.slice(0, 3), ['ensure-telegram', 'choice-collect', 'choice-zip']);
  assert.ok(events.indexOf('archive-run') > events.indexOf('validate-output'));
  assert.ok(events.indexOf('archive-run') < events.indexOf('input-close'));
});

test('BazaGeneratorApp skips built site collection when output validation fails', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-generator-app-'));
  const previousExitCode = process.exitCode;
  t.after(() => fs.rm(projectDirectory, { recursive: true, force: true }));
  t.after(() => {
    process.exitCode = previousExitCode;
  });

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

  const events = [];
  const inputSession = {
    close: () => events.push('input-close'),
    promptYesNo: async () => true,
    promptChoice: async () => ({
      finalPrompt: 'Final prompt',
      promptFileName: 'prompt.txt',
      promptPath: path.join(projectDirectory, 'prompts', 'prompt.txt'),
    }),
  };
  const app = new BazaGeneratorApp({
    agentRunner: {
      run: async () => ({
        failures: [],
        successes: [{ domain: 'example.com' }],
      }),
    },
    builtSiteArchiver: {
      run: async () => {
        events.push('archive-run');
      },
    },
    ensureTelegramConfig: async () => {},
    inputSession,
    notifyTelegram: async () => ({ ok: true, skipped: false }),
    output: { write: () => {} },
    outputValidator: {
      validatePromptFolders: async () => ({ ok: true }),
      validate: async () => ({
        failures: [{ domain: 'example.com' }],
        successes: [],
      }),
    },
    projectDirectory,
  });

  app.collectInput = async () => ({
    customerCode: 'DA',
    domains: ['example.com'],
    geo: 'US',
    language: 'English',
    topic: 'Finance',
  });
  app.runCodex = async () => {};

  await app.run();

  assert.equal(events.includes('archive-run'), false);
});

test('BazaGeneratorApp skips built site collection when collect choice is No after success', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-generator-app-'));
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

  const events = [];
  const app = new BazaGeneratorApp({
    agentRunner: {
      run: async () => ({
        failures: [],
        successes: [{ domain: 'example.com' }],
      }),
    },
    inputSession: {
      close: () => {},
      promptChoice: async () => ({
        finalPrompt: 'Final prompt',
        promptFileName: 'prompt.txt',
        promptPath: path.join(projectDirectory, 'prompts', 'prompt.txt'),
      }),
      promptYesNo: async () => false,
    },
    ensureTelegramConfig: async () => {},
    notifyTelegram: async () => ({ ok: true, skipped: false }),
    output: { write: () => {} },
    outputValidator: {
      validatePromptFolders: async () => ({ ok: true }),
      validate: async () => ({
        failures: [],
        successes: [{ domain: 'example.com' }],
      }),
    },
    projectDirectory,
  });

  app.collectInput = async () => ({
    customerCode: 'DA',
    domains: ['example.com'],
    geo: 'US',
    language: 'English',
    topic: 'Finance',
  });
  app.createBuiltSiteArchiver = () => {
    events.push('archive-created');
    return {
      run: async () => events.push('archive-run'),
    };
  };
  app.runCodex = async () => {};

  await app.run();

  assert.deepEqual(events, []);
});

test('BazaGeneratorApp ensures Telegram config before normal input collection', async (t) => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'baza-generator-app-'));
  t.after(() => fs.rm(projectDirectory, { recursive: true, force: true }));

  await fs.mkdir(path.join(projectDirectory, 'scripts'), { recursive: true });
  await fs.writeFile(path.join(projectDirectory, 'scripts', 'baza.txt'), '{{DOMAINS}}', 'utf8');

  const events = [];
  const app = new BazaGeneratorApp({
    ensureTelegramConfig: async () => events.push('ensure-telegram'),
    inputSession: {
      close: () => events.push('input-close'),
    },
    notifyTelegram: async () => ({ ok: true, skipped: false }),
    output: { write: () => {} },
    projectDirectory,
  });

  app.collectInput = async () => {
    events.push('collect-input');
    throw new Error('stop after order check');
  };

  await assert.rejects(() => app.run(), /stop after order check/);
  assert.deepEqual(events.slice(0, 2), ['ensure-telegram', 'collect-input']);
});
