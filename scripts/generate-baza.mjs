#!/usr/bin/env node

import { loadRuntimeConfig } from './lib/config.mjs';
import { FastTemplateGeneratorApp } from './lib/fast-template-generator-app.mjs';
import { BazaGeneratorApp } from './lib/generator-app.mjs';
import { InputSession } from './lib/input-session.mjs';

const WORKFLOW_COMMANDS = [
  {
    id: 'standard',
    label: 'Run Standard Workflow',
    description: 'Generate every domain from its full prompt.',
  },
  {
    id: 'fast-template',
    label: 'Run Prompt ZIP Fast Template Workflow',
    description: 'Generate the first domain fully, then adapt the remaining domains from its skeleton.',
  },
];

async function selectWorkflow() {
  const inputSession = new InputSession();

  try {
    return await inputSession.promptChoice(
      'Select command',
      WORKFLOW_COMMANDS,
      (command) => command.label,
      {
        formatDescription: (command) => command.description,
      },
    );
  } finally {
    inputSession.close();
  }
}

async function main() {
  const config = loadRuntimeConfig();
  const workflow = await selectWorkflow();
  const AppClass = workflow.id === 'fast-template'
    ? FastTemplateGeneratorApp
    : BazaGeneratorApp;
  const app = new AppClass({
    agentConcurrencyLimit: config.agentConcurrencyLimit,
  });

  await app.run();
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});
