#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InputSession } from './lib/input-session.mjs';
import { setupTelegramConfig } from './lib/telegram-notifier.mjs';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputSession = new InputSession();

try {
  await setupTelegramConfig(projectDirectory, inputSession, process.stdout);
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  inputSession.close();
}
