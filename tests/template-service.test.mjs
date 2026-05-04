import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTemplate } from '../scripts/lib/template-service.mjs';

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
