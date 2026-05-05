#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notifyTelegram } from './lib/telegram-notifier.mjs';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const message = [
  'Telegram notification test',
  'Project: dasha-project',
  `Time: ${new Date().toISOString()}`,
].join('\n');

const result = await notifyTelegram(projectDirectory, message, {
  output: process.stdout,
});

if (!result.ok) {
  process.exitCode = 1;
} else {
  process.stdout.write('Telegram test notification sent.\n');
}
