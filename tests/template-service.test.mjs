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

test('assignPromptBatches does not repeat prompt files in adjacent batches', () => {
  const domains = Array.from({ length: 61 }, (_, index) => `domain-${index + 1}.com`);
  const promptFiles = [
    { promptFileName: 'a.txt', finalPrompt: 'A', promptPath: '/prompts/a.txt' },
    { promptFileName: 'b.txt', finalPrompt: 'B', promptPath: '/prompts/b.txt' },
  ];
  const batches = assignPromptBatches(domains, promptFiles, {
    random: () => 0,
  });

  assert.deepEqual(batches.map((batch) => batch.domains.length), [30, 30, 1]);
  assert.notEqual(batches[0].promptFileName, batches[1].promptFileName);
  assert.notEqual(batches[1].promptFileName, batches[2].promptFileName);
});

test('assignPromptBatches rejects multiple batches with only one prompt file', () => {
  const domains = Array.from({ length: 31 }, (_, index) => `domain-${index + 1}.com`);
  const promptFiles = [
    { promptFileName: 'only.txt', finalPrompt: 'Only', promptPath: '/prompts/only.txt' },
  ];

  assert.throws(() => assignPromptBatches(domains, promptFiles), /At least 2 prompt/);
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
