import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_AGENT_CONCURRENCY_LIMIT,
  TELEGRAM_BOT_TOKEN,
  loadRuntimeConfig,
  parsePositiveInteger,
} from '../scripts/lib/config.mjs';

test('Telegram bot token is configured in source for local personal use', () => {
  assert.equal(TELEGRAM_BOT_TOKEN, '8648217212:AAFXZfiV02NfaD7l3-0WNLU47M4aufL4GkA');
});

test('parsePositiveInteger returns fallback for missing values', () => {
  assert.equal(parsePositiveInteger(undefined, 15), 15);
  assert.equal(parsePositiveInteger('', 15), 15);
});

test('parsePositiveInteger accepts positive integers', () => {
  assert.equal(parsePositiveInteger('30', 15), 30);
});

test('parsePositiveInteger rejects invalid values', () => {
  assert.throws(() => parsePositiveInteger('0', 15), /must be a positive integer/);
  assert.throws(() => parsePositiveInteger('1.5', 15), /must be a positive integer/);
  assert.throws(() => parsePositiveInteger('abc', 15), /must be a positive integer/);
});

test('loadRuntimeConfig uses default agent concurrency', () => {
  assert.deepEqual(loadRuntimeConfig({}), {
    agentConcurrencyLimit: DEFAULT_AGENT_CONCURRENCY_LIMIT,
  });
});

test('loadRuntimeConfig reads AGENT_CONCURRENCY override', () => {
  assert.deepEqual(loadRuntimeConfig({ AGENT_CONCURRENCY: '22' }), {
    agentConcurrencyLimit: 22,
  });
});
