#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InputSession } from './lib/input-session.mjs';
import {
  fetchTelegramChatCandidates,
  saveTelegramConfig,
} from './lib/telegram-notifier.mjs';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputSession = new InputSession();

function formatChat(chat) {
  return `${chat.title} (${chat.type}, ${chat.chatId})`;
}

try {
  process.stdout.write('Fetching Telegram chats from bot updates...\n');
  const candidates = await fetchTelegramChatCandidates();

  if (candidates.length === 0) {
    throw new Error('No Telegram chats found. Add the bot to a group/channel, send a message there, then run setup again.');
  }

  const selected = await inputSession.promptChoice('Select Telegram chat', candidates, formatChat);
  const config = await saveTelegramConfig(projectDirectory, selected);

  process.stdout.write(`Telegram chat saved: ${formatChat(selected)}\n`);
  process.stdout.write(`Config file: ${config.configPath}\n`);
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  inputSession.close();
}
