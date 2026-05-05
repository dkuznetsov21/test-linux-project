import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignPromptBatches,
  chunkArray,
  renderBatchedTemplate,
  renderTemplate,
} from '../scripts/lib/template-service.mjs';

test('renderTemplate replaces all required placeholders', () => {
  const template = [
    '{{DOMAINS}}',
    '{{GEO}}',
    '{{LANGUAGE}}',
    '{{TOPIC}}',
    '{{ADDRESS_BLOCK}}',
    '{{FINAL_PROMPT}}',
  ].join('\n');

  assert.equal(renderTemplate(template, {
    DOMAINS: 'example.com',
    GEO: 'US',
    LANGUAGE: 'English',
    TOPIC: 'Topic',
    ADDRESS_BLOCK: 'Address',
    FINAL_PROMPT: 'Prompt',
  }), [
    'example.com',
    'US',
    'English',
    'Topic',
    'Address',
    'Prompt',
  ].join('\n'));
});

test('renderTemplate rejects empty required values', () => {
  assert.throws(() => renderTemplate('{{DOMAINS}}', {
    DOMAINS: '',
    GEO: 'US',
    LANGUAGE: 'English',
    TOPIC: 'Topic',
    ADDRESS_BLOCK: 'Address',
    FINAL_PROMPT: 'Prompt',
  }), /DOMAINS cannot be empty/);
});

test('chunkArray splits domains by prompt batch size', () => {
  assert.deepEqual(chunkArray(['a', 'b'], 30), [['a', 'b']]);
  assert.deepEqual(
    chunkArray(Array.from({ length: 31 }, (_, index) => `d${index + 1}`), 30).map((chunk) => chunk.length),
    [30, 1],
  );
  assert.deepEqual(
    chunkArray(Array.from({ length: 61 }, (_, index) => `d${index + 1}`), 30).map((chunk) => chunk.length),
    [30, 30, 1],
  );
});

test('assignPromptBatches applies selected prompt file to every batch', () => {
  const domains = Array.from({ length: 30 }, (_, index) => `domain-${index + 1}.com`);
  const promptFile = { promptFileName: 'selected.txt', finalPrompt: 'Selected', promptPath: '/prompts/selected.txt' };
  const batches = assignPromptBatches(domains, promptFile);

  assert.deepEqual(batches.map((batch) => batch.domains.length), [30]);
  assert.deepEqual(batches.map((batch) => batch.promptFileName), ['selected.txt']);
  assert.deepEqual(batches.map((batch) => batch.finalPrompt), ['Selected']);
});

test('assignPromptBatches rejects more than one real batch of domains', () => {
  const domains = Array.from({ length: 31 }, (_, index) => `domain-${index + 1}.com`);
  const promptFile = { promptFileName: 'selected.txt', finalPrompt: 'Selected', promptPath: '/prompts/selected.txt' };

  assert.throws(
    () => assignPromptBatches(domains, promptFile),
    /Domains cannot contain more than 30 entries/,
  );
});

test('renderBatchedTemplate renders one template section per prompt batch', () => {
  const template = [
    'Domains:',
    '{{DOMAINS}}',
    'Address: {{ADDRESS_BLOCK}}',
    'Prompt: {{FINAL_PROMPT}}',
    '{{GEO}} {{LANGUAGE}} {{TOPIC}}',
  ].join('\n');
  const addressBlockByBatch = new Map([
    [1, 'Address 1'],
    [2, 'Address 2'],
  ]);
  const rendered = renderBatchedTemplate(template, {
    geo: 'US',
    language: 'English',
    topic: 'Finance',
    addressBlockByBatch,
  }, [
    {
      batchNumber: 1,
      domains: ['a.com', 'b.com'],
      finalPrompt: 'Prompt A',
    },
    {
      batchNumber: 2,
      domains: ['c.com'],
      finalPrompt: 'Prompt B',
    },
  ]);

  assert.match(rendered, /a\.com\nb\.com/);
  assert.match(rendered, /Address: Address 1/);
  assert.match(rendered, /Prompt: Prompt A/);
  assert.match(rendered, /c\.com/);
  assert.match(rendered, /Address: Address 2/);
  assert.match(rendered, /Prompt: Prompt B/);
  assert.doesNotMatch(rendered.split('\n\n')[0], /c\.com/);
});
