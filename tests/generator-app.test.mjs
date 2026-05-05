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

  assert.deepEqual(events.slice(0, 5), [
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
