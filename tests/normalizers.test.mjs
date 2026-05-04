import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOutputDirectoryName,
  formatDuration,
  normalizeCustomerCode,
  normalizeDomains,
  normalizeGeo,
  normalizeTopicForDirectory,
  sanitizeInput,
} from '../scripts/lib/normalizers.mjs';

test('normalizeDomains accepts new lines and commas', () => {
  assert.deepEqual(
    normalizeDomains('alpha.com\n beta.com, gamma.com\n\n'),
    ['alpha.com', 'beta.com', 'gamma.com'],
  );
});

test('normalizeGeo uppercases and maps UK alias to GB', () => {
  assert.equal(normalizeGeo(' uk '), 'GB');
  assert.equal(normalizeGeo('us'), 'US');
});

test('normalizeCustomerCode keeps only uppercase alphanumeric characters', () => {
  assert.equal(normalizeCustomerCode(' d-a 42 '), 'DA42');
});

test('normalizeTopicForDirectory strips unsafe path characters', () => {
  assert.equal(normalizeTopicForDirectory('  IT: Marketing / Course?  '), 'IT Marketing Course');
});

test('buildOutputDirectoryName keeps existing folder naming format', () => {
  const date = new Date('2026-04-06T10:20:30.000Z');

  assert.equal(
    buildOutputDirectoryName({ customerCode: 'DA', geo: 'US', topic: 'Test Topic' }, date),
    'DA 06.04 US (Test Topic)',
  );
});

test('sanitizeInput removes bracketed paste and ansi control sequences', () => {
  assert.equal(sanitizeInput('\u001b[200~hello\u001b[201~\u001b[31m\r'), 'hello');
});

test('formatDuration formats minutes and hours', () => {
  assert.equal(formatDuration(65000), '1m 05s');
  assert.equal(formatDuration(3661000), '1h 01m 01s');
});
