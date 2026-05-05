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

test('InputSession promptYesNo defaults to No on empty non-interactive input', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const session = new InputSession(input, output);

  input.end('\n');

  const selected = await session.promptYesNo('Collect built sites after successful run?');

  assert.equal(selected, false);
  session.close();
});

test('InputSession promptYesNo accepts yes in non-interactive mode', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const session = new InputSession(input, output);

  input.end('yes\n');

  const selected = await session.promptYesNo('Collect built sites after successful run?');

  assert.equal(selected, true);
  session.close();
});

test('InputSession promptYesNo accepts y and n aliases in non-interactive mode', async () => {
  const yesInput = new PassThrough();
  const yesOutput = new PassThrough();
  const yesSession = new InputSession(yesInput, yesOutput);

  yesInput.end('y\n');

  assert.equal(await yesSession.promptYesNo('Create ZIP after collecting built sites?'), true);
  yesSession.close();

  const noInput = new PassThrough();
  const noOutput = new PassThrough();
  const noSession = new InputSession(noInput, noOutput);

  noInput.end('n\n');

  assert.equal(await noSession.promptYesNo('Create ZIP after collecting built sites?', true), false);
  noSession.close();
});
