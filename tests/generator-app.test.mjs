import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeneratorTelegramMessage } from '../scripts/lib/generator-app.mjs';

test('buildGeneratorTelegramMessage formats generator report', () => {
  const message = buildGeneratorTelegramMessage({
    domainCount: 30,
    durationMilliseconds: 65_000,
    error: 'Agent failed',
    outputDirectory: '/outputs/DA 05.05 US (Finance)',
    promptBatchCount: 1,
    promptFileName: 'v58fin-acid-pop.txt',
    status: 'failed',
  });

  assert.match(message, /Baza generator: failed/);
  assert.match(message, /Duration: 1m 05s/);
  assert.match(message, /Domains: 30/);
  assert.match(message, /Prompt batches: 1/);
  assert.match(message, /Prompt: v58fin-acid-pop\.txt/);
  assert.match(message, /Output: \/outputs\/DA 05\.05 US \(Finance\)/);
  assert.match(message, /Error: Agent failed/);
});
