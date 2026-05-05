import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { InputSession } from '../scripts/lib/input-session.mjs';

test('InputSession promptChoice selects by number in non-interactive mode', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const session = new InputSession(input, output);
  const choices = [
    { promptFileName: 'first.txt' },
    { promptFileName: 'second.txt' },
  ];

  input.end('2\n');

  const selected = await session.promptChoice('Select prompt file', choices, (choice) => choice.promptFileName);

  assert.equal(selected.promptFileName, 'second.txt');
  session.close();
});

test('InputSession promptChoice rejects invalid non-interactive number', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const session = new InputSession(input, output);

  input.end('3\n');

  await assert.rejects(
    session.promptChoice('Select prompt file', ['a.txt', 'b.txt']),
    /Select prompt file number must be between 1 and 2/,
  );
  session.close();
});
