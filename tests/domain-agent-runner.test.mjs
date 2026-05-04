import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentPrompt } from '../scripts/lib/domain-agent-runner.mjs';

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
