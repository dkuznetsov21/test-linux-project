import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithConcurrency } from '../scripts/lib/process-runner.mjs';

test('runWithConcurrency does not exceed the configured active worker limit', async () => {
  let active = 0;
  let maxActive = 0;

  const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    active -= 1;

    return item * 2;
  });

  assert.equal(maxActive, 2);
  assert.deepEqual(results, [2, 4, 6, 8, 10]);
});

test('runWithConcurrency starts the next queued item when one worker finishes', async () => {
  const started = [];

  await runWithConcurrency([30, 5, 5], 2, async (item, index) => {
    started.push(index);
    await new Promise((resolve) => {
      setTimeout(resolve, item);
    });

    return index;
  });

  assert.deepEqual(started, [0, 1, 2]);
});
