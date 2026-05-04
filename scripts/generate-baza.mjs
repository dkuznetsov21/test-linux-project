#!/usr/bin/env node

import { loadRuntimeConfig } from './lib/config.mjs';
import { BazaGeneratorApp } from './lib/generator-app.mjs';

const config = loadRuntimeConfig();
const app = new BazaGeneratorApp({
  agentConcurrencyLimit: config.agentConcurrencyLimit,
});

app.run().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});
