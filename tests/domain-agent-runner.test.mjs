import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgentPrompt,
  buildTemplateAdaptationPrompt,
  DomainAgentRunner,
} from '../scripts/lib/domain-agent-runner.mjs';

test('buildAgentPrompt adds domain structure guard without changing prompt files', () => {
  const prompt = 'Project root folder MUST be exactly: /example.com';
  const rendered = buildAgentPrompt({
    domain: 'example.com',
  }, prompt);

  assert.match(rendered, /already running inside the outer folder/);
  assert.match(rendered, /Treat any instruction that says \/example\.com as this current working directory/);
  assert.match(rendered, /only nested domain-named folder allowed here is \.\/example\.com\//);
  assert.match(rendered, /ORIGINAL PROMPT:\nProject root folder MUST be exactly: \/example\.com/);
});

test('buildTemplateAdaptationPrompt tells agent to reuse skeleton and replace template domain', () => {
  const rendered = buildTemplateAdaptationPrompt({
    domain: 'target.com',
  }, 'Target prompt', {
    templateDomain: 'template.com',
  });

  assert.match(rendered, /FAST TEMPLATE ADAPTATION MODE/);
  assert.match(rendered, /Do not recreate the project from scratch/);
  assert.match(rendered, /template\.com/);
  assert.match(rendered, /target\.com/);
  assert.match(rendered, /TARGET ORIGINAL PROMPT:\nTarget prompt/);
});

test('DomainAgentRunner.runJobs accepts a custom prompt builder', async () => {
  const calls = [];
  const runner = new DomainAgentRunner({
    concurrencyLimit: 1,
    output: { write: () => {} },
  });
  const jobs = [{
    domain: 'target.com',
    logPath: '/tmp/target.log',
    promptPath: '/tmp/target/promt.txt',
  }];

  runner.runAgentJob = async (job, options) => {
    calls.push(options.promptBuilder(job, 'Prompt'));

    return {
      ...job,
      error: null,
      ok: true,
    };
  };

  const summary = await runner.runJobs(jobs, {
    promptBuilder: (job, prompt) => `${job.domain}: ${prompt}`,
  });

  assert.deepEqual(calls, ['target.com: Prompt']);
  assert.equal(summary.successes.length, 1);
  assert.equal(summary.failures.length, 0);
});
